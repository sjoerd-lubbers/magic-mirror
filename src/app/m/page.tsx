import { TimerPanel } from "@/components/mobile/TimerPanel";
import { requireUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";

type MobileTimerPageProps = {
  searchParams: Promise<{ mirrorId?: string }>;
};

export default async function MobileTimerPage({ searchParams }: MobileTimerPageProps) {
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);
  const params = await searchParams;

  if (!membership) {
    return (
      <main className="page-wrap">
        <p>Geen huishouden gevonden.</p>
      </main>
    );
  }

  const mirrors = membership.household.mirrors.map((mirror) => ({
    id: mirror.id,
    name: mirror.name,
  }));

  if (mirrors.length === 0) {
    return (
      <main className="center-page">
        <div className="card card-narrow">
          <p>Koppel eerst een spiegel via het dashboard.</p>
        </div>
      </main>
    );
  }

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
    <main className="center-page">
      <TimerPanel mirrors={orderedMirrors} />
    </main>
  );
}
