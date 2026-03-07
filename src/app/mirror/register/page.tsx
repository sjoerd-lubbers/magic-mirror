import { redirect } from "next/navigation";
import { MirrorRegisterClient } from "@/components/mirror/MirrorRegisterClient";
import { createMirrorWithDefaultModules } from "@/lib/mirror-registration";
import { getValidPairingCode } from "@/lib/pairing";
import { prisma } from "@/lib/prisma";

type RegisterPageProps = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

async function registerMirror(formData: FormData) {
  "use server";

  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const locationName = String(formData.get("locationName") ?? "").trim();
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();

  if (!token || !name) {
    redirect("/mirror/register?error=missing");
  }

  const pairing = await getValidPairingCode(token);

  if (!pairing) {
    redirect("/mirror/register?error=invalid");
  }

  const latitude = latitudeRaw ? Number(latitudeRaw) : null;
  const longitude = longitudeRaw ? Number(longitudeRaw) : null;

  if ((latitudeRaw && Number.isNaN(latitude)) || (longitudeRaw && Number.isNaN(longitude))) {
    redirect(`/mirror/register?token=${token}&error=coords`);
  }

  const mirror = await createMirrorWithDefaultModules({
    householdId: pairing.householdId,
    name,
    locationName: locationName || null,
    latitude,
    longitude,
  });

  await prisma.mirrorPairingCode.update({
    where: { id: pairing.id },
    data: { usedAt: new Date() },
  });

  redirect(`/mirror/${mirror.id}`);
}

function errorMessage(error: string | undefined) {
  if (error === "invalid") {
    return "Token ongeldig of verlopen.";
  }

  if (error === "coords") {
    return "Coordinaten zijn ongeldig.";
  }

  if (error === "missing") {
    return "Naam en token zijn verplicht.";
  }

  return null;
}

export default async function RegisterMirrorPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const token = params.token?.trim();

  if (!token) {
    return (
      <main className="center-page">
        <MirrorRegisterClient />
      </main>
    );
  }

  const pairing = await getValidPairingCode(token);

  if (!pairing) {
    return (
      <main className="center-page">
        <div className="card card-narrow">
          <h1>Spiegel registreren</h1>
          <p>Token ongeldig of verlopen. Vraag een nieuwe koppelcode op je telefoon.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="center-page">
      <div className="card card-narrow stack">
        <h1>Nieuwe spiegel registreren</h1>
        <p>Legacy flow: geef de spiegel een naam en optioneel een locatie.</p>

        <form action={registerMirror} className="stack">
          <input type="hidden" name="token" value={token} />

          <label>
            Spiegelnaam
            <input name="name" required placeholder="Keukenspiegel" maxLength={60} />
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

          <button type="submit">Registreer spiegel</button>
        </form>

        {errorMessage(params.error) ? (
          <p className="notice error">{errorMessage(params.error)}</p>
        ) : null}
      </div>
    </main>
  );
}
