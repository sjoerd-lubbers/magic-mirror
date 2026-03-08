import { requireUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";

export default async function DashboardFamilyPage() {
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    return (
      <main className="stack">
        <p>Geen huishouden gevonden.</p>
      </main>
    );
  }

  return (
    <main className="stack">
      <section className="card stack-small">
        <h2>Gezinsleden</h2>
        <p className="muted">Overzicht van wie deze spiegels mag gebruiken.</p>
        <ul className="simple-list">
          {membership.household.members.map((member) => (
            <li key={member.id} className="mirror-card">
              <div className="section-header">
                <div>
                  <p>{member.user.displayName ?? member.user.email}</p>
                  <p className="muted">{member.user.email}</p>
                </div>
                <strong>{member.role.toLowerCase()}</strong>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
