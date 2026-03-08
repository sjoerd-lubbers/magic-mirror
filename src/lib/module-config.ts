export type MirrorModuleType =
  | "CLOCK"
  | "WEATHER"
  | "TIMERS"
  | "CALENDAR"
  | "ATTENTION"
  | "TODOIST";

export const MIRROR_GRID_COLUMNS = 12;
export const DEFAULT_MIRROR_GRID_ROWS = 12;
export const MAX_MIRROR_GRID_ROWS = 24;
export const MIN_MIRROR_GRID_ROWS = 12;

export type ModuleLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ClockModuleConfig = {
  hourFormat: "12" | "24";
  showSeconds: boolean;
  showDate: boolean;
  size: "normal" | "large";
  layout: ModuleLayout;
};

export type WeatherModuleConfig = {
  showCurrent: boolean;
  showForecast: boolean;
  forecastDays: 3 | 5 | 7;
  currentTempDecimals: 0 | 1;
  layout: ModuleLayout;
};

export type TimersModuleConfig = {
  maxVisible: number;
  displayMode: "focus" | "list";
  layout: ModuleLayout;
};

export type CalendarModuleConfig = {
  title: string;
  calendarName: string;
  daysAhead: number;
  maxVisible: number;
  showLocation: boolean;
  layout: ModuleLayout;
};

export type AttentionCounterItem = {
  id: string;
  label: string;
  targetDate: string;
  active: boolean;
};

export type AttentionModuleConfig = {
  items: AttentionCounterItem[];
  layout: ModuleLayout;
};

export type TodoistModuleConfig = {
  title: string;
  projectId: string;
  maxVisible: number;
  pollSeconds: number;
  layout: ModuleLayout;
};

export type ModuleConfigByType = {
  CLOCK: ClockModuleConfig;
  WEATHER: WeatherModuleConfig;
  TIMERS: TimersModuleConfig;
  CALENDAR: CalendarModuleConfig;
  ATTENTION: AttentionModuleConfig;
  TODOIST: TodoistModuleConfig;
};

export type AnyModuleConfig = ModuleConfigByType[MirrorModuleType];

export type ModuleSettingsMap = {
  CLOCK: {
    enabled: boolean;
    config: ClockModuleConfig;
  };
  WEATHER: {
    enabled: boolean;
    config: WeatherModuleConfig;
  };
  TIMERS: {
    enabled: boolean;
    config: TimersModuleConfig;
  };
  CALENDAR: {
    enabled: boolean;
    config: CalendarModuleConfig;
  };
  ATTENTION: {
    enabled: boolean;
    config: AttentionModuleConfig;
  };
  TODOIST: {
    enabled: boolean;
    config: TodoistModuleConfig;
  };
};

export type ModuleSettingsListItem = {
  [T in MirrorModuleType]: {
    type: T;
    enabled: boolean;
    config: ModuleConfigByType[T];
  };
}[MirrorModuleType];

const MODULE_ORDER: MirrorModuleType[] = [
  "CLOCK",
  "WEATHER",
  "CALENDAR",
  "TODOIST",
  "TIMERS",
  "ATTENTION",
];

function defaultLayout(type: MirrorModuleType): ModuleLayout {
  switch (type) {
    case "CLOCK":
      return { x: 1, y: 1, w: 4, h: 3 };
    case "WEATHER":
      return { x: 5, y: 1, w: 4, h: 3 };
    case "CALENDAR":
      return { x: 9, y: 1, w: 4, h: 3 };
    case "TIMERS":
      return { x: 1, y: 4, w: 12, h: 3 };
    case "ATTENTION":
      return { x: 1, y: 7, w: 12, h: 3 };
    case "TODOIST":
      return { x: 1, y: 10, w: 12, h: 3 };
  }
}

function defaultClockConfig(): ClockModuleConfig {
  return {
    hourFormat: "24",
    showSeconds: true,
    showDate: false,
    size: "normal",
    layout: defaultLayout("CLOCK"),
  };
}

function defaultWeatherConfig(): WeatherModuleConfig {
  return {
    showCurrent: true,
    showForecast: true,
    forecastDays: 5,
    currentTempDecimals: 0,
    layout: defaultLayout("WEATHER"),
  };
}

function defaultTimersConfig(): TimersModuleConfig {
  return {
    maxVisible: 6,
    displayMode: "focus",
    layout: defaultLayout("TIMERS"),
  };
}

function defaultCalendarConfig(): CalendarModuleConfig {
  return {
    title: "",
    calendarName: "",
    daysAhead: 8,
    maxVisible: 8,
    showLocation: true,
    layout: defaultLayout("CALENDAR"),
  };
}

function defaultAttentionConfig(): AttentionModuleConfig {
  return {
    items: [],
    layout: defaultLayout("ATTENTION"),
  };
}

function defaultTodoistConfig(): TodoistModuleConfig {
  return {
    title: "",
    projectId: "",
    maxVisible: 8,
    pollSeconds: 30,
    layout: defaultLayout("TODOIST"),
  };
}

export function getDefaultModuleConfig<T extends MirrorModuleType>(
  type: T,
): ModuleConfigByType[T] {
  if (type === "CLOCK") {
    return defaultClockConfig() as ModuleConfigByType[T];
  }

  if (type === "WEATHER") {
    return defaultWeatherConfig() as ModuleConfigByType[T];
  }

  if (type === "TIMERS") {
    return defaultTimersConfig() as ModuleConfigByType[T];
  }

  if (type === "CALENDAR") {
    return defaultCalendarConfig() as ModuleConfigByType[T];
  }

  if (type === "ATTENTION") {
    return defaultAttentionConfig() as ModuleConfigByType[T];
  }

  return defaultTodoistConfig() as ModuleConfigByType[T];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toInt(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeGridRows(value: unknown) {
  const rows = toInt(value, DEFAULT_MIRROR_GRID_ROWS);
  return clamp(rows, MIN_MIRROR_GRID_ROWS, MAX_MIRROR_GRID_ROWS);
}

type NormalizeOptions = {
  rows?: number;
};

function normalizeLayout(
  type: MirrorModuleType,
  value: unknown,
  options?: NormalizeOptions,
): ModuleLayout {
  const fallback = defaultLayout(type);
  const maxRows = normalizeGridRows(options?.rows);

  if (!isRecord(value)) {
    const maxFallbackHeight = Math.max(1, maxRows + 1 - fallback.y);
    return {
      ...fallback,
      y: clamp(fallback.y, 1, maxRows),
      h: clamp(fallback.h, 1, maxFallbackHeight),
    };
  }

  const x = clamp(toInt(value.x, fallback.x), 1, MIRROR_GRID_COLUMNS);
  const y = clamp(toInt(value.y, fallback.y), 1, maxRows);
  const w = clamp(toInt(value.w, fallback.w), 1, MIRROR_GRID_COLUMNS);
  const h = clamp(toInt(value.h, fallback.h), 1, maxRows);

  const maxWidth = MIRROR_GRID_COLUMNS + 1 - x;
  const maxHeight = maxRows + 1 - y;

  return {
    x,
    y,
    w: clamp(w, 1, maxWidth),
    h: clamp(h, 1, maxHeight),
  };
}

function normalizeClockConfig(value: unknown, options?: NormalizeOptions): ClockModuleConfig {
  const fallback = defaultClockConfig();

  if (!isRecord(value)) {
    return fallback;
  }

  return {
    hourFormat: value.hourFormat === "12" ? "12" : "24",
    showSeconds:
      typeof value.showSeconds === "boolean"
        ? value.showSeconds
        : fallback.showSeconds,
    showDate:
      typeof value.showDate === "boolean"
        ? value.showDate
        : fallback.showDate,
    size: value.size === "large" ? "large" : "normal",
    layout: normalizeLayout("CLOCK", value.layout, options),
  };
}

function normalizeWeatherConfig(
  value: unknown,
  options?: NormalizeOptions,
): WeatherModuleConfig {
  const fallback = defaultWeatherConfig();

  if (!isRecord(value)) {
    return fallback;
  }

  const requestedDays = toInt(value.forecastDays, fallback.forecastDays);
  const forecastDays: 3 | 5 | 7 =
    requestedDays === 3 || requestedDays === 7 ? requestedDays : 5;
  const requestedDecimals = toInt(
    value.currentTempDecimals,
    fallback.currentTempDecimals,
  );
  const currentTempDecimals: 0 | 1 = requestedDecimals === 1 ? 1 : 0;

  return {
    showCurrent:
      typeof value.showCurrent === "boolean"
        ? value.showCurrent
        : fallback.showCurrent,
    showForecast:
      typeof value.showForecast === "boolean"
        ? value.showForecast
        : fallback.showForecast,
    forecastDays,
    currentTempDecimals,
    layout: normalizeLayout("WEATHER", value.layout, options),
  };
}

function normalizeTimersConfig(value: unknown, options?: NormalizeOptions): TimersModuleConfig {
  const fallback = defaultTimersConfig();

  if (!isRecord(value)) {
    return fallback;
  }

  return {
    maxVisible: clamp(toInt(value.maxVisible, fallback.maxVisible), 1, 20),
    displayMode: value.displayMode === "list" ? "list" : "focus",
    layout: normalizeLayout("TIMERS", value.layout, options),
  };
}

function normalizeCalendarConfig(
  value: unknown,
  options?: NormalizeOptions,
): CalendarModuleConfig {
  const fallback = defaultCalendarConfig();

  if (!isRecord(value)) {
    return fallback;
  }

  const calendarName =
    typeof value.calendarName === "string"
      ? value.calendarName.trim().slice(0, 80)
      : fallback.calendarName;

  return {
    title:
      typeof value.title === "string"
        ? value.title.trim().slice(0, 80)
        : fallback.title,
    calendarName,
    daysAhead: clamp(toInt(value.daysAhead, fallback.daysAhead), 1, 30),
    maxVisible: clamp(toInt(value.maxVisible, fallback.maxVisible), 1, 20),
    showLocation:
      typeof value.showLocation === "boolean"
        ? value.showLocation
        : fallback.showLocation,
    layout: normalizeLayout("CALENDAR", value.layout, options),
  };
}

function isValidDateIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === value;
}

function normalizeAttentionConfig(
  value: unknown,
  options?: NormalizeOptions,
): AttentionModuleConfig {
  const fallback = defaultAttentionConfig();

  if (!isRecord(value)) {
    return fallback;
  }

  const rawItems = Array.isArray(value.items) ? value.items : [];
  const items: AttentionCounterItem[] = [];

  for (const [index, rawItem] of rawItems.entries()) {
    if (!isRecord(rawItem)) {
      continue;
    }

    const label =
      typeof rawItem.label === "string" ? rawItem.label.trim().slice(0, 80) : "";

    if (!label) {
      continue;
    }

    const targetDateCandidate =
      typeof rawItem.targetDate === "string"
        ? rawItem.targetDate.trim()
        : typeof rawItem.dateIso === "string"
          ? rawItem.dateIso.trim()
          : "";

    if (!isValidDateIso(targetDateCandidate)) {
      continue;
    }

    const id =
      typeof rawItem.id === "string" && rawItem.id.trim().length > 0
        ? rawItem.id.trim().slice(0, 60)
        : `attention-${index + 1}`;

    items.push({
      id,
      label,
      targetDate: targetDateCandidate,
      active: typeof rawItem.active === "boolean" ? rawItem.active : true,
    });
  }

  return {
    items: items.slice(0, 20),
    layout: normalizeLayout("ATTENTION", value.layout, options),
  };
}

function normalizeTodoistConfig(value: unknown, options?: NormalizeOptions): TodoistModuleConfig {
  const fallback = defaultTodoistConfig();

  if (!isRecord(value)) {
    return fallback;
  }

  return {
    title:
      typeof value.title === "string"
        ? value.title.trim().slice(0, 80)
        : fallback.title,
    projectId:
      typeof value.projectId === "string"
        ? value.projectId.trim().slice(0, 120)
        : fallback.projectId,
    maxVisible: clamp(toInt(value.maxVisible, fallback.maxVisible), 1, 30),
    pollSeconds: clamp(toInt(value.pollSeconds, fallback.pollSeconds), 10, 3600),
    layout: normalizeLayout("TODOIST", value.layout, options),
  };
}

export function normalizeModuleConfig<T extends MirrorModuleType>(
  type: T,
  value: unknown,
  options?: NormalizeOptions,
): ModuleConfigByType[T] {
  if (type === "CLOCK") {
    return normalizeClockConfig(value, options) as ModuleConfigByType[T];
  }

  if (type === "WEATHER") {
    return normalizeWeatherConfig(value, options) as ModuleConfigByType[T];
  }

  if (type === "TIMERS") {
    return normalizeTimersConfig(value, options) as ModuleConfigByType[T];
  }

  if (type === "CALENDAR") {
    return normalizeCalendarConfig(value, options) as ModuleConfigByType[T];
  }

  if (type === "ATTENTION") {
    return normalizeAttentionConfig(value, options) as ModuleConfigByType[T];
  }

  return normalizeTodoistConfig(value, options) as ModuleConfigByType[T];
}

function tryParseJson(input: string | null): unknown {
  if (!input) {
    return null;
  }

  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

export function readModuleConfig<T extends MirrorModuleType>(
  type: T,
  input: string | null,
  options?: NormalizeOptions,
): ModuleConfigByType[T] {
  return normalizeModuleConfig(type, tryParseJson(input), options);
}

export function buildModuleSettingsMap(
  modules: Array<{ type: string; enabled: boolean; config: string | null }>,
  options?: NormalizeOptions,
): ModuleSettingsMap {
  const byType = new Map(modules.map((module) => [module.type, module]));

  const clock = byType.get("CLOCK");
  const weather = byType.get("WEATHER");
  const timers = byType.get("TIMERS");
  const calendar = byType.get("CALENDAR");
  const attention = byType.get("ATTENTION");
  const todoist = byType.get("TODOIST");

  return {
    CLOCK: {
      enabled: clock?.enabled ?? true,
      config: readModuleConfig("CLOCK", clock?.config ?? null, options),
    },
    WEATHER: {
      enabled: weather?.enabled ?? true,
      config: readModuleConfig("WEATHER", weather?.config ?? null, options),
    },
    TIMERS: {
      enabled: timers?.enabled ?? true,
      config: readModuleConfig("TIMERS", timers?.config ?? null, options),
    },
    CALENDAR: {
      enabled: calendar?.enabled ?? false,
      config: readModuleConfig("CALENDAR", calendar?.config ?? null, options),
    },
    ATTENTION: {
      enabled: attention?.enabled ?? true,
      config: readModuleConfig("ATTENTION", attention?.config ?? null, options),
    },
    TODOIST: {
      enabled: todoist?.enabled ?? false,
      config: readModuleConfig("TODOIST", todoist?.config ?? null, options),
    },
  };
}

export function toModuleSettingsList(
  settings: ModuleSettingsMap,
): ModuleSettingsListItem[] {
  return MODULE_ORDER.map((type) => ({
    type,
    enabled: settings[type].enabled,
    config: settings[type].config,
  })) as ModuleSettingsListItem[];
}
