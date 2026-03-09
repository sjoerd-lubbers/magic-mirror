import { getOpenWeatherApiKey } from "@/lib/config";

export const WEATHER_CURRENT_CACHE_SECONDS = 15 * 60;
export const WEATHER_FORECAST_CACHE_SECONDS = 24 * 60 * 60;
const WEATHER_ERROR_BACKOFF_SECONDS = 60;

export type WeatherCurrent = {
  temperatureC: number;
  description: string;
  icon: string;
  city: string;
};

export type WeatherForecastDay = {
  dateIso: string;
  dayLabel: string;
  icon: string;
  minTempC: number;
  maxTempC: number;
};

export type WeatherModuleData = {
  current: WeatherCurrent | null;
  forecast: WeatherForecastDay[];
};

export type WeatherCacheOverview = {
  entryCount: number;
  activeEntryCount: number;
  requestCount: number;
  currentCacheHits: number;
  currentCacheMisses: number;
  forecastCacheHits: number;
  forecastCacheMisses: number;
  latestCurrentFetchAt: string | null;
  latestForecastFetchAt: string | null;
  nextCurrentExpiryAt: string | null;
  nextCurrentExpiryInSeconds: number | null;
  nextForecastExpiryAt: string | null;
  nextForecastExpiryInSeconds: number | null;
};

type ForecastBucket = {
  score: number;
  dateIso: string;
  icon: string;
  minTempC: number;
  maxTempC: number;
};

type WeatherCacheEntry = {
  current: WeatherCurrent | null;
  forecast: WeatherForecastDay[];
  currentExpiresAt: number;
  forecastExpiresAt: number;
  currentFetchedAt: string | null;
  forecastFetchedAt: string | null;
};

type WeatherCacheStats = {
  requestCount: number;
  currentCacheHits: number;
  currentCacheMisses: number;
  forecastCacheHits: number;
  forecastCacheMisses: number;
  latestCurrentFetchAt: string | null;
  latestForecastFetchAt: string | null;
};

declare global {
  var __weatherModuleCache: Map<string, WeatherCacheEntry> | undefined;
  var __weatherModuleCacheStats: WeatherCacheStats | undefined;
}

const weatherCache = global.__weatherModuleCache ?? new Map<string, WeatherCacheEntry>();
if (!global.__weatherModuleCache) {
  global.__weatherModuleCache = weatherCache;
}

const weatherCacheStats = global.__weatherModuleCacheStats ?? {
  requestCount: 0,
  currentCacheHits: 0,
  currentCacheMisses: 0,
  forecastCacheHits: 0,
  forecastCacheMisses: 0,
  latestCurrentFetchAt: null,
  latestForecastFetchAt: null,
};
if (!global.__weatherModuleCacheStats) {
  global.__weatherModuleCacheStats = weatherCacheStats;
}

function isoDayKeyFromUnix(seconds: number) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function dayLabel(dateIso: string) {
  return new Intl.DateTimeFormat("nl-NL", { weekday: "short" }).format(
    new Date(`${dateIso}T12:00:00Z`),
  );
}

function normalizeForecast(
  rawList: Array<{
    dt?: number;
    weather?: Array<{ icon?: string }>;
    main?: { temp_min?: number; temp_max?: number };
  }>,
  maxDays: number,
): WeatherForecastDay[] {
  const buckets = new Map<string, ForecastBucket>();
  const todayKey = new Date().toISOString().slice(0, 10);

  for (const item of rawList) {
    if (!item.dt) {
      continue;
    }

    const date = new Date(item.dt * 1000);
    const key = isoDayKeyFromUnix(item.dt);
    const hour = date.getUTCHours();
    const score = Math.abs(hour - 12);

    const existing = buckets.get(key);
    if (existing && existing.score <= score) {
      continue;
    }

    buckets.set(key, {
      score,
      dateIso: key,
      icon: item.weather?.[0]?.icon ?? "01d",
      minTempC: Math.round(item.main?.temp_min ?? 0),
      maxTempC: Math.round(item.main?.temp_max ?? 0),
    });
  }

  return [...buckets.values()]
    .filter((item) => item.dateIso > todayKey)
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso))
    .slice(0, maxDays)
    .map((item) => ({
      dateIso: item.dateIso,
      dayLabel: dayLabel(item.dateIso),
      icon: item.icon,
      minTempC: item.minTempC,
      maxTempC: item.maxTempC,
    }));
}

function buildWeatherUrls({
  latitude,
  longitude,
  locationName,
  apiKey,
}: {
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  apiKey: string;
}) {
  const hasCoords = latitude !== null && longitude !== null;

  const currentUrl = new URL("https://api.openweathermap.org/data/2.5/weather");
  if (hasCoords) {
    currentUrl.searchParams.set("lat", String(latitude));
    currentUrl.searchParams.set("lon", String(longitude));
  } else {
    currentUrl.searchParams.set("q", locationName!.trim());
  }
  currentUrl.searchParams.set("appid", apiKey);
  currentUrl.searchParams.set("units", "metric");
  currentUrl.searchParams.set("lang", "nl");

  const forecastUrl = new URL("https://api.openweathermap.org/data/2.5/forecast");
  if (hasCoords) {
    forecastUrl.searchParams.set("lat", String(latitude));
    forecastUrl.searchParams.set("lon", String(longitude));
  } else {
    forecastUrl.searchParams.set("q", locationName!.trim());
  }
  forecastUrl.searchParams.set("appid", apiKey);
  forecastUrl.searchParams.set("units", "metric");
  forecastUrl.searchParams.set("lang", "nl");

  return { currentUrl, forecastUrl };
}

function buildWeatherCacheKey({
  latitude,
  longitude,
  locationName,
  forecastDays,
}: {
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  forecastDays: 3 | 5 | 7;
}) {
  if (latitude !== null && longitude !== null) {
    return `coords:${latitude.toFixed(4)},${longitude.toFixed(4)}:${forecastDays}`;
  }

  return `location:${(locationName ?? "").trim().toLowerCase()}:${forecastDays}`;
}

export async function getWeatherModuleData({
  latitude,
  longitude,
  locationName,
  forecastDays,
}: {
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  forecastDays: 3 | 5 | 7;
}): Promise<WeatherModuleData | null> {
  const apiKey = getOpenWeatherApiKey();

  if (!apiKey) {
    return null;
  }

  const hasCoords = latitude !== null && longitude !== null;
  const hasLocationName = Boolean(locationName?.trim());

  if (!hasCoords && !hasLocationName) {
    return null;
  }

  const cacheKey = buildWeatherCacheKey({
    latitude,
    longitude,
    locationName,
    forecastDays,
  });
  const now = Date.now();
  const cached = weatherCache.get(cacheKey);

  weatherCacheStats.requestCount += 1;

  const needCurrent = !cached || cached.currentExpiresAt <= now || !cached.current;
  const needForecast = !cached || cached.forecastExpiresAt <= now || cached.forecast.length === 0;

  if (needCurrent) {
    weatherCacheStats.currentCacheMisses += 1;
  } else {
    weatherCacheStats.currentCacheHits += 1;
  }

  if (needForecast) {
    weatherCacheStats.forecastCacheMisses += 1;
  } else {
    weatherCacheStats.forecastCacheHits += 1;
  }

  if (!needCurrent && !needForecast && cached) {
    return {
      current: cached.current,
      forecast: cached.forecast,
    };
  }

  const { currentUrl, forecastUrl } = buildWeatherUrls({
    latitude,
    longitude,
    locationName,
    apiKey,
  });

  let nextCurrent = cached?.current ?? null;
  let nextForecast = cached?.forecast ?? [];
  let nextCurrentExpiresAt = cached?.currentExpiresAt ?? 0;
  let nextForecastExpiresAt = cached?.forecastExpiresAt ?? 0;
  let nextCurrentFetchedAt = cached?.currentFetchedAt ?? null;
  let nextForecastFetchedAt = cached?.forecastFetchedAt ?? null;

  const [currentResponse, forecastResponse] = await Promise.all([
    needCurrent ? fetch(currentUrl, { cache: "no-store" }) : Promise.resolve(null),
    needForecast ? fetch(forecastUrl, { cache: "no-store" }) : Promise.resolve(null),
  ]);

  if (needCurrent) {
    if (currentResponse?.ok) {
      const currentJson = (await currentResponse.json()) as {
        main?: { temp?: number };
        weather?: Array<{ description?: string; icon?: string }>;
        name?: string;
      };

      nextCurrent = {
        temperatureC: Number((currentJson.main?.temp ?? 0).toFixed(1)),
        description: currentJson.weather?.[0]?.description ?? "onbekend",
        icon: currentJson.weather?.[0]?.icon ?? "01d",
        city: currentJson.name ?? "Onbekend",
      };
      nextCurrentExpiresAt = now + WEATHER_CURRENT_CACHE_SECONDS * 1000;
      nextCurrentFetchedAt = new Date().toISOString();
      weatherCacheStats.latestCurrentFetchAt = nextCurrentFetchedAt;
    } else {
      if (currentResponse) {
        console.error("Kon huidig weer niet ophalen", {
          status: currentResponse.status,
          url: currentUrl.toString(),
        });
      }
      nextCurrentExpiresAt = now + WEATHER_ERROR_BACKOFF_SECONDS * 1000;
    }
  }

  if (needForecast) {
    if (forecastResponse?.ok) {
      const forecastJson = (await forecastResponse.json()) as {
        list?: Array<{
          dt?: number;
          weather?: Array<{ icon?: string }>;
          main?: { temp_min?: number; temp_max?: number };
        }>;
      };

      nextForecast = forecastJson.list
        ? normalizeForecast(forecastJson.list, forecastDays)
        : [];
      nextForecastExpiresAt = now + WEATHER_FORECAST_CACHE_SECONDS * 1000;
      nextForecastFetchedAt = new Date().toISOString();
      weatherCacheStats.latestForecastFetchAt = nextForecastFetchedAt;
    } else {
      if (forecastResponse) {
        console.error("Kon weer-forecast niet ophalen", {
          status: forecastResponse.status,
          url: forecastUrl.toString(),
        });
      }
      nextForecastExpiresAt = now + WEATHER_ERROR_BACKOFF_SECONDS * 1000;
    }
  }

  weatherCache.set(cacheKey, {
    current: nextCurrent,
    forecast: nextForecast,
    currentExpiresAt: nextCurrentExpiresAt,
    forecastExpiresAt: nextForecastExpiresAt,
    currentFetchedAt: nextCurrentFetchedAt,
    forecastFetchedAt: nextForecastFetchedAt,
  });

  if (!nextCurrent && nextForecast.length === 0) {
    return null;
  }

  return {
    current: nextCurrent,
    forecast: nextForecast,
  };
}

export function getWeatherCacheOverview(): WeatherCacheOverview {
  const now = Date.now();
  let activeEntryCount = 0;
  let nextCurrentExpiryMs: number | null = null;
  let nextForecastExpiryMs: number | null = null;

  for (const entry of weatherCache.values()) {
    if (entry.currentExpiresAt > now || entry.forecastExpiresAt > now) {
      activeEntryCount += 1;
    }

    if (entry.currentExpiresAt > now) {
      if (nextCurrentExpiryMs === null || entry.currentExpiresAt < nextCurrentExpiryMs) {
        nextCurrentExpiryMs = entry.currentExpiresAt;
      }
    }

    if (entry.forecastExpiresAt > now) {
      if (nextForecastExpiryMs === null || entry.forecastExpiresAt < nextForecastExpiryMs) {
        nextForecastExpiryMs = entry.forecastExpiresAt;
      }
    }
  }

  return {
    entryCount: weatherCache.size,
    activeEntryCount,
    requestCount: weatherCacheStats.requestCount,
    currentCacheHits: weatherCacheStats.currentCacheHits,
    currentCacheMisses: weatherCacheStats.currentCacheMisses,
    forecastCacheHits: weatherCacheStats.forecastCacheHits,
    forecastCacheMisses: weatherCacheStats.forecastCacheMisses,
    latestCurrentFetchAt: weatherCacheStats.latestCurrentFetchAt,
    latestForecastFetchAt: weatherCacheStats.latestForecastFetchAt,
    nextCurrentExpiryAt: nextCurrentExpiryMs ? new Date(nextCurrentExpiryMs).toISOString() : null,
    nextCurrentExpiryInSeconds: nextCurrentExpiryMs
      ? Math.max(0, Math.ceil((nextCurrentExpiryMs - now) / 1000))
      : null,
    nextForecastExpiryAt: nextForecastExpiryMs
      ? new Date(nextForecastExpiryMs).toISOString()
      : null,
    nextForecastExpiryInSeconds: nextForecastExpiryMs
      ? Math.max(0, Math.ceil((nextForecastExpiryMs - now) / 1000))
      : null,
  };
}
