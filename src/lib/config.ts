const APP_URL_FALLBACK = "http://localhost:3000";

export function getAppUrl() {
  return process.env.APP_URL ?? APP_URL_FALLBACK;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function pickFirstHeaderValue(value: string | null) {
  if (!value) {
    return null;
  }

  const first = value.split(",")[0]?.trim();
  return first || null;
}

export function getAppUrlFromHeaders(headerGetter: Pick<Headers, "get">) {
  const forwardedHost = pickFirstHeaderValue(headerGetter.get("x-forwarded-host"));
  const host = forwardedHost ?? pickFirstHeaderValue(headerGetter.get("host"));
  const forwardedProto = pickFirstHeaderValue(headerGetter.get("x-forwarded-proto"));
  const proto =
    forwardedProto ??
    (process.env.NODE_ENV === "production" ? "https" : "http");

  if (!host) {
    return normalizeBaseUrl(getAppUrl());
  }

  return `${proto}://${host}`;
}

export function getCookieSecure() {
  if (process.env.COOKIE_SECURE !== undefined) {
    return resolveBoolean(process.env.COOKIE_SECURE, false);
  }

  return process.env.NODE_ENV === "production";
}

export function getAuthCodeSecret() {
  return process.env.AUTH_CODE_SECRET ?? "dev-only-auth-code-secret";
}

export function getSmtpConfig() {
  const host = process.env.SMTP_HOST ?? "127.0.0.1";
  const port = Number(process.env.SMTP_PORT ?? 1025);
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? resolveBoolean(process.env.SMTP_SECURE, false)
      : port === 465;
  const ignoreTLS =
    process.env.SMTP_IGNORE_TLS !== undefined
      ? resolveBoolean(process.env.SMTP_IGNORE_TLS, false)
      : ["localhost", "127.0.0.1", "::1"].includes(host);
  const tlsRejectUnauthorized =
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== undefined
      ? resolveBoolean(process.env.SMTP_TLS_REJECT_UNAUTHORIZED, true)
      : !["localhost", "127.0.0.1", "::1"].includes(host);

  return {
    host,
    port,
    secure,
    ignoreTLS,
    tlsRejectUnauthorized,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? "noreply@magicmirror.local",
  };
}

export function getOpenWeatherApiKey() {
  return process.env.OPENWEATHER_API_KEY;
}

export function resolveBoolean(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function getICloudCalendarConfig() {
  const baseUrl = process.env.ICLOUD_CALDAV_URL ?? "https://caldav.icloud.com";
  const username =
    process.env.ICLOUD_CALDAV_USERNAME ??
    process.env.ICLOUD_USERNAME ??
    process.env.ICLOUD_EMAIL ??
    "";
  const password =
    process.env.ICLOUD_CALDAV_PASSWORD ??
    process.env.ICLOUD_PASSWORD ??
    process.env.ICLOUD_APP_PASSWORD ??
    "";
  const cacheSeconds = Number(process.env.CALENDAR_CACHE_SECONDS ?? 300);

  return {
    baseUrl,
    username,
    password,
    cacheSeconds: Number.isFinite(cacheSeconds) ? cacheSeconds : 300,
  };
}

export function getTodoistConfig() {
  const apiToken = process.env.TODOIST_API_TOKEN ?? "";
  const projectId =
    process.env.TODOIST_PROJECT_ID ??
    process.env.TODOIST_RECIPES_PROJECT_ID ??
    "";
  const cacheSeconds = Number(process.env.TODOIST_CACHE_SECONDS ?? 60);

  return {
    apiToken,
    projectId,
    cacheSeconds: Number.isFinite(cacheSeconds) ? cacheSeconds : 60,
  };
}

export function getWebPushConfig() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject =
    process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || "mailto:noreply@magicmirror.local";

  return {
    publicKey,
    privateKey,
    subject,
    enabled: Boolean(publicKey && privateKey),
  };
}
