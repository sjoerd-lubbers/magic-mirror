import Link from "next/link";
import { redirect } from "next/navigation";
import { IntegrationSettingsCopyButton } from "@/components/dashboard/IntegrationSettingsCopyButton";
import { requireUser } from "@/lib/auth";
import { getOpenWeatherApiKey, getSmtpConfig } from "@/lib/config";
import { getPrimaryHouseholdForUser } from "@/lib/household";
import {
  getHouseholdCalendarRuntimeConfig,
  getHouseholdTodoistRuntimeConfig,
  saveHouseholdICloudSettings,
  saveHouseholdTodoistSettings,
} from "@/lib/household-integrations";

type DashboardIntegrationsPageProps = {
  searchParams: Promise<{ copy?: string; error?: string }>;
};

type IntegrationSnapshot = {
  version: 1;
  householdIntegration: {
    iCloud: {
      baseUrl: string;
      username: string;
      password: string;
      cacheSeconds: number;
    };
    todoist: {
      apiToken: string;
      projectId: string;
      cacheSeconds: number;
    };
  };
};

function parseIntegrationSnapshot(value: string): IntegrationSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<IntegrationSnapshot>;

    if (parsed.version !== 1 || !parsed.householdIntegration) {
      return null;
    }

    const iCloud = parsed.householdIntegration.iCloud;
    const todoist = parsed.householdIntegration.todoist;

    if (!iCloud || !todoist) {
      return null;
    }

    if (
      typeof iCloud.baseUrl !== "string" ||
      typeof iCloud.username !== "string" ||
      typeof iCloud.password !== "string" ||
      !Number.isFinite(iCloud.cacheSeconds) ||
      typeof todoist.apiToken !== "string" ||
      typeof todoist.projectId !== "string" ||
      !Number.isFinite(todoist.cacheSeconds)
    ) {
      return null;
    }

    return {
      version: 1,
      householdIntegration: {
        iCloud: {
          baseUrl: iCloud.baseUrl,
          username: iCloud.username,
          password: iCloud.password,
          cacheSeconds: Math.max(30, Math.trunc(iCloud.cacheSeconds)),
        },
        todoist: {
          apiToken: todoist.apiToken,
          projectId: todoist.projectId,
          cacheSeconds: Math.max(15, Math.min(3600, Math.trunc(todoist.cacheSeconds))),
        },
      },
    };
  } catch {
    return null;
  }
}

function integrationCopyNotice(copy: string | undefined, error: string | undefined) {
  if (copy === "imported") {
    return { kind: "success" as const, text: "Integratie-instellingen zijn geimporteerd." };
  }

  if (error === "invalid_json") {
    return { kind: "error" as const, text: "Integratie JSON is ongeldig." };
  }
  if (error === "forbidden") {
    return { kind: "error" as const, text: "Alleen owner/admin kan dit uitvoeren." };
  }
  if (error === "missing_household") {
    return { kind: "error" as const, text: "Geen huishouden gevonden." };
  }

  return null;
}

async function importIntegrationSettingsAction(formData: FormData) {
  "use server";

  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    redirect("/dashboard/integrations?error=missing_household");
  }

  const canManage = membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  if (!canManage) {
    redirect("/dashboard/integrations?error=forbidden");
  }

  const snapshotRaw = String(formData.get("settingsJson") ?? "").trim();
  if (!snapshotRaw) {
    redirect("/dashboard/integrations?error=invalid_json");
  }

  const snapshot = parseIntegrationSnapshot(snapshotRaw);
  if (!snapshot) {
    redirect("/dashboard/integrations?error=invalid_json");
  }

  await saveHouseholdICloudSettings({
    householdId: membership.householdId,
    baseUrl: snapshot.householdIntegration.iCloud.baseUrl,
    usernameToSet: snapshot.householdIntegration.iCloud.username,
    passwordToSet: snapshot.householdIntegration.iCloud.password,
    cacheSecondsRaw: String(snapshot.householdIntegration.iCloud.cacheSeconds),
  });

  await saveHouseholdTodoistSettings({
    householdId: membership.householdId,
    apiTokenToSet: snapshot.householdIntegration.todoist.apiToken,
    projectId: snapshot.householdIntegration.todoist.projectId,
    cacheSecondsRaw: String(snapshot.householdIntegration.todoist.cacheSeconds),
  });

  redirect("/dashboard/integrations?copy=imported");
}

export default async function DashboardIntegrationsPage({
  searchParams,
}: DashboardIntegrationsPageProps) {
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);
  const params = await searchParams;

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
  const calendar = await getHouseholdCalendarRuntimeConfig(membership.householdId);
  const todoist = await getHouseholdTodoistRuntimeConfig(membership.householdId);

  const calendarConfigured = Boolean(calendar.username && calendar.password);
  const todoistConfigured = Boolean(todoist.apiToken);
  const copyNotice = integrationCopyNotice(params.copy, params.error);

  return (
    <main className="stack">
      <section className="card stack-small">
        <h2>Integraties</h2>
        <p className="muted">Kies een integratie om details en instellingen te bekijken.</p>
      </section>

      <section className="card stack-small">
        <div className="section-header">
          <h3>Gezinsspecifiek</h3>
          <span className="status-chip">Per gezin</span>
        </div>
        <p className="muted">Deze instellingen gelden alleen voor dit gezin.</p>

        <div className="integration-tile-grid">
          <Link href="/dashboard/integrations/icloud" className="integration-tile">
            <strong>iCloud agenda</strong>
            <p className="muted">Agenda items op de spiegel</p>
            <span className={`status-chip ${calendarConfigured ? "ok" : "warn"}`}>
              {calendarConfigured ? "Actief" : "Niet ingesteld"}
            </span>
            <p className="muted">Bron: {calendar.source === "household" ? "Gezin" : ".env fallback"}</p>
          </Link>

          <Link href="/dashboard/integrations/todoist" className="integration-tile">
            <strong>Todoist</strong>
            <p className="muted">Open taken tonen op de spiegel</p>
            <span className={`status-chip ${todoistConfigured ? "ok" : "warn"}`}>
              {todoistConfigured ? "Actief" : "Niet ingesteld"}
            </span>
            <p className="muted">Bron: {todoist.source === "household" ? "Gezin" : ".env fallback"}</p>
          </Link>
        </div>

        {canManage ? (
          <div className="module-config-card stack-small">
            <h4>Integraties kopieren</h4>
            <p className="muted">
              Gebruik dit om gezinsspecifieke koppelingen van productie naar development te kopieren.
            </p>

            {copyNotice ? (
              <p className={`notice ${copyNotice.kind === "success" ? "success" : "error"}`}>
                {copyNotice.text}
              </p>
            ) : null}

            <IntegrationSettingsCopyButton />

            <form action={importIntegrationSettingsAction} className="module-config-grid">
              <label>
                Integratie JSON
                <textarea
                  name="settingsJson"
                  rows={8}
                  required
                  placeholder='{"version":1,"householdIntegration":{...}}'
                />
              </label>
              <div>
                <button type="submit" className="button-secondary">
                  Importeer integraties
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </section>

      <section className="card stack-small">
        <div className="section-header">
          <h3>Globaal via .env</h3>
          <span className="status-chip ok">Serverbreed</span>
        </div>
        <p className="muted">Deze instellingen gelden voor alle gezinnen op deze installatie.</p>

        <div className="integration-tile-grid">
          <Link href="/dashboard/integrations/openweather" className="integration-tile">
            <strong>OpenWeather</strong>
            <p className="muted">Weerdata (globale API key)</p>
            <span className={`status-chip ${openWeatherApiKey ? "ok" : "warn"}`}>
              {openWeatherApiKey ? "Actief" : "Niet ingesteld"}
            </span>
          </Link>

          <Link href="/dashboard/integrations/smtp" className="integration-tile">
            <strong>SMTP</strong>
            <p className="muted">Inlogcodes per e-mail</p>
            <span className="status-chip ok">{smtp.host ? "Globaal" : "Onbekend"}</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
