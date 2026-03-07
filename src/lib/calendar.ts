import { getICloudCalendarConfig } from "@/lib/config";

export type CalendarModuleEvent = {
  id: string;
  title: string;
  location: string | null;
  allDay: boolean;
  startIso: string;
  endIso: string | null;
  dayLabel: string;
  timeLabel: string;
};

export type CalendarModuleData = {
  calendarName: string;
  events: CalendarModuleEvent[];
  fetchedAt: string;
};

type CachedCalendarData = {
  expiresAt: number;
  data: CalendarModuleData;
};

type ParsedIcalDate = {
  date: Date;
  allDay: boolean;
};

type ParsedIcalEvent = {
  id: string;
  title: string;
  location: string | null;
  start: ParsedIcalDate;
  end: ParsedIcalDate | null;
};

declare global {
  var __calendarModuleCache: Map<string, CachedCalendarData> | undefined;
}

const calendarCache = global.__calendarModuleCache ?? new Map<string, CachedCalendarData>();
if (!global.__calendarModuleCache) {
  global.__calendarModuleCache = calendarCache;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

function decodeIcalText(value: string) {
  return value
    .replace(/\\n/gi, ", ")
    .replace(/\\,/g, ",")
    .replace(/\\\\/g, "\\")
    .trim();
}

function toCalDavUtcString(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function resolveUrl(baseUrl: string, href: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractNestedHref(xml: string, containerName: string) {
  const pattern = new RegExp(
    `<[^>]*${containerName}[^>]*>[\\s\\S]*?<[^>]*href[^>]*>([^<]+)<\\/[^>]*href>`,
    "i",
  );
  const match = xml.match(pattern);
  return match ? decodeXmlEntities(match[1].trim()) : null;
}

function extractResponseBlocks(xml: string) {
  return xml.match(/<[^>]*response[^>]*>[\s\S]*?<\/[^>]*response>/gi) ?? [];
}

function isCalendarCollection(responseXml: string) {
  return /<[^>]*resourcetype[^>]*>[\s\S]*?<[^>]*calendar(?:\s[^>]*)?\/>/i.test(
    responseXml,
  );
}

function extractFirstTagText(xml: string, tagName: string) {
  const pattern = new RegExp(`<[^>]*${tagName}[^>]*>([\\s\\S]*?)<\\/[^>]*${tagName}>`, "i");
  const match = xml.match(pattern);

  if (!match) {
    return null;
  }

  return decodeXmlEntities(match[1].replace(/<[^>]+>/g, "").trim());
}

function extractCalendarData(xml: string) {
  const cdataMatch = xml.match(
    /<[^>]*calendar-data[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/[^>]*calendar-data>/i,
  );

  if (cdataMatch?.[1]) {
    return cdataMatch[1];
  }

  const plainMatch = xml.match(/<[^>]*calendar-data[^>]*>([\s\S]*?)<\/[^>]*calendar-data>/i);

  if (!plainMatch?.[1]) {
    return null;
  }

  return decodeXmlEntities(plainMatch[1]).trim();
}

function parseIcalDate(value: string, params: string[]): ParsedIcalDate | null {
  const normalizedValue = value.trim();
  const hasDateOnlyParam = params.some((param) => param.toUpperCase() === "VALUE=DATE");

  if (hasDateOnlyParam || /^\d{8}$/.test(normalizedValue)) {
    const isoDate = [
      normalizedValue.slice(0, 4),
      normalizedValue.slice(4, 6),
      normalizedValue.slice(6, 8),
    ].join("-");
    const date = new Date(`${isoDate}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return { date, allDay: true };
  }

  if (/^\d{8}T\d{6}Z$/.test(normalizedValue)) {
    const date = new Date(
      Date.UTC(
        Number(normalizedValue.slice(0, 4)),
        Number(normalizedValue.slice(4, 6)) - 1,
        Number(normalizedValue.slice(6, 8)),
        Number(normalizedValue.slice(9, 11)),
        Number(normalizedValue.slice(11, 13)),
        Number(normalizedValue.slice(13, 15)),
      ),
    );

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return { date, allDay: false };
  }

  if (/^\d{8}T\d{6}$/.test(normalizedValue)) {
    const date = new Date(
      Number(normalizedValue.slice(0, 4)),
      Number(normalizedValue.slice(4, 6)) - 1,
      Number(normalizedValue.slice(6, 8)),
      Number(normalizedValue.slice(9, 11)),
      Number(normalizedValue.slice(11, 13)),
      Number(normalizedValue.slice(13, 15)),
    );

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return { date, allDay: false };
  }

  const fallback = new Date(normalizedValue);
  if (Number.isNaN(fallback.getTime())) {
    return null;
  }

  return { date: fallback, allDay: false };
}

function parseIcalEvents(ical: string): ParsedIcalEvent[] {
  const unfolded = ical.replace(/\r?\n[ \t]/g, "");
  const matches = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  const events: ParsedIcalEvent[] = [];

  for (const block of matches) {
    const lines = block.split(/\r?\n/);
    const values = new Map<string, { value: string; params: string[] }>();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line === "BEGIN:VEVENT" || line === "END:VEVENT") {
        continue;
      }

      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) {
        continue;
      }

      const keySection = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1);
      const [rawKey, ...rawParams] = keySection.split(";");
      const key = rawKey.toUpperCase();

      if (!values.has(key)) {
        values.set(key, {
          value,
          params: rawParams.map((param) => param.toUpperCase()),
        });
      }
    }

    const uid = decodeIcalText(values.get("UID")?.value ?? "");
    const summary = decodeIcalText(values.get("SUMMARY")?.value ?? "");
    const startValue = values.get("DTSTART");

    if (!uid || !startValue) {
      continue;
    }

    const parsedStart = parseIcalDate(startValue.value, startValue.params);
    if (!parsedStart) {
      continue;
    }

    const endValue = values.get("DTEND");
    const parsedEnd = endValue ? parseIcalDate(endValue.value, endValue.params) : null;
    const locationValue = decodeIcalText(values.get("LOCATION")?.value ?? "");

    events.push({
      id: uid,
      title: summary || "(zonder titel)",
      location: locationValue || null,
      start: parsedStart,
      end: parsedEnd,
    });
  }

  return events;
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatTimeLabel(event: ParsedIcalEvent) {
  if (event.start.allDay) {
    return "Hele dag";
  }

  const start = new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(event.start.date);
  const end = event.end?.allDay
    ? null
    : event.end
      ? new Intl.DateTimeFormat("nl-NL", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(event.end.date)
      : null;

  return end ? `${start} - ${end}` : start;
}

function parseCalendarFilters(rawFilter: string) {
  return rawFilter
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

async function calDavRequest({
  url,
  method,
  username,
  password,
  depth,
  body,
}: {
  url: string;
  method: "PROPFIND" | "REPORT";
  username: string;
  password: string;
  depth: "0" | "1";
  body: string;
}) {
  const basicAuth = Buffer.from(`${username}:${password}`).toString("base64");
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/xml; charset=utf-8",
      Depth: depth,
    },
    body,
    cache: "no-store",
  });

  if (!response.ok && response.status !== 207) {
    throw new Error(`CalDAV request failed (${response.status})`);
  }

  return response.text();
}

async function fetchCalendarData({
  baseUrl,
  username,
  password,
  calendarName,
  daysAhead,
}: {
  baseUrl: string;
  username: string;
  password: string;
  calendarName: string;
  daysAhead: number;
}) {
  const principalXml = await calDavRequest({
    url: baseUrl,
    method: "PROPFIND",
    username,
    password,
    depth: "0",
    body: `<?xml version="1.0" encoding="utf-8" ?>
      <D:propfind xmlns:D="DAV:">
        <D:prop>
          <D:current-user-principal />
        </D:prop>
      </D:propfind>`,
  });
  const principalHref = extractNestedHref(principalXml, "current-user-principal");

  if (!principalHref) {
    throw new Error("CalDAV principal kon niet worden bepaald");
  }

  const principalUrl = resolveUrl(baseUrl, principalHref);
  if (!principalUrl) {
    throw new Error("CalDAV principal URL ongeldig");
  }

  const calendarHomeXml = await calDavRequest({
    url: principalUrl,
    method: "PROPFIND",
    username,
    password,
    depth: "0",
    body: `<?xml version="1.0" encoding="utf-8" ?>
      <D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
        <D:prop>
          <C:calendar-home-set />
        </D:prop>
      </D:propfind>`,
  });
  const calendarHomeHref = extractNestedHref(calendarHomeXml, "calendar-home-set");

  if (!calendarHomeHref) {
    throw new Error("CalDAV calendar-home-set kon niet worden bepaald");
  }

  const calendarHomeUrl = resolveUrl(baseUrl, calendarHomeHref);
  if (!calendarHomeUrl) {
    throw new Error("CalDAV calendar home URL ongeldig");
  }

  const calendarsXml = await calDavRequest({
    url: calendarHomeUrl,
    method: "PROPFIND",
    username,
    password,
    depth: "1",
    body: `<?xml version="1.0" encoding="utf-8" ?>
      <D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
        <D:prop>
          <D:displayname />
          <D:resourcetype />
        </D:prop>
      </D:propfind>`,
  });

  const calendars = extractResponseBlocks(calendarsXml)
    .filter((block) => isCalendarCollection(block))
    .map((block) => {
      const href = extractFirstTagText(block, "href");
      const displayName = extractFirstTagText(block, "displayname") ?? "Kalender";
      const url = href ? resolveUrl(baseUrl, href) : null;
      return {
        displayName,
        url,
      };
    })
    .filter((entry): entry is { displayName: string; url: string } => Boolean(entry.url));

  if (calendars.length === 0) {
    throw new Error("Geen iCloud kalenders gevonden");
  }

  const filters = parseCalendarFilters(calendarName);
  const isLegacyDefaultFamilyFilter =
    filters.length === 1 && filters[0] === "gezin";
  const shouldUseAllCalendars =
    filters.length === 0 ||
    filters.includes("all") ||
    filters.includes("alle") ||
    isLegacyDefaultFamilyFilter;

  const filteredCalendars = shouldUseAllCalendars
    ? calendars
    : calendars.filter((calendar) =>
        filters.some((filter) => calendar.displayName.toLowerCase().includes(filter)),
      );
  const selectedCalendars =
    filteredCalendars.length > 0 ? filteredCalendars : calendars;

  const startUtc = toCalDavUtcString(new Date());
  const endUtc = toCalDavUtcString(
    new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000),
  );

  const reports = await Promise.all(
    selectedCalendars.map(async (calendar) => {
      const eventsXml = await calDavRequest({
        url: calendar.url,
        method: "REPORT",
        username,
        password,
        depth: "1",
        body: `<?xml version="1.0" encoding="utf-8" ?>
          <C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
            <D:prop>
              <D:getetag />
              <C:calendar-data>
                <C:expand start="${startUtc}" end="${endUtc}" />
              </C:calendar-data>
            </D:prop>
            <C:filter>
              <C:comp-filter name="VCALENDAR">
                <C:comp-filter name="VEVENT">
                  <C:time-range start="${startUtc}" end="${endUtc}" />
                </C:comp-filter>
              </C:comp-filter>
            </C:filter>
          </C:calendar-query>`,
      });

      return {
        calendarName: calendar.displayName,
        eventsXml,
      };
    }),
  );

  const dedupeKeys = new Set<string>();
  const events = reports
    .flatMap((report) =>
      extractResponseBlocks(report.eventsXml)
        .map((block) => extractCalendarData(block))
        .filter((value): value is string => Boolean(value))
        .flatMap((ics) => parseIcalEvents(ics))
        .map((event) => ({
          event,
          calendarName: report.calendarName,
        })),
    )
    .sort((a, b) => a.event.start.date.getTime() - b.event.start.date.getTime())
    .flatMap(({ event, calendarName: sourceCalendarName }) => {
      const dedupeKey = [
        event.id,
        event.start.date.toISOString(),
        event.title,
        event.location ?? "",
      ].join("|");

      if (dedupeKeys.has(dedupeKey)) {
        return [];
      }

      dedupeKeys.add(dedupeKey);

      return [
        {
          id: `${sourceCalendarName}:${event.id}:${event.start.date.toISOString()}`,
          title: event.title,
          location: event.location,
          allDay: event.start.allDay,
          startIso: event.start.date.toISOString(),
          endIso: event.end?.date.toISOString() ?? null,
          dayLabel: formatDayLabel(event.start.date),
          timeLabel: formatTimeLabel(event),
        },
      ];
    })
    .slice(0, 60);

  return {
    calendarName:
      selectedCalendars.length === 1
        ? selectedCalendars[0].displayName
        : "Alle kalenders",
    events,
    fetchedAt: new Date().toISOString(),
  } satisfies CalendarModuleData;
}

export async function getCalendarModuleData({
  calendarName,
  daysAhead,
}: {
  calendarName: string;
  daysAhead: number;
}): Promise<CalendarModuleData | null> {
  const calendarConfig = getICloudCalendarConfig();

  if (!calendarConfig.username || !calendarConfig.password) {
    return null;
  }

  const normalizedDays = Math.max(1, Math.min(30, Math.trunc(daysAhead)));
  const cacheKey = [
    calendarConfig.baseUrl,
    calendarConfig.username,
    calendarName.trim().toLowerCase(),
    normalizedDays,
  ].join("|");

  const cached = calendarCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const data = await fetchCalendarData({
      baseUrl: calendarConfig.baseUrl,
      username: calendarConfig.username,
      password: calendarConfig.password,
      calendarName,
      daysAhead: normalizedDays,
    });

    calendarCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + Math.max(30, calendarConfig.cacheSeconds) * 1000,
    });

    return data;
  } catch (error) {
    console.error("Kon iCloud kalenderdata niet ophalen", {
      baseUrl: calendarConfig.baseUrl,
      username: calendarConfig.username,
      error: error instanceof Error ? error.message : "Onbekende fout",
    });
    return null;
  }
}
