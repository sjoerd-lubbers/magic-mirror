import { TimerPanel } from "@/components/mobile/TimerPanel";
import { requireUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";

type DashboardMobilePageProps = {
  searchParams: Promise<{ mirrorId?: string }>;
};

export default async function DashboardMobilePage({
  searchParams,
}: DashboardMobilePageProps) {
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

  const mirrors = membership.household.mirrors.map((mirror) => ({
    id: mirror.id,
    name: mirror.name,
  }));

  const orderedMirrors = [...mirrors].sort((a, b) => {
    if (a.id === params.mirrorId) {
      return -1;
    }
    if (b.id === params.mirrorId) {
      return 1;
    }
    return 0;
  });

  return (
    <main className="stack">
      {mirrors.length > 0 ? (
        <TimerPanel mirrors={orderedMirrors} />
      ) : null}
      {mirrors.length === 0 ? (
        <section className="card stack-small">
          <p className="muted">Koppel eerst een spiegel op het tabblad Spiegels.</p>
        </section>
      ) : null}
    </main>
  );
}
