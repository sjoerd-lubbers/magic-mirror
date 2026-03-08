import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function DashboardSystemPage() {
  await requireUser();

  return (
    <main className="stack">
      <section className="card stack-small">
        <h2>Systeem</h2>
        <p className="muted">
          Deze tab is vooral voor technische checks. Dagelijks beheer doe je via Spiegels, Gezin en
          Koppelingen.
        </p>
        <ul className="simple-list">
          <li>
            Nieuwe schermen koppelen: ga naar <strong>Spiegels</strong> en gebruik de plusknop.
          </li>
          <li>
            Timers zetten: ga naar <strong>Timers</strong>.
          </li>
          <li>
            Integraties en API keys: ga naar <strong>Koppelingen</strong>.
          </li>
        </ul>
        <div className="button-row">
          <Link href="/dashboard/mirrors" className="button-link button-small">
            Naar Spiegelbeheer
          </Link>
          <Link href="/mirror" className="button-link button-secondary button-small">
            Mirror bootflow testen
          </Link>
        </div>
      </section>

      <section className="card stack-small">
        <h2>Deploy checklist</h2>
        <ul className="simple-list">
          <li>Controleer dat DATABASE_URL wijst naar een persistent pad.</li>
          <li>Controleer dat APP_URL je publieke domein gebruikt.</li>
          <li>Run migraties bij deploy: `npx prisma migrate deploy`.</li>
          <li>Verifieer integratiestatus op tab Integraties.</li>
        </ul>
      </section>
    </main>
  );
}
