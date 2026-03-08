import Link from "next/link";
import { PairQrScanner } from "@/components/dashboard/PairQrScanner";
import { requireUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";

type PairScanPageProps = {
  searchParams: Promise<{ targetMirrorId?: string }>;
};

export default async function PairScanPage({ searchParams }: PairScanPageProps) {
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);
  const params = await searchParams;
  const targetMirrorId = params.targetMirrorId?.trim();

  const targetMirror = targetMirrorId
    ? membership?.household.mirrors.find((mirror) => mirror.id === targetMirrorId) ?? null
    : null;

  return (
    <main className="stack">
      <section className="card stack-small">
        <div className="section-header">
          <h1>Koppel via camera</h1>
          <Link href="/dashboard/mirrors" className="button-link button-small">
            Terug
          </Link>
        </div>
        {targetMirror ? (
          <p className="muted">
            Doelspiegel: <strong>{targetMirror.name}</strong>. Na scan wordt direct aan
            deze spiegel gekoppeld.
          </p>
        ) : (
          <p className="muted">
            Scan de QR-code die op het scherm staat. Daarna kies je of je aan een
            bestaande of nieuwe spiegel koppelt.
          </p>
        )}
      </section>

      <PairQrScanner targetMirrorId={targetMirror?.id} />
    </main>
  );
}
