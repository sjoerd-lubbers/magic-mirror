import Link from "next/link";
import { redirect } from "next/navigation";
import type { ModuleType } from "@prisma/client";
import { MirrorModuleToggles } from "@/components/dashboard/MirrorModuleToggles";
import { MirrorSettingsCopyButton } from "@/components/dashboard/MirrorSettingsCopyButton";
import { requireUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";
import {
  buildModuleSettingsMap,
  toModuleSettingsList,
} from "@/lib/module-config";
import { parseMirrorSettingsSnapshot } from "@/lib/mirror-settings";
import { prisma } from "@/lib/prisma";
import { broadcastToMirror } from "@/lib/ws-hub";

type MirrorManagePageProps = {
  params: Promise<{ mirrorId: string }>;
  searchParams: Promise<{ copy?: string; reason?: string }>;
};

function copyNotice({
  status,
  reason,
}: {
  status: string | undefined;
  reason: string | undefined;
}) {
  if (status === "imported") {
    return { kind: "success" as const, text: "Instellingen zijn op deze spiegel geimporteerd." };
  }

  if (reason === "invalid_json") {
    return { kind: "error" as const, text: "Instellingen JSON is ongeldig." };
  }

  if (reason === "forbidden") {
    return { kind: "error" as const, text: "Je hebt geen rechten om instellingen te beheren." };
  }

  if (reason === "no_household") {
    return { kind: "error" as const, text: "Geen huishouden gevonden." };
  }

  return null;
}

async function deleteMirrorAction(formData: FormData) {
  "use server";

  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    redirect("/dashboard/mirrors");
  }

  const canManageMirrors =
    membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  if (!canManageMirrors) {
    redirect("/dashboard/mirrors");
  }

  const mirrorId = String(formData.get("mirrorId") ?? "").trim();
  if (!mirrorId) {
    redirect("/dashboard/mirrors");
  }

  const mirror = await prisma.mirror.findFirst({
    where: {
      id: mirrorId,
      householdId: membership.householdId,
    },
    select: {
      id: true,
    },
  });

  if (!mirror) {
    redirect("/dashboard/mirrors");
  }

  await prisma.mirror.delete({
    where: {
      id: mirror.id,
    },
  });

  redirect("/dashboard/mirrors");
}

async function toggleMirrorContrastAction(formData: FormData) {
  "use server";

  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    redirect("/dashboard/mirrors");
  }

  const canManageMirrors =
    membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  if (!canManageMirrors) {
    redirect("/dashboard/mirrors");
  }

  const mirrorId = String(formData.get("mirrorId") ?? "").trim();
  if (!mirrorId) {
    redirect("/dashboard/mirrors");
  }

  const enable = String(formData.get("enable") ?? "") === "1";

  const mirror = await prisma.mirror.findFirst({
    where: {
      id: mirrorId,
      householdId: membership.householdId,
    },
    select: {
      id: true,
    },
  });

  if (!mirror) {
    redirect("/dashboard/mirrors");
  }

  await prisma.mirror.update({
    where: {
      id: mirror.id,
    },
    data: {
      highContrastMonochrome: enable,
    },
  });

  broadcastToMirror(mirror.id, {
    type: "mirror_updated",
    mirror: {
      highContrastMonochrome: enable,
    },
  });

  redirect(`/dashboard/mirrors/${mirror.id}`);
}

async function importMirrorSettingsAction(formData: FormData) {
  "use server";

  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    redirect("/dashboard/mirrors?copy=error&reason=no_household");
  }

  const canManageMirrors =
    membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  if (!canManageMirrors) {
    const mirrorId = String(formData.get("mirrorId") ?? "").trim();
    redirect(`/dashboard/mirrors/${mirrorId}?copy=error&reason=forbidden`);
  }

  const mirrorId = String(formData.get("mirrorId") ?? "").trim();
  const settingsJson = String(formData.get("settingsJson") ?? "").trim();

  if (!mirrorId || !settingsJson) {
    redirect(`/dashboard/mirrors/${mirrorId || ""}?copy=error&reason=invalid_json`);
  }

  const snapshot = parseMirrorSettingsSnapshot(settingsJson);
  if (!snapshot) {
    redirect(`/dashboard/mirrors/${mirrorId}?copy=error&reason=invalid_json`);
  }

  const mirror = await prisma.mirror.findFirst({
    where: {
      id: mirrorId,
      householdId: membership.householdId,
    },
    select: {
      id: true,
    },
  });

  if (!mirror) {
    redirect("/dashboard/mirrors");
  }

  await prisma.$transaction(async (tx) => {
    await tx.mirror.update({
      where: { id: mirror.id },
      data: {
        locationName: snapshot.mirror.locationName,
        latitude: snapshot.mirror.latitude,
        longitude: snapshot.mirror.longitude,
        timezone: snapshot.mirror.timezone,
        highContrastMonochrome: snapshot.mirror.highContrastMonochrome,
      },
    });

    for (const module of snapshot.modules) {
      await tx.mirrorModule.upsert({
        where: {
          mirrorId_type: {
            mirrorId: mirror.id,
            type: module.type as ModuleType,
          },
        },
        create: {
          mirrorId: mirror.id,
          type: module.type as ModuleType,
          enabled: module.enabled,
          config: module.config,
        },
        update: {
          enabled: module.enabled,
          config: module.config,
        },
      });
    }
  });

  redirect(`/dashboard/mirrors/${mirror.id}?copy=imported`);
}

export default async function MirrorManagePage({
  params,
  searchParams,
}: MirrorManagePageProps) {
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);
  const { mirrorId } = await params;
  const query = await searchParams;

  if (!membership) {
    return (
      <main className="stack">
        <p>Geen huishouden gevonden.</p>
      </main>
    );
  }

  const canManageMirrors =
    membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";

  const mirror = await prisma.mirror.findFirst({
    where: {
      id: mirrorId,
      householdId: membership.householdId,
    },
    include: {
      modules: true,
    },
  });

  if (!mirror) {
    redirect("/dashboard/mirrors");
  }

  const notice = copyNotice({ status: query.copy, reason: query.reason });

  return (
    <main className="stack">
      <section className="card stack-small">
        <div className="section-header">
          <div>
            <h2>{mirror.name}</h2>
            <p className="muted">ID: {mirror.id}</p>
          </div>
          <Link href="/dashboard/mirrors" className="button-link button-secondary button-small">
            Terug
          </Link>
        </div>

        <div className="button-row">
          <Link href={`/mirror/${mirror.id}`} className="button-link button-small">
            Open spiegel
          </Link>
          <Link
            href={`/dashboard/pair/scan?targetMirrorId=${encodeURIComponent(mirror.id)}`}
            className="button-link button-secondary button-small"
          >
            Nieuw scherm koppelen
          </Link>
        </div>

        {notice ? (
          <p className={`notice ${notice.kind === "success" ? "success" : "error"}`}>
            {notice.text}
          </p>
        ) : null}
      </section>

      <section className="card stack-small">
        <h3>Snelle acties</h3>
        <div className="button-row">
          <MirrorSettingsCopyButton mirrorId={mirror.id} />

          {canManageMirrors ? (
            <form action={toggleMirrorContrastAction}>
              <input type="hidden" name="mirrorId" value={mirror.id} />
              <input
                type="hidden"
                name="enable"
                value={mirror.highContrastMonochrome ? "0" : "1"}
              />
              <button type="submit" className="button-secondary button-small">
                {mirror.highContrastMonochrome ? "Contrast uit" : "Contrast aan"}
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <section className="card stack-small">
        <h3>Module instellingen</h3>
        <MirrorModuleToggles
          mirrorId={mirror.id}
          initialModules={toModuleSettingsList(
            buildModuleSettingsMap(
              mirror.modules.map((module) => ({
                type: module.type,
                enabled: module.enabled,
                config: module.config,
              })),
            ),
          )}
        />
      </section>

        {canManageMirrors ? (
          <section className="card stack-small">
            <h3>Geavanceerd</h3>
            <div className="module-config-card stack-small">
              <h4>Instellingen importeren op deze spiegel</h4>
              <p className="muted">
                Plak settings JSON die je met "Kopieer settings" van een andere omgeving of spiegel hebt gekopieerd.
              </p>
              <form action={importMirrorSettingsAction} className="module-config-grid">
                <input type="hidden" name="mirrorId" value={mirror.id} />
                <label>
                  Settings JSON
                  <textarea
                    name="settingsJson"
                    rows={10}
                    required
                    placeholder='{"version":1,"mirror":{...},"modules":[...]}'
                  />
                </label>
                <div>
                  <button type="submit" className="button-secondary">
                    Importeer op deze spiegel
                  </button>
                </div>
              </form>
            </div>

            <div className="module-config-card stack-small">
              <h4>Spiegel verwijderen</h4>
              <p className="muted">Verwijdert deze spiegel permanent uit dit gezin.</p>
              <form action={deleteMirrorAction}>
                <input type="hidden" name="mirrorId" value={mirror.id} />
                <button type="submit" className="button-secondary button-small">
                  Verwijderen
                </button>
              </form>
            </div>
          </section>
        ) : null}
    </main>
  );
}
