"use client";

import { useMemo, useState } from "react";
import type {
  AttentionCounterItem,
  AttentionModuleConfig,
  CalendarModuleConfig,
  ClockModuleConfig,
  MirrorModuleType,
  ModuleSettingsListItem,
  TodoistModuleConfig,
  TimersModuleConfig,
  WeatherModuleConfig,
} from "@/lib/module-config";

type MirrorModuleTogglesProps = {
  mirrorId: string;
  initialModules: ModuleSettingsListItem[];
  gridRows?: number;
};

type EditableModule = {
  type: MirrorModuleType;
  enabled: boolean;
  config:
    | ClockModuleConfig
    | WeatherModuleConfig
    | TimersModuleConfig
    | CalendarModuleConfig
    | AttentionModuleConfig
    | TodoistModuleConfig;
};

const LABELS: Record<MirrorModuleType, string> = {
  CLOCK: "Klok",
  WEATHER: "Weer",
  TIMERS: "Timers",
  CALENDAR: "Agenda",
  ATTENTION: "Aandacht",
  TODOIST: "Todoist",
};

type SaveState = {
  busyAction: "save" | "test" | null;
  error: string | null;
  info: string | null;
};

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function createAttentionItem(): AttentionCounterItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label: "",
    targetDate: todayIso(),
    active: true,
  };
}

export function MirrorModuleToggles({
  mirrorId,
  initialModules,
  gridRows = 12,
}: MirrorModuleTogglesProps) {
  const maxGridRows = Math.max(12, gridRows);
  const [modules, setModules] = useState<EditableModule[]>(
    initialModules as EditableModule[],
  );
  const [saveStateByType, setSaveStateByType] = useState<
    Record<MirrorModuleType, SaveState>
  >({
    CLOCK: { busyAction: null, error: null, info: null },
    WEATHER: { busyAction: null, error: null, info: null },
    TIMERS: { busyAction: null, error: null, info: null },
    CALENDAR: { busyAction: null, error: null, info: null },
    ATTENTION: { busyAction: null, error: null, info: null },
    TODOIST: { busyAction: null, error: null, info: null },
  });

  const modulesByType = useMemo(
    () => new Map(modules.map((module) => [module.type, module])),
    [modules],
  );
  const sortedModules = useMemo(
    () =>
      [...modules].sort((a, b) =>
        LABELS[a.type].localeCompare(LABELS[b.type], "nl-NL"),
      ),
    [modules],
  );

  function setModule(
    type: MirrorModuleType,
    updater: (current: EditableModule) => EditableModule,
  ) {
    setModules((current) =>
      current.map((module) => (module.type === type ? updater(module) : module)),
    );
  }

  function setSaveState(type: MirrorModuleType, next: Partial<SaveState>) {
    setSaveStateByType((current) => ({
      ...current,
      [type]: {
        ...current[type],
        ...next,
      },
    }));
  }

  async function saveModule(type: MirrorModuleType) {
    const moduleState = modulesByType.get(type);

    if (!moduleState) {
      return;
    }

    setSaveState(type, { busyAction: "save", error: null, info: null });

    const response = await fetch(`/api/mirrors/${mirrorId}/modules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        enabled: moduleState.enabled,
        config: moduleState.config,
      }),
    });

    setSaveState(type, { busyAction: null });

    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          module?: {
            type: MirrorModuleType;
            enabled: boolean;
            config: ModuleSettingsListItem["config"];
          };
        }
      | null;

    if (!response.ok || !payload?.module) {
      setSaveState(type, {
        error: payload?.error ?? "Opslaan mislukt",
      });
      return;
    }

    setModules((current) =>
      current.map((module) =>
        module.type === type
          ? {
              type,
              enabled: payload.module?.enabled ?? module.enabled,
              config: payload.module?.config ?? module.config,
            }
          : module,
      ),
    );

    setSaveState(type, { info: "Opgeslagen", error: null });
    window.setTimeout(() => {
      setSaveState(type, { info: null });
    }, 1500);
  }

  async function testTimerAnnouncement(config: TimersModuleConfig) {
    setSaveState("TIMERS", {
      busyAction: "test",
      error: null,
      info: null,
    });

    const response = await fetch(`/api/mirrors/${mirrorId}/timer-announcement-test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        announcementVolume: config.announcementVolume,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
        }
      | null;

    if (!response.ok) {
      setSaveState("TIMERS", {
        busyAction: null,
        error: payload?.error ?? "Testmelding versturen mislukt",
        info: null,
      });
      return;
    }

    setSaveState("TIMERS", {
      busyAction: null,
      error: null,
      info: "Testmelding verstuurd",
    });
    window.setTimeout(() => {
      setSaveState("TIMERS", { info: null });
    }, 1500);
  }

  return (
    <div className="module-config-list">
      {sortedModules.map((module) => {
        const saveState = saveStateByType[module.type];

        return (
          <article key={module.type} className="module-config-card">
            <details className="module-config-disclosure">
              <summary className="module-config-summary">
                <span className="module-config-summary-title">{LABELS[module.type]}</span>
                <span className={`status-chip ${module.enabled ? "ok" : "warn"}`}>
                  {module.enabled ? "Actief" : "Uit"}
                </span>
              </summary>

              <div className="module-config-disclosure-body">
                <label className="inline-checkbox">
                  <input
                    type="checkbox"
                    checked={module.enabled}
                    onChange={(event) =>
                      setModule(module.type, (current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }))
                    }
                  />
                  <span>Actief</span>
                </label>

                <div className="module-config-grid">
                  {module.type === "CLOCK" ? (
                    <ClockSettings
                      config={module.config as ClockModuleConfig}
                      gridRows={maxGridRows}
                      onChange={(nextConfig) =>
                        setModule("CLOCK", (current) => ({
                          ...current,
                          config: nextConfig,
                        }))
                      }
                    />
                  ) : null}

                  {module.type === "WEATHER" ? (
                    <WeatherSettings
                      config={module.config as WeatherModuleConfig}
                      gridRows={maxGridRows}
                      onChange={(nextConfig) =>
                        setModule("WEATHER", (current) => ({
                          ...current,
                          config: nextConfig,
                        }))
                      }
                    />
                  ) : null}

                  {module.type === "TIMERS" ? (
                    <TimerSettings
                      config={module.config as TimersModuleConfig}
                      gridRows={maxGridRows}
                      onChange={(nextConfig) =>
                        setModule("TIMERS", (current) => ({
                          ...current,
                          config: nextConfig,
                        }))
                      }
                    />
                  ) : null}

                  {module.type === "CALENDAR" ? (
                    <CalendarSettings
                      config={module.config as CalendarModuleConfig}
                      gridRows={maxGridRows}
                      onChange={(nextConfig) =>
                        setModule("CALENDAR", (current) => ({
                          ...current,
                          config: nextConfig,
                        }))
                      }
                    />
                  ) : null}

                  {module.type === "ATTENTION" ? (
                    <AttentionSettings
                      config={module.config as AttentionModuleConfig}
                      gridRows={maxGridRows}
                      onChange={(nextConfig) =>
                        setModule("ATTENTION", (current) => ({
                          ...current,
                          config: nextConfig,
                        }))
                      }
                    />
                  ) : null}

                  {module.type === "TODOIST" ? (
                    <TodoistSettings
                      config={module.config as TodoistModuleConfig}
                      gridRows={maxGridRows}
                      onChange={(nextConfig) =>
                        setModule("TODOIST", (current) => ({
                          ...current,
                          config: nextConfig,
                        }))
                      }
                    />
                  ) : null}
                </div>

                <div className="module-actions">
                  <button
                    type="button"
                    className="button-link button-small"
                    onClick={() => saveModule(module.type)}
                    disabled={saveState.busyAction !== null}
                  >
                    {saveState.busyAction === "save" ? "Opslaan..." : "Opslaan"}
                  </button>
                  {module.type === "TIMERS" ? (
                    <button
                      type="button"
                      className="button-link button-small"
                      onClick={() =>
                        testTimerAnnouncement(module.config as TimersModuleConfig)
                      }
                      disabled={saveState.busyAction !== null}
                    >
                      {saveState.busyAction === "test" ? "Testen..." : "Test melding"}
                    </button>
                  ) : null}
                  {saveState.error ? <p className="notice error">{saveState.error}</p> : null}
                  {saveState.info ? <p className="notice success">{saveState.info}</p> : null}
                </div>
              </div>
            </details>
          </article>
        );
      })}
    </div>
  );
}

function LayoutEditor({
  layout,
  gridRows,
  onChange,
}: {
  layout: { x: number; y: number; w: number; h: number };
  gridRows: number;
  onChange: (next: { x: number; y: number; w: number; h: number }) => void;
}) {
  return (
    <details className="details-panel">
      <summary className="details-summary">
        Plaatsing: x{layout.x}, y{layout.y}, b{layout.w}, h{layout.h}
      </summary>
      <div className="details-body">
        <div className="layout-grid">
          <label>
            X
            <input
              type="number"
              min={1}
              max={12}
              value={layout.x}
              onChange={(event) =>
                onChange({ ...layout, x: toNumber(event.target.value, layout.x) })
              }
            />
          </label>
          <label>
            Y
            <input
              type="number"
              min={1}
              max={gridRows}
              value={layout.y}
              onChange={(event) =>
                onChange({ ...layout, y: toNumber(event.target.value, layout.y) })
              }
            />
          </label>
          <label>
            Breedte
            <input
              type="number"
              min={1}
              max={12}
              value={layout.w}
              onChange={(event) =>
                onChange({ ...layout, w: toNumber(event.target.value, layout.w) })
              }
            />
          </label>
          <label>
            Hoogte
            <input
              type="number"
              min={1}
              max={gridRows}
              value={layout.h}
              onChange={(event) =>
                onChange({ ...layout, h: toNumber(event.target.value, layout.h) })
              }
            />
          </label>
        </div>
      </div>
    </details>
  );
}

function ClockSettings({
  config,
  gridRows,
  onChange,
}: {
  config: ClockModuleConfig;
  gridRows: number;
  onChange: (next: ClockModuleConfig) => void;
}) {
  return (
    <>
      <label>
        Tijd formaat
        <select
          value={config.hourFormat}
          onChange={(event) =>
            onChange({
              ...config,
              hourFormat: event.target.value === "12" ? "12" : "24",
            })
          }
        >
          <option value="24">24-uurs</option>
          <option value="12">12-uurs</option>
        </select>
      </label>

      <label>
        Grootte
        <select
          value={config.size}
          onChange={(event) =>
            onChange({
              ...config,
              size: event.target.value === "large" ? "large" : "normal",
            })
          }
        >
          <option value="normal">Normaal</option>
          <option value="large">Groot</option>
        </select>
      </label>

      <label className="inline-checkbox">
        <input
          type="checkbox"
          checked={config.showSeconds}
          onChange={(event) =>
            onChange({ ...config, showSeconds: event.target.checked })
          }
        />
        <span>Toon seconden</span>
      </label>

      <label className="inline-checkbox">
        <input
          type="checkbox"
          checked={config.showDate}
          onChange={(event) =>
            onChange({ ...config, showDate: event.target.checked })
          }
        />
        <span>Toon datum boven de tijd</span>
      </label>

      <LayoutEditor
        layout={config.layout}
        gridRows={gridRows}
        onChange={(layout) => onChange({ ...config, layout })}
      />
    </>
  );
}

function WeatherSettings({
  config,
  gridRows,
  onChange,
}: {
  config: WeatherModuleConfig;
  gridRows: number;
  onChange: (next: WeatherModuleConfig) => void;
}) {
  return (
    <>
      <label className="inline-checkbox">
        <input
          type="checkbox"
          checked={config.showCurrent}
          onChange={(event) =>
            onChange({ ...config, showCurrent: event.target.checked })
          }
        />
        <span>Huidig weer tonen</span>
      </label>

      <label className="inline-checkbox">
        <input
          type="checkbox"
          checked={config.showForecast}
          onChange={(event) =>
            onChange({ ...config, showForecast: event.target.checked })
          }
        />
        <span>Meerdaagse forecast tonen</span>
      </label>

      <label>
        Forecast dagen
        <select
          value={String(config.forecastDays)}
          onChange={(event) => {
            const value = Number(event.target.value);
            onChange({
              ...config,
              forecastDays: value === 3 || value === 7 ? value : 5,
            });
          }}
        >
          <option value="3">3 dagen</option>
          <option value="5">5 dagen</option>
          <option value="7">7 dagen</option>
        </select>
      </label>

      <label>
        Huidige temperatuur decimalen
        <select
          value={String(config.currentTempDecimals)}
          onChange={(event) => {
            const value = Number(event.target.value);
            onChange({
              ...config,
              currentTempDecimals: value === 1 ? 1 : 0,
            });
          }}
        >
          <option value="0">0 decimalen</option>
          <option value="1">1 decimaal</option>
        </select>
      </label>

      <LayoutEditor
        layout={config.layout}
        gridRows={gridRows}
        onChange={(layout) => onChange({ ...config, layout })}
      />
    </>
  );
}

function TimerSettings({
  config,
  gridRows,
  onChange,
}: {
  config: TimersModuleConfig;
  gridRows: number;
  onChange: (next: TimersModuleConfig) => void;
}) {
  return (
    <>
      <label>
        Weergave
        <select
          value={config.displayMode}
          onChange={(event) =>
            onChange({
              ...config,
              displayMode: event.target.value === "list" ? "list" : "focus",
            })
          }
        >
          <option value="focus">Alleen timer bij actief</option>
          <option value="list">Kleine lijst</option>
        </select>
      </label>

      <label>
        Max zichtbare timers
        <input
          type="number"
          min={1}
          max={20}
          value={config.maxVisible}
          onChange={(event) =>
            onChange({
              ...config,
              maxVisible: toNumber(event.target.value, config.maxVisible),
            })
          }
        />
      </label>

      <label className="inline-checkbox">
        <input
          type="checkbox"
          checked={config.showClockInFocus}
          onChange={(event) =>
            onChange({
              ...config,
              showClockInFocus: event.target.checked,
            })
          }
        />
        <span>Toon grote klok in focusmodus</span>
      </label>

      <label>
        Meldvolume
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={config.announcementVolume}
          onChange={(event) =>
            onChange({
              ...config,
              announcementVolume: toNumber(event.target.value, config.announcementVolume),
            })
          }
        />
        <span>{config.announcementVolume}%</span>
      </label>

      <label className="inline-checkbox">
        <input
          type="checkbox"
          checked={config.playCompletionTone}
          onChange={(event) =>
            onChange({
              ...config,
              playCompletionTone: event.target.checked,
            })
          }
        />
        <span>Speel extra alarmtoon bij einde timer</span>
      </label>

      <p className="muted">
        Gebruik &apos;Test melding&apos; om het huidige volume direct op de spiegel te horen.
        Voor toon aan of uit eerst even opslaan.
      </p>

      <LayoutEditor
        layout={config.layout}
        gridRows={gridRows}
        onChange={(layout) => onChange({ ...config, layout })}
      />
    </>
  );
}

function CalendarSettings({
  config,
  gridRows,
  onChange,
}: {
  config: CalendarModuleConfig;
  gridRows: number;
  onChange: (next: CalendarModuleConfig) => void;
}) {
  return (
    <>
      <label>
        Titel op spiegel (optioneel)
        <input
          value={config.title}
          onChange={(event) =>
            onChange({
              ...config,
              title: event.target.value,
            })
          }
          maxLength={80}
          placeholder="Bijv. Familie agenda"
        />
      </label>

      <label>
        Kalenderfilter (optioneel)
        <input
          value={config.calendarName}
          onChange={(event) =>
            onChange({
              ...config,
              calendarName: event.target.value,
            })
          }
          maxLength={80}
          placeholder="Leeg = alle, of bv Gezin, Werk"
        />
      </label>

      <label>
        Dagen vooruit
        <input
          type="number"
          min={1}
          max={30}
          value={config.daysAhead}
          onChange={(event) =>
            onChange({
              ...config,
              daysAhead: toNumber(event.target.value, config.daysAhead),
            })
          }
        />
      </label>

      <label>
        Max zichtbare afspraken
        <input
          type="number"
          min={1}
          max={20}
          value={config.maxVisible}
          onChange={(event) =>
            onChange({
              ...config,
              maxVisible: toNumber(event.target.value, config.maxVisible),
            })
          }
        />
      </label>

      <label className="inline-checkbox">
        <input
          type="checkbox"
          checked={config.showLocation}
          onChange={(event) =>
            onChange({
              ...config,
              showLocation: event.target.checked,
            })
          }
        />
        <span>Toon locatie</span>
      </label>

      <LayoutEditor
        layout={config.layout}
        gridRows={gridRows}
        onChange={(layout) => onChange({ ...config, layout })}
      />
    </>
  );
}

function AttentionSettings({
  config,
  gridRows,
  onChange,
}: {
  config: AttentionModuleConfig;
  gridRows: number;
  onChange: (next: AttentionModuleConfig) => void;
}) {
  function updateItem(id: string, patch: Partial<AttentionCounterItem>) {
    onChange({
      ...config,
      items: config.items.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    });
  }

  function addItem() {
    onChange({
      ...config,
      items: [...config.items, createAttentionItem()],
    });
  }

  function removeItem(id: string) {
    onChange({
      ...config,
      items: config.items.filter((item) => item.id !== id),
    });
  }

  return (
    <>
      <div className="attention-edit-list">
        {config.items.length === 0 ? (
          <p className="muted">Nog geen items. Voeg er een toe.</p>
        ) : (
          config.items.map((item) => (
            <div key={item.id} className="attention-edit-row">
              <label>
                Titel
                <input
                  value={item.label}
                  onChange={(event) =>
                    updateItem(item.id, {
                      label: event.target.value,
                    })
                  }
                  maxLength={80}
                  placeholder="Trouwen"
                />
              </label>

              <label>
                Datum
                <input
                  type="date"
                  value={item.targetDate}
                  onChange={(event) =>
                    updateItem(item.id, {
                      targetDate: event.target.value,
                    })
                  }
                />
              </label>

              <label className="inline-checkbox">
                <input
                  type="checkbox"
                  checked={item.active}
                  onChange={(event) =>
                    updateItem(item.id, {
                      active: event.target.checked,
                    })
                  }
                />
                <span>Actief</span>
              </label>

              <button
                type="button"
                className="button-secondary button-small"
                onClick={() => removeItem(item.id)}
              >
                Verwijder
              </button>
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        className="button-secondary button-small"
        onClick={addItem}
      >
        Voeg item toe
      </button>

      <LayoutEditor
        layout={config.layout}
        gridRows={gridRows}
        onChange={(layout) => onChange({ ...config, layout })}
      />
    </>
  );
}

function TodoistSettings({
  config,
  gridRows,
  onChange,
}: {
  config: TodoistModuleConfig;
  gridRows: number;
  onChange: (next: TodoistModuleConfig) => void;
}) {
  return (
    <>
      <label>
        Titel op spiegel (optioneel)
        <input
          value={config.title}
          onChange={(event) =>
            onChange({
              ...config,
              title: event.target.value,
            })
          }
          maxLength={80}
          placeholder="Bijv. Boodschappen"
        />
      </label>

      <label>
        Project ID (optioneel)
        <input
          value={config.projectId}
          onChange={(event) =>
            onChange({
              ...config,
              projectId: event.target.value,
            })
          }
          maxLength={120}
          placeholder="Leeg = TODOIST_PROJECT_ID (of TODOIST_RECIPES_PROJECT_ID) uit .env"
        />
      </label>

      <label>
        Max zichtbare taken
        <input
          type="number"
          min={1}
          max={30}
          value={config.maxVisible}
          onChange={(event) =>
            onChange({
              ...config,
              maxVisible: toNumber(event.target.value, config.maxVisible),
            })
          }
        />
      </label>

      <label>
        Poll interval (seconden)
        <input
          type="number"
          min={10}
          max={3600}
          value={config.pollSeconds}
          onChange={(event) =>
            onChange({
              ...config,
              pollSeconds: toNumber(event.target.value, config.pollSeconds),
            })
          }
        />
      </label>

      <LayoutEditor
        layout={config.layout}
        gridRows={gridRows}
        onChange={(layout) => onChange({ ...config, layout })}
      />
    </>
  );
}
