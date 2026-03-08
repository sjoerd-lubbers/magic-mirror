import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function DashboardSystemPage() {
  await requireUser();

  return (
    <main className="stack">
      <section className="card stack-small">
        <h2>Systeem</h2>
        <p className="muted">
          Operationele acties voor device-koppeling en spiegelweergave.
        </p>
        <div className="button-row">
          <Link href="/dashboard/pair" className="button-link button-small">
            Nieuwe koppel-QR starten
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
