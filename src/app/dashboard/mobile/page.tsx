import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";

export default async function DashboardMobilePage() {
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    return (
      <main className="stack">
        <p>Geen huishouden gevonden.</p>
      </main>
    );
  }

  const mirrors = membership.household.mirrors;

  return (
    <main className="stack">
      <section className="card stack-small">
        <h2>Mobiele bediening</h2>
        <p className="muted">
          Gebruik de mobiele timerpagina om snel timers te starten en lopende timers te zien.
        </p>
        <div className="button-row">
          <Link href="/m" className="button-link">
            Open mobiele timerpagina
          </Link>
        </div>
      </section>

      <section className="card stack-small">
        <h2>Snelle links per spiegel</h2>
        {mirrors.length === 0 ? (
          <p>Nog geen spiegels gekoppeld.</p>
        ) : (
          <ul className="simple-list">
            {mirrors.map((mirror) => (
              <li key={mirror.id} className="mirror-card">
                <div className="section-header">
                  <div>
                    <p>{mirror.name}</p>
                    <p className="muted">ID: {mirror.id}</p>
                  </div>
                  <Link href={`/m?mirrorId=${mirror.id}`} className="button-link button-small">
                    Open mobiel voor deze spiegel
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
