import { AvatarMenu } from "@/components/dashboard/AvatarMenu";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { requireUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);
  const householdName = membership?.household.name ?? "Magic Mirror";

  return (
    <main className="dashboard-shell">
      <header className="card dashboard-header-shell">
        <div>
          <p className="muted dashboard-eyebrow">Magic Mirror</p>
          <h1>{householdName}</h1>
        </div>
        <AvatarMenu displayName={user.displayName} email={user.email} />
      </header>

      <div className="dashboard-main">
        <DashboardNav />
        <section className="dashboard-content">{children}</section>
      </div>
    </main>
  );
}
