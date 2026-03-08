import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCalendarCacheOverview } from "@/lib/calendar";
import { getOpenWeatherApiKey, getSmtpConfig } from "@/lib/config";
import { getPrimaryHouseholdForUser } from "@/lib/household";
import {
  clearHouseholdICloudSettings,
  clearHouseholdTodoistSettings,
  getHouseholdCalendarRuntimeConfig,
  getHouseholdIntegrationSettings,
  getHouseholdTodoistRuntimeConfig,
  saveHouseholdICloudSettings,
  saveHouseholdTodoistSettings,
} from "@/lib/household-integrations";
import { getTodoistCacheOverview } from "@/lib/todoist";

const INTEGRATION_IDS = ["icloud", "todoist", "openweather", "smtp"] as const;
type IntegrationId = (typeof INTEGRATION_IDS)[number];
const SECRET_MASK = "********";

type IntegrationDetailPageProps = {
  params: Promise<{ integrationId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

function isIntegrationId(value: string): value is IntegrationId {
  return (INTEGRATION_IDS as readonly string[]).includes(value);
}

function integrationNotice(
  integrationId: IntegrationId,
  saved: string | undefined,
  error: string | undefined,
) {
  if (error === "forbidden") {
    return { kind: "error" as const, text: "Alleen owner/admin kan deze koppeling wijzigen." };
  }
  if (error === "missing_household") {
    return { kind: "error" as const, text: "Geen huishouden gevonden." };
  }

  if (integrationId === "icloud") {
    if (saved === "1") {
      return { kind: "success" as const, text: "iCloud instellingen opgeslagen." };
    }
    if (saved === "cleared") {
      return { kind: "success" as const, text: "iCloud instellingen gewist." };
    }
  }

  if (integrationId === "todoist") {
    if (saved === "1") {
      return { kind: "success" as const, text: "Todoist instellingen opgeslagen." };
    }
    if (saved === "cleared") {
      return { kind: "success" as const, text: "Todoist instellingen gewist." };
    }
  }

  return null;
}

function formatDateTime(iso: string | null) {
  if (!iso) {
    return "n.v.t.";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "n.v.t.";
  }

  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

async function saveICloudSettingsAction(formData: FormData) {
  "use server";

  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);
  if (!membership) {
    redirect("/dashboard/integrations/icloud?error=missing_household");
  }

  const canManage = membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  if (!canManage) {
    redirect("/dashboard/integrations/icloud?error=forbidden");
  }

  const action = String(formData.get("action") ?? "save");
  if (action === "clear") {
    await clearHouseholdICloudSettings(membership.householdId);
    redirect("/dashboard/integrations/icloud?saved=cleared");
  }

  const baseUrl = String(formData.get("baseUrl") ?? "");
  const usernameRaw = String(formData.get("username") ?? "").trim();
  const passwordRaw = String(formData.get("password") ?? "").trim();
  const cacheSecondsRaw = String(formData.get("cacheSeconds") ?? "").trim();
  const passwordToSet =
    passwordRaw && passwordRaw !== SECRET_MASK ? passwordRaw : undefined;

  await saveHouseholdICloudSettings({
    householdId: membership.householdId,
    baseUrl,
    usernameToSet: usernameRaw || undefined,
    passwordToSet,
    cacheSecondsRaw,
  });

  redirect("/dashboard/integrations/icloud?saved=1");
}

async function saveTodoistSettingsAction(formData: FormData) {
  "use server";

  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);
  if (!membership) {
    redirect("/dashboard/integrations/todoist?error=missing_household");
  }

  const canManage = membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  if (!canManage) {
    redirect("/dashboard/integrations/todoist?error=forbidden");
  }

  const action = String(formData.get("action") ?? "save");
  if (action === "clear") {
    await clearHouseholdTodoistSettings(membership.householdId);
    redirect("/dashboard/integrations/todoist?saved=cleared");
  }

  const apiTokenRaw = String(formData.get("apiToken") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "");
  const cacheSecondsRaw = String(formData.get("cacheSeconds") ?? "").trim();
  const apiTokenToSet =
    apiTokenRaw && apiTokenRaw !== SECRET_MASK ? apiTokenRaw : undefined;

  await saveHouseholdTodoistSettings({
    householdId: membership.householdId,
    apiTokenToSet,
    projectId,
    cacheSecondsRaw,
  });

  redirect("/dashboard/integrations/todoist?saved=1");
}

export default async function DashboardIntegrationDetailPage({
  params,
  searchParams,
}: IntegrationDetailPageProps) {
  const { integrationId: rawId } = await params;
  const query = await searchParams;

  if (!isIntegrationId(rawId)) {
    notFound();
  }

  const integrationId = rawId;
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    return (
      <main className="stack">
        <p>Geen huishouden gevonden.</p>
      </main>
    );
  }

  const canManage = membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  const smtp = getSmtpConfig();
  const openWeatherApiKey = getOpenWeatherApiKey();
  const stored = await getHouseholdIntegrationSettings(membership.householdId);
  const [calendar, todoist] = await Promise.all([
    getHouseholdCalendarRuntimeConfig(membership.householdId),
    getHouseholdTodoistRuntimeConfig(membership.householdId),
  ]);
  const calendarCache = getCalendarCacheOverview(membership.householdId);
  const todoistCache = getTodoistCacheOverview(membership.householdId);
  const maskedIcloudPassword = calendar.password ? SECRET_MASK : "";
  const maskedTodoistToken = todoist.apiToken ? SECRET_MASK : "";

  const notice = integrationNotice(integrationId, query.saved, query.error);

  return (
    <main className="stack">
      <section className="card stack-small">
        <div className="section-header">
          <h2>Integratie details</h2>
          <Link href="/dashboard/integrations" className="button-link button-secondary button-small">
            Terug
          </Link>
        </div>

        {notice ? (
          <p className={`notice ${notice.kind === "success" ? "success" : "error"}`}>
            {notice.text}
          </p>
        ) : null}

        {integrationId === "icloud" ? (
          <div className="stack-small">
            <div className="section-header">
              <strong>iCloud agenda</strong>
              <span className={`status-chip ${calendar.username && calendar.password ? "ok" : "warn"}`}>
                {calendar.username && calendar.password ? "Actief" : "Niet ingesteld"}
              </span>
            </div>
            <p className="muted">
              Bron: {calendar.source === "household" ? "Gezinsconfiguratie" : ".env fallback"}
            </p>
            <p className="muted">Base URL: {calendar.baseUrl}</p>
            <div className="module-config-card stack-small integration-diagnostics-card">
              <h4>Verversing en cache</h4>
              <dl className="integration-diagnostics-list">
                <div>
                  <dt>Cache TTL</dt>
                  <dd>{Math.max(30, calendar.cacheSeconds)}s</dd>
                </div>
                <div>
                  <dt>Cache entries</dt>
                  <dd>{calendarCache.entryCount}</dd>
                </div>
                <div>
                  <dt>Actieve entries</dt>
                  <dd>{calendarCache.activeEntryCount}</dd>
                </div>
                <div>
                  <dt>Laatste fetch</dt>
                  <dd>{formatDateTime(calendarCache.latestFetchedAt)}</dd>
                </div>
                <div>
                  <dt>Volgende expiry</dt>
                  <dd>{formatDateTime(calendarCache.nextExpiryAt)}</dd>
                </div>
                <div>
                  <dt>Resterend</dt>
                  <dd>
                    {calendarCache.nextExpiryInSeconds !== null
                      ? `${calendarCache.nextExpiryInSeconds}s`
                      : "n.v.t."}
                  </dd>
                </div>
              </dl>
            </div>

            {canManage ? (
              <form action={saveICloudSettingsAction} className="module-config-grid">
                <input type="hidden" name="action" value="save" />
                <label>
                  CalDAV base URL
                  <input
                    name="baseUrl"
                    defaultValue={stored?.iCloudCalDavUrl ?? ""}
                    placeholder="https://caldav.icloud.com"
                  />
                </label>
                <label>
                  Gebruikersnaam (leeg = behouden)
                  <input
                    name="username"
                    defaultValue={calendar.source === "household" ? (calendar.username ?? "") : ""}
                    placeholder="naam@icloud.com"
                  />
                </label>
                <label>
                  App password
                  <input
                    name="password"
                    type="password"
                    defaultValue={maskedIcloudPassword}
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                  />
                </label>
                <p className="muted">Een gemaskeerde waarde betekent: huidige geheime waarde behouden.</p>
                <label>
                  Cache seconden
                  <input
                    name="cacheSeconds"
                    type="number"
                    min={30}
                    max={86400}
                    defaultValue={stored?.calendarCacheSeconds ?? 300}
                  />
                </label>
                <div className="button-row">
                  <button type="submit" className="button-secondary">
                    Sla iCloud op
                  </button>
                  <button type="submit" name="action" value="clear" className="button-secondary">
                    Wis iCloud
                  </button>
                </div>
              </form>
            ) : (
              <p className="muted">Alleen owner/admin kan deze instellingen wijzigen.</p>
            )}
          </div>
        ) : null}

        {integrationId === "todoist" ? (
          <div className="stack-small">
            <div className="section-header">
              <strong>Todoist</strong>
              <span className={`status-chip ${todoist.apiToken ? "ok" : "warn"}`}>
                {todoist.apiToken ? "Actief" : "Niet ingesteld"}
              </span>
            </div>
            <p className="muted">
              Bron: {todoist.source === "household" ? "Gezinsconfiguratie" : ".env fallback"}
            </p>
            <p className="muted">Project ID: {todoist.projectId || "(geen projectfilter)"}</p>
            <div className="module-config-card stack-small integration-diagnostics-card">
              <h4>Verversing en cache</h4>
              <dl className="integration-diagnostics-list">
                <div>
                  <dt>Server cache TTL</dt>
                  <dd>{Math.max(15, todoist.cacheSeconds)}s</dd>
                </div>
                <div>
                  <dt>Cache entries</dt>
                  <dd>{todoistCache.entryCount}</dd>
                </div>
                <div>
                  <dt>Actieve entries</dt>
                  <dd>{todoistCache.activeEntryCount}</dd>
                </div>
                <div>
                  <dt>Laatste fetch</dt>
                  <dd>{formatDateTime(todoistCache.latestFetchedAt)}</dd>
                </div>
                <div>
                  <dt>Volgende expiry</dt>
                  <dd>{formatDateTime(todoistCache.nextExpiryAt)}</dd>
                </div>
                <div>
                  <dt>Resterend</dt>
                  <dd>
                    {todoistCache.nextExpiryInSeconds !== null
                      ? `${todoistCache.nextExpiryInSeconds}s`
                      : "n.v.t."}
                  </dd>
                </div>
              </dl>
            </div>

            {canManage ? (
              <form action={saveTodoistSettingsAction} className="module-config-grid">
                <input type="hidden" name="action" value="save" />
                <label>
                  API token
                  <input
                    name="apiToken"
                    type="password"
                    defaultValue={maskedTodoistToken}
                    placeholder="todoist token"
                  />
                </label>
                <p className="muted">Een gemaskeerde waarde betekent: huidige geheime waarde behouden.</p>
                <label>
                  Project ID (optioneel)
                  <input
                    name="projectId"
                    defaultValue={stored?.todoistProjectId ?? ""}
                    placeholder="Leeg = alle projecten"
                  />
                </label>
                <label>
                  Cache seconden
                  <input
                    name="cacheSeconds"
                    type="number"
                    min={15}
                    max={3600}
                    defaultValue={stored?.todoistCacheSeconds ?? 60}
                  />
                </label>
                <div className="button-row">
                  <button type="submit" className="button-secondary">
                    Sla Todoist op
                  </button>
                  <button type="submit" name="action" value="clear" className="button-secondary">
                    Wis Todoist
                  </button>
                </div>
              </form>
            ) : (
              <p className="muted">Alleen owner/admin kan deze instellingen wijzigen.</p>
            )}
          </div>
        ) : null}

        {integrationId === "openweather" ? (
          <div className="stack-small">
            <div className="section-header">
              <strong>OpenWeather</strong>
              <span className={`status-chip ${openWeatherApiKey ? "ok" : "warn"}`}>
                {openWeatherApiKey ? "Actief" : "Niet ingesteld"}
              </span>
            </div>
            <p className="muted">
              {openWeatherApiKey
                ? "API key beschikbaar in .env (globale instelling)."
                : "OPENWEATHER_API_KEY ontbreekt in .env."}
            </p>
            <div className="module-config-card stack-small integration-diagnostics-card">
              <h4>Verversing en cache</h4>
              <dl className="integration-diagnostics-list">
                <div>
                  <dt>Huidig weer</dt>
                  <dd>15 min revalidate</dd>
                </div>
                <div>
                  <dt>Forecast</dt>
                  <dd>24 uur revalidate</dd>
                </div>
                <div>
                  <dt>Cache type</dt>
                  <dd>Next.js fetch-cache</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}

        {integrationId === "smtp" ? (
          <div className="stack-small">
            <div className="section-header">
              <strong>SMTP</strong>
              <span className="status-chip ok">Globaal</span>
            </div>
            <p className="muted">
              Host: {smtp.host}:{smtp.port}
            </p>
            <p className="muted">Deze koppeling wordt centraal via .env beheerd.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
