import { requireUser } from "@/lib/auth";
import {
  getICloudCalendarConfig,
  getOpenWeatherApiKey,
  getSmtpConfig,
  getTodoistConfig,
} from "@/lib/config";

type IntegrationStatus = {
  name: string;
  enabled: boolean;
  detailEnabled: string;
  detailDisabled: string;
};

function statusForIntegrations(): IntegrationStatus[] {
  const smtp = getSmtpConfig();
  const openWeatherApiKey = getOpenWeatherApiKey();
  const iCloud = getICloudCalendarConfig();
  const todoist = getTodoistConfig();

  return [
    {
      name: "SMTP",
      enabled: Boolean(smtp.host && smtp.port && smtp.from),
      detailEnabled: `Actief via ${smtp.host}:${smtp.port}`,
      detailDisabled: "Configureer SMTP_HOST, SMTP_PORT en SMTP_FROM.",
    },
    {
      name: "OpenWeather",
      enabled: Boolean(openWeatherApiKey),
      detailEnabled: "API key gevonden.",
      detailDisabled: "OPENWEATHER_API_KEY ontbreekt.",
    },
    {
      name: "iCloud agenda",
      enabled: Boolean(iCloud.username && iCloud.password),
      detailEnabled: `Actief (${iCloud.username})`,
      detailDisabled: "ICLOUD username/password ontbreekt.",
    },
    {
      name: "Todoist",
      enabled: Boolean(todoist.apiToken),
      detailEnabled: todoist.projectId
        ? `Token + project ingesteld (${todoist.projectId})`
        : "Token ingesteld (zonder projectfilter).",
      detailDisabled: "TODOIST_API_TOKEN ontbreekt.",
    },
  ];
}

export default async function DashboardIntegrationsPage() {
  await requireUser();
  const statuses = statusForIntegrations();

  return (
    <main className="stack">
      <section className="card stack-small">
        <h2>Integraties</h2>
        <p className="muted">
          Snelle statuscontrole van de externe koppelingen op deze omgeving.
        </p>
        <ul className="simple-list">
          {statuses.map((item) => (
            <li key={item.name} className="mirror-card">
              <div className="section-header">
                <strong>{item.name}</strong>
                <span className={`status-chip ${item.enabled ? "ok" : "warn"}`}>
                  {item.enabled ? "Actief" : "Niet ingesteld"}
                </span>
              </div>
              <p className="muted">{item.enabled ? item.detailEnabled : item.detailDisabled}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
