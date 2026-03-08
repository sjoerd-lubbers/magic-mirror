import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";

export default async function DashboardPage() {
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    return (
      <main className="stack">
        <p>Geen huishouden gevonden voor deze gebruiker.</p>
      </main>
    );
  }

  const { household } = membership;

  return (
    <main className="stack">
      <section className="card stack-small">
        <div className="section-title-row">
          <h2>Spiegels</h2>
          <Link
            href="/dashboard/pair/scan"
            className="icon-action-button"
            aria-label="Scan QR om een scherm te koppelen"
            title="Scan QR"
          >
            +
          </Link>
        </div>

        {household.mirrors.length === 0 ? (
          <div className="stack-small">
            <p>Nog geen spiegels gekoppeld.</p>
            <div>
              <Link href="/dashboard/pair/scan" className="button-link button-small">
                Eerste spiegel koppelen
              </Link>
            </div>
          </div>
        ) : (
          <div className="mirror-overview-grid">
            {household.mirrors.map((mirror) => {
              const enabledModules = mirror.modules.filter((module) => module.enabled).length;

              return (
                <article key={mirror.id} className="mirror-overview-tile">
                  <div className="mirror-overview-icon" aria-hidden="true">
                    M
                  </div>
                  <div className="stack-small">
                    <h3>{mirror.name}</h3>
                    <p className="muted">{enabledModules} modules actief</p>
                    <p className="muted">ID: {mirror.id}</p>
                  </div>
                  <Link href={`/dashboard/mirrors/${mirror.id}`} className="button-link button-small">
                    Spiegel beheren
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
