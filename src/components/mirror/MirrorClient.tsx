"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarModuleData } from "@/lib/calendar";
import { MIRROR_ID_STORAGE_KEY } from "@/lib/mirror-device";
import type { ModuleSettingsMap } from "@/lib/module-config";
import type { TodoistModuleData } from "@/lib/todoist";
import type { WeatherModuleData } from "@/lib/weather";

type TimerView = {
  id: string;
  label: string | null;
  durationSeconds: number;
  endsAt: string;
  greetingName: string | null;
};

type MirrorClientProps = {
  mirrorId: string;
  mirrorName: string;
  modules: ModuleSettingsMap;
  weather: WeatherModuleData | null;
  calendar: CalendarModuleData | null;
  todoist: TodoistModuleData | null;
  initialTimers: TimerView[];
};

function formatRemainingTime(endsAt: string) {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(endsAt).getTime() - Date.now()) / 1000),
  );

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatMinutes(durationSeconds: number) {
  if (durationSeconds < 60) {
    return 0;
  }

  return Math.max(1, Math.round(durationSeconds / 60));
}

function formatTimerLabel(durationSeconds: number) {
  if (durationSeconds < 60) {
    return `${durationSeconds}s`;
  }

  return `${formatMinutes(durationSeconds)} min`;
}

function formatClock(
  now: Date,
  config: {
    hourFormat: "12" | "24";
    showSeconds: boolean;
  },
) {
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    second: config.showSeconds ? "2-digit" : undefined,
    hour12: config.hourFormat === "12",
  }).format(now);
}

function weatherIconToEmoji(icon: string) {
  const prefix = icon.slice(0, 2);

  switch (prefix) {
    case "01":
      return "☀️";
    case "02":
      return "🌤️";
    case "03":
      return "⛅";
    case "04":
      return "☁️";
    case "09":
      return "🌧️";
    case "10":
      return "🌦️";
    case "11":
      return "⛈️";
    case "13":
      return "❄️";
    case "50":
      return "🌫️";
    default:
      return "🌡️";
  }
}

function moduleLayoutStyle(layout: { x: number; y: number; w: number; h: number }) {
  return {
    gridColumn: `${layout.x} / span ${layout.w}`,
    gridRow: `${layout.y} / span ${layout.h}`,
  };
}

function dayDiff(targetDateIso: string, now: Date) {
  const nowDate = new Date(now);
  nowDate.setHours(0, 0, 0, 0);
  const target = new Date(`${targetDateIso}T00:00:00`);
  return Math.round((target.getTime() - nowDate.getTime()) / (24 * 60 * 60 * 1000));
}

function formatAttentionCounter({
  targetDate,
  now,
}: {
  targetDate: string;
  now: Date;
}) {
  const delta = dayDiff(targetDate, now);

  if (delta === 0) {
    return {
      count: 0,
      subtitle: "vandaag",
    };
  }

  if (delta > 0) {
    return {
      count: delta,
      subtitle: "dagen tot",
    };
  }

  return {
    count: Math.abs(delta),
    subtitle: "dagen geleden",
  };
}

function formatShortLocation(location: string) {
  const firstPart =
    location
      .split(",")
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? location.trim();

  if (firstPart.length <= 28) {
    return firstPart;
  }

  return `${firstPart.slice(0, 25).trim()}...`;
}

function formatCalendarSourceLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "alle kalenders") {
    return "Bron: alle kalenders";
  }

  return `Bron: ${value}`;
}

export function MirrorClient({
  mirrorId,
  mirrorName,
  modules,
  weather,
  calendar,
  todoist,
  initialTimers,
}: MirrorClientProps) {
  const [now, setNow] = useState(() => new Date());
  const [timers, setTimers] = useState(initialTimers);
  const [todoistData, setTodoistData] = useState(todoist);
  const announcedIdsRef = useRef(new Set<string>());

  useEffect(() => {
    window.localStorage.setItem(MIRROR_ID_STORAGE_KEY, mirrorId);
  }, [mirrorId]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    let socket: WebSocket | null = null;
    let reconnectTimeout: number | null = null;
    let closedByCleanup = false;

    const connect = () => {
      socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

      socket.addEventListener("open", () => {
        socket?.send(JSON.stringify({ type: "subscribe", mirrorId }));
      });

      socket.addEventListener("message", (event) => {
        let payload: { type?: string; timer?: TimerView } | null = null;

        try {
          payload = JSON.parse(event.data) as { type?: string; timer?: TimerView };
        } catch {
          payload = null;
        }

        if (payload?.type === "timer_created" && payload.timer) {
          setTimers((current) => [payload.timer as TimerView, ...current]);
        }
      });

      socket.addEventListener("close", () => {
        if (closedByCleanup) {
          return;
        }

        reconnectTimeout = window.setTimeout(connect, 1500);
      });
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimeout) {
        window.clearTimeout(reconnectTimeout);
      }
      socket?.close();
    };
  }, [mirrorId]);

  useEffect(() => {
    setTodoistData(todoist);
  }, [todoist]);

  useEffect(() => {
    if (!modules.TODOIST.enabled) {
      return;
    }

    let stopped = false;

    const loadTodoist = async () => {
      const response = await fetch(`/api/mirrors/${mirrorId}/todoist`, {
        cache: "no-store",
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | {
            todoist?: TodoistModuleData | null;
          }
        | null;

      if (stopped) {
        return;
      }

      setTodoistData(payload?.todoist ?? null);
    };

    const timeout = window.setTimeout(() => {
      loadTodoist().catch(() => undefined);
    }, 0);

    const interval = window.setInterval(() => {
      loadTodoist().catch(() => undefined);
    }, Math.max(10, modules.TODOIST.config.pollSeconds) * 1000);

    return () => {
      stopped = true;
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [mirrorId, modules.TODOIST.enabled, modules.TODOIST.config.pollSeconds]);

  useEffect(() => {
    for (const timer of timers) {
      if (announcedIdsRef.current.has(timer.id)) {
        continue;
      }

      if (new Date(timer.endsAt).getTime() > Date.now()) {
        continue;
      }

      announcedIdsRef.current.add(timer.id);

      if ("speechSynthesis" in window) {
        const greetingName = timer.greetingName ?? "daar";
        const durationLabel =
          timer.durationSeconds < 60
            ? `${timer.durationSeconds} seconden`
            : `${Math.round(timer.durationSeconds / 60)} minuten`;
        const message = `Hoi ${greetingName}, de timer van ${durationLabel} is klaar.`;
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = "nl-NL";
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [timers, now]);

  const runningTimers = useMemo(
    () =>
      timers
        .filter((timer) => new Date(timer.endsAt).getTime() > now.getTime())
        .sort(
          (a, b) =>
            new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime(),
        ),
    [timers, now],
  );

  const maxVisibleTimers = modules.TIMERS.config.maxVisible;
  const activeTimer = runningTimers[0] ?? null;
  const secondaryTimers = runningTimers.slice(1, maxVisibleTimers);
  const timersDisplayMode = modules.TIMERS.config.displayMode;
  const showTimersModule =
    modules.TIMERS.enabled &&
    (timersDisplayMode !== "focus" || runningTimers.length > 0);
  const timerFocusIsActive =
    modules.TIMERS.enabled && timersDisplayMode === "focus" && Boolean(activeTimer);
  const clockText = formatClock(now, {
    hourFormat: modules.CLOCK.config.hourFormat,
    showSeconds: modules.CLOCK.config.showSeconds,
  });
  const calendarTitle = modules.CALENDAR.config.title.trim();
  const todoistTitle = modules.TODOIST.config.title.trim();
  const calendarFilter = modules.CALENDAR.config.calendarName.trim();
  const calendarSourceLabel = calendar
    ? calendarFilter
      ? formatCalendarSourceLabel(calendar.calendarName)
      : null
    : null;

  if (timerFocusIsActive && activeTimer) {
    return (
      <main className="mirror-screen mirror-screen-focus">
        <section className="timer-focus-screen">
          <p className="timer-focus-screen-label">
            {activeTimer.label ?? `Timer ${formatTimerLabel(activeTimer.durationSeconds)}`}
          </p>
          <p className="timer-focus-screen-time">{formatRemainingTime(activeTimer.endsAt)}</p>
          {secondaryTimers.length > 0 ? (
            <ul className="timer-focus-list">
              {secondaryTimers.map((timer) => (
                <li key={timer.id} className="timer-focus-row">
                  <span>{timer.label ?? `Timer ${formatTimerLabel(timer.durationSeconds)}`}</span>
                  <strong>{formatRemainingTime(timer.endsAt)}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="mirror-screen">
      <header className="mirror-header">
        <h1>{mirrorName}</h1>
      </header>

      <section className="mirror-grid">
        {modules.CLOCK.enabled ? (
          <article
            className="mirror-widget widget-clock"
            style={moduleLayoutStyle(modules.CLOCK.config.layout)}
          >
            <p className={`clock-time ${modules.CLOCK.config.size === "large" ? "clock-large" : ""}`}>
              {clockText}
            </p>
          </article>
        ) : null}

        {modules.WEATHER.enabled ? (
          <article
            className="mirror-widget"
            style={moduleLayoutStyle(modules.WEATHER.config.layout)}
          >
            {weather ? (
              <>
                {modules.WEATHER.config.showCurrent && weather.current ? (
                  <div className="weather-current">
                    <p className="weather-temp">{weather.current.temperatureC}°C</p>
                    <p>
                      {weatherIconToEmoji(weather.current.icon)} {weather.current.description}
                    </p>
                    <p className="muted">{weather.current.city}</p>
                  </div>
                ) : null}

                {modules.WEATHER.config.showForecast && weather.forecast.length > 0 ? (
                  <ul className="forecast-row">
                    {weather.forecast.slice(0, modules.WEATHER.config.forecastDays).map((day) => (
                      <li key={day.dateIso} className="forecast-item">
                        <span className="muted">{day.dayLabel}</span>
                        <strong className="forecast-icon">{weatherIconToEmoji(day.icon)}</strong>
                        <span className="muted">{day.maxTempC}°</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="muted">Geen weerdata. Stel locatie + API key in.</p>
            )}
          </article>
        ) : null}

        {modules.CALENDAR.enabled ? (
          <article
            className="mirror-widget widget-calendar"
            style={moduleLayoutStyle(modules.CALENDAR.config.layout)}
          >
            {calendar ? (
              <>
                {calendarTitle ? <p className="module-custom-title">{calendarTitle}</p> : null}
                {calendarSourceLabel ? (
                  <p className="muted calendar-source">{calendarSourceLabel}</p>
                ) : null}
                {calendar.events.length > 0 ? (
                  <ul className="calendar-list">
                    {calendar.events.slice(0, modules.CALENDAR.config.maxVisible).map((event) => (
                      <li key={`${event.id}:${event.startIso}`} className="calendar-row">
                        <div>
                          <p className="calendar-title">{event.title}</p>
                          <p className="muted calendar-meta">
                            {event.dayLabel} · {event.timeLabel}
                            {modules.CALENDAR.config.showLocation && event.location
                              ? ` (${formatShortLocation(event.location)})`
                              : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Geen afspraken in dit bereik.</p>
                )}
              </>
            ) : (
              <p className="muted">Geen kalenderdata. Controleer iCloud CalDAV credentials.</p>
            )}
          </article>
        ) : null}

        {modules.TODOIST.enabled ? (
          <article
            className="mirror-widget"
            style={moduleLayoutStyle(modules.TODOIST.config.layout)}
          >
            {todoistTitle ? <p className="module-custom-title">{todoistTitle}</p> : null}
            {todoistData ? (
              todoistData.tasks.length > 0 ? (
                <ul className="todoist-list">
                  {todoistData.tasks.slice(0, modules.TODOIST.config.maxVisible).map((task) => (
                    <li key={task.id} className="todoist-row">
                      <p className="todoist-content">{task.content}</p>
                      {task.dueLabel ? <p className="muted">{task.dueLabel}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Geen open Todoist taken.</p>
              )
            ) : (
              <p className="muted">Geen Todoist data. Controleer token/project in .env.</p>
            )}
          </article>
        ) : null}

        {showTimersModule ? (
          <article
            className="mirror-widget"
            style={moduleLayoutStyle(modules.TIMERS.config.layout)}
          >
            {runningTimers.length === 0 ? (
              <p className="muted">Geen actieve timers</p>
            ) : (
              <ul className="timer-list">
                {runningTimers.slice(0, maxVisibleTimers).map((timer) => (
                  <li key={timer.id} className="timer-row">
                    <span>{timer.label ?? `Timer ${formatTimerLabel(timer.durationSeconds)}`}</span>
                    <strong>{formatRemainingTime(timer.endsAt)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ) : null}

        {modules.ATTENTION.enabled ? (
          <article
            className="mirror-widget"
            style={moduleLayoutStyle(modules.ATTENTION.config.layout)}
          >
            {modules.ATTENTION.config.items.length === 0 ? (
              <p className="muted">Nog geen aandachtspunten ingesteld.</p>
            ) : (
              <ul className="attention-list">
                {modules.ATTENTION.config.items.map((item) => {
                  const counter = formatAttentionCounter({
                    targetDate: item.targetDate,
                    now,
                  });

                  return (
                    <li key={item.id} className="attention-row">
                      <p className="attention-count">{counter.count}</p>
                      <p className="attention-subtitle">{counter.subtitle}</p>
                      <p className="attention-title">{item.label}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        ) : null}
      </section>
    </main>
  );
}
