import Link from "next/link";
import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { getAppUrlFromHeaders } from "@/lib/config";
import {
  getPendingMirrorClaimSession,
  normalizeClaimToken,
  claimMirrorSession,
} from "@/lib/mirror-claim";
import { createMirrorWithDefaultModules } from "@/lib/mirror-registration";
import { getPrimaryHouseholdForUser } from "@/lib/household";
import { createPairingCode } from "@/lib/pairing";
import { prisma } from "@/lib/prisma";

type PairMirrorPageProps = {
  searchParams: Promise<{
    source?: string;
    claimToken?: string;
    done?: string;
    mirrorId?: string;
    error?: string;
  }>;
};

function buildDefaultMirrorName() {
  return `Spiegel ${new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date())}`;
}

function claimErrorMessage(error: string | undefined) {
  if (error === "claim_missing") {
    return "Claim-token ontbreekt.";
  }
  if (error === "claim_invalid") {
    return "Claim-token is ongeldig of verlopen. Vernieuw de QR op de spiegel.";
  }
  if (error === "coords") {
    return "Coordinaten zijn ongeldig.";
  }
  if (error === "no_household") {
    return "Geen huishouden gevonden voor deze gebruiker.";
  }
  if (error === "claim_race") {
    return "Deze claim is net gebruikt of verlopen. Vernieuw de QR op de spiegel.";
  }
  if (error === "existing_missing") {
    return "Kies een bestaande spiegel om te koppelen.";
  }
  if (error === "existing_invalid") {
    return "Gekozen spiegel bestaat niet in dit huishouden.";
  }

  return null;
}

async function linkExistingMirrorToClaim(formData: FormData) {
  "use server";

  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    redirect("/dashboard/pair?error=no_household");
  }

  const claimToken = normalizeClaimToken(String(formData.get("claimToken") ?? ""));

  if (!claimToken) {
    redirect("/dashboard/pair?error=claim_missing");
  }

  const claim = await getPendingMirrorClaimSession(claimToken);

  if (!claim) {
    redirect(`/dashboard/pair?claimToken=${encodeURIComponent(claimToken)}&error=claim_invalid`);
  }

  const existingMirrorId = String(formData.get("existingMirrorId") ?? "").trim();

  if (!existingMirrorId) {
    redirect(
      `/dashboard/pair?claimToken=${encodeURIComponent(claimToken)}&error=existing_missing`,
    );
  }

  const existingMirror = await prisma.mirror.findFirst({
    where: {
      id: existingMirrorId,
      householdId: membership.householdId,
    },
    select: {
      id: true,
    },
  });

  if (!existingMirror) {
    redirect(
      `/dashboard/pair?claimToken=${encodeURIComponent(claimToken)}&error=existing_invalid`,
    );
  }

  const claimResult = await claimMirrorSession({
    token: claimToken,
    mirrorId: existingMirror.id,
  });

  if (!claimResult) {
    redirect(`/dashboard/pair?claimToken=${encodeURIComponent(claimToken)}&error=claim_race`);
  }

  redirect(
    `/dashboard/pair?claimToken=${encodeURIComponent(claimToken)}&done=1&mirrorId=${encodeURIComponent(existingMirror.id)}`,
  );
}

async function createNewMirrorFromClaim(formData: FormData) {
  "use server";

  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    redirect("/dashboard/pair?error=no_household");
  }

  const claimToken = normalizeClaimToken(String(formData.get("claimToken") ?? ""));

  if (!claimToken) {
    redirect("/dashboard/pair?error=claim_missing");
  }

  const claim = await getPendingMirrorClaimSession(claimToken);

  if (!claim) {
    redirect(`/dashboard/pair?claimToken=${encodeURIComponent(claimToken)}&error=claim_invalid`);
  }

  const nameRaw = String(formData.get("name") ?? "").trim();
  const locationNameRaw = String(formData.get("locationName") ?? "").trim();
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();

  const latitude = latitudeRaw ? Number(latitudeRaw) : null;
  const longitude = longitudeRaw ? Number(longitudeRaw) : null;

  if ((latitudeRaw && Number.isNaN(latitude)) || (longitudeRaw && Number.isNaN(longitude))) {
    redirect(`/dashboard/pair?claimToken=${encodeURIComponent(claimToken)}&error=coords`);
  }

  const mirror = await createMirrorWithDefaultModules({
    householdId: membership.householdId,
    name: nameRaw || buildDefaultMirrorName(),
    locationName: locationNameRaw || null,
    latitude,
    longitude,
  });

  const claimResult = await claimMirrorSession({
    token: claimToken,
    mirrorId: mirror.id,
  });

  if (!claimResult) {
    await prisma.mirror.delete({
      where: {
        id: mirror.id,
      },
    }).catch(() => undefined);

    redirect(`/dashboard/pair?claimToken=${encodeURIComponent(claimToken)}&error=claim_race`);
  }

  redirect(
    `/dashboard/pair?claimToken=${encodeURIComponent(claimToken)}&done=1&mirrorId=${encodeURIComponent(mirror.id)}`,
  );
}

export default async function PairMirrorPage({ searchParams }: PairMirrorPageProps) {
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

  const fromMirror = params.source === "mirror";
  const claimToken = normalizeClaimToken(params.claimToken);
  const error = claimErrorMessage(params.error);

  if (claimToken) {
    const done = params.done === "1";
    const pendingClaim = done ? null : await getPendingMirrorClaimSession(claimToken);
    const linkedMirrorId = params.mirrorId?.trim() || null;

    return (
      <main className="page-wrap stack">
        <header className="section-header">
          <h1>Spiegel koppelen</h1>
          <Link href="/dashboard" className="button-link button-small">
            Terug
          </Link>
        </header>

        <section className="card card-narrow stack-small">
          {done && linkedMirrorId ? (
            <>
              <p className="notice success">
                Spiegel gekoppeld. Op het spiegel-scherm wordt nu automatisch doorgeschakeld.
              </p>
              <Link href={`/mirror/${linkedMirrorId}`} className="button-link button-small">
                Open gekoppelde spiegel
              </Link>
            </>
          ) : null}

          {!done && pendingClaim ? (
            <>
              <p>
                {fromMirror
                  ? "Scan kwam van de spiegel. Rond hieronder de registratie af."
                  : "Rond hieronder de registratie af."}
              </p>
              {membership.household.mirrors.length > 0 ? (
                <form action={linkExistingMirrorToClaim} className="stack">
                  <input type="hidden" name="claimToken" value={claimToken} />

                  <label>
                    Koppel aan bestaande spiegel
                    <select
                      name="existingMirrorId"
                      defaultValue={membership.household.mirrors[0]?.id}
                    >
                      {membership.household.mirrors.map((mirror) => (
                        <option key={mirror.id} value={mirror.id}>
                          {mirror.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button type="submit" className="button-secondary">
                    Koppel aan bestaande spiegel
                  </button>
                </form>
              ) : null}

              <p className="muted">
                {membership.household.mirrors.length > 0
                  ? "Of maak een nieuwe spiegel aan:"
                  : "Maak een nieuwe spiegel aan:"}
              </p>

              <form action={createNewMirrorFromClaim} className="stack">
                <input type="hidden" name="claimToken" value={claimToken} />

                <label>
                  Spiegelnaam (optioneel)
                  <input
                    name="name"
                    maxLength={60}
                    placeholder={`Leeg = ${buildDefaultMirrorName()}`}
                  />
                </label>

                <label>
                  Locatienaam (optioneel)
                  <input name="locationName" placeholder="Amsterdam" maxLength={80} />
                </label>

                <label>
                  Latitude (optioneel)
                  <input name="latitude" placeholder="52.3676" />
                </label>

                <label>
                  Longitude (optioneel)
                  <input name="longitude" placeholder="4.9041" />
                </label>

                <button type="submit">Koppel spiegel nu</button>
              </form>
            </>
          ) : null}

          {!done && !pendingClaim ? (
            <p className="notice error">
              Claim-token is niet meer geldig. Vernieuw de QR-code op de spiegel.
            </p>
          ) : null}

          {error ? <p className="notice error">{error}</p> : null}
        </section>
      </main>
    );
  }

  const pairing = await createPairingCode({
    householdId: membership.householdId,
    createdById: user.id,
  });

  const appUrl = getAppUrlFromHeaders(await headers());
  const pairingUrl = `${appUrl}/mirror/register?token=${pairing.token}`;
  const qrDataUrl = await QRCode.toDataURL(pairingUrl, {
    margin: 1,
    width: 280,
  });

  return (
    <main className="page-wrap stack">
      <header className="section-header">
        <h1>Spiegel koppelen</h1>
        <Link href="/dashboard" className="button-link button-small">
          Terug
        </Link>
      </header>

      <section className="card card-narrow stack-small">
        <p>
          Legacy flow: gebruik de korte code op de spiegel of scan de QR-code met de
          browser op de spiegelcomputer.
        </p>

        <p className="pair-code">{pairing.displayCode ?? "------"}</p>
        <p className="muted">Koppelcode (geldig voor 15 minuten)</p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="QR voor spiegel koppeling" className="qr-image" />
        <p className="muted">{pairingUrl}</p>
      </section>
    </main>
  );
}
