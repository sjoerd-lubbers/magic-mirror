import Link from "next/link";
import { redirect } from "next/navigation";
import type { ModuleType } from "@prisma/client";
import { MirrorModuleToggles } from "@/components/dashboard/MirrorModuleToggles";
import { MirrorSettingsCopyButton } from "@/components/dashboard/MirrorSettingsCopyButton";
import { requireUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";
import {
  buildMirrorSettingsSnapshot,
  parseMirrorSettingsSnapshot,
} from "@/lib/mirror-settings";
import {
  buildModuleSettingsMap,
  toModuleSettingsList,
} from "@/lib/module-config";
import { prisma } from "@/lib/prisma";

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

  redirect("/dashboard/mirrors");
}

async function copyMirrorSettingsAction(formData: FormData) {
  "use server";

  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    redirect("/dashboard/mirrors?copy=error&reason=no_household");
  }

  const canManageMirrors =
    membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  if (!canManageMirrors) {
    redirect("/dashboard/mirrors?copy=error&reason=forbidden");
  }

  const sourceMirrorId = String(formData.get("sourceMirrorId") ?? "").trim();
  const targetMirrorId = String(formData.get("targetMirrorId") ?? "").trim();

  if (!sourceMirrorId || !targetMirrorId) {
    redirect("/dashboard/mirrors?copy=error&reason=missing");
  }

  if (sourceMirrorId === targetMirrorId) {
    redirect("/dashboard/mirrors?copy=error&reason=same");
  }

  const sourceMirror = await prisma.mirror.findFirst({
    where: {
      id: sourceMirrorId,
      householdId: membership.householdId,
    },
    include: {
      modules: true,
    },
  });

  const targetMirror = await prisma.mirror.findFirst({
    where: {
      id: targetMirrorId,
      householdId: membership.householdId,
    },
    select: {
      id: true,
    },
  });

  if (!sourceMirror || !targetMirror) {
    redirect("/dashboard/mirrors?copy=error&reason=mirror_missing");
  }

  const snapshot = buildMirrorSettingsSnapshot(sourceMirror);

  await prisma.$transaction(async (tx) => {
    await tx.mirror.update({
      where: { id: targetMirror.id },
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
            mirrorId: targetMirror.id,
            type: module.type as ModuleType,
          },
        },
        create: {
          mirrorId: targetMirror.id,
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

  redirect("/dashboard/mirrors?copy=ok");
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
    redirect("/dashboard/mirrors?copy=error&reason=forbidden");
  }

  const targetMirrorId = String(formData.get("targetMirrorId") ?? "").trim();
  const settingsJson = String(formData.get("settingsJson") ?? "").trim();

  if (!targetMirrorId || !settingsJson) {
    redirect("/dashboard/mirrors?copy=error&reason=missing");
  }

  const snapshot = parseMirrorSettingsSnapshot(settingsJson);
  if (!snapshot) {
    redirect("/dashboard/mirrors?copy=error&reason=invalid_json");
  }

  const targetMirror = await prisma.mirror.findFirst({
    where: {
      id: targetMirrorId,
      householdId: membership.householdId,
    },
    select: {
      id: true,
    },
  });

  if (!targetMirror) {
    redirect("/dashboard/mirrors?copy=error&reason=mirror_missing");
  }

  await prisma.$transaction(async (tx) => {
    await tx.mirror.update({
      where: { id: targetMirror.id },
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
            mirrorId: targetMirror.id,
            type: module.type as ModuleType,
          },
        },
        create: {
          mirrorId: targetMirror.id,
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

  redirect("/dashboard/mirrors?copy=imported");
}

function copyMessage({
  status,
  reason,
}: {
  status: string | undefined;
  reason: string | undefined;
}) {
  if (status === "ok") {
    return { kind: "success" as const, text: "Instellingen zijn gekopieerd." };
  }

  if (status === "imported") {
    return { kind: "success" as const, text: "Instellingen zijn geimporteerd." };
  }

  if (status !== "error") {
    return null;
  }

  if (reason === "same") {
    return { kind: "error" as const, text: "Bron en doel spiegel mogen niet gelijk zijn." };
  }

  if (reason === "invalid_json") {
    return { kind: "error" as const, text: "Instellingen JSON is ongeldig." };
  }

  if (reason === "mirror_missing") {
    return { kind: "error" as const, text: "Bron of doel spiegel niet gevonden." };
  }

  if (reason === "forbidden") {
    return { kind: "error" as const, text: "Je hebt geen rechten om instellingen te beheren." };
  }

  if (reason === "no_household") {
    return { kind: "error" as const, text: "Geen huishouden gevonden." };
  }

  return { kind: "error" as const, text: "Kopieren/importeren mislukt." };
}

type DashboardPageProps = {
  searchParams: Promise<{ copy?: string; reason?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);
  const params = await searchParams;

  if (!membership) {
    return (
      <main className="stack">
        <p>Geen huishouden gevonden voor deze gebruiker.</p>
      </main>
    );
  }

  const { household } = membership;
  const canManageMirrors =
    membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  const copyNotice = copyMessage({
    status: params.copy,
    reason: params.reason,
  });

  return (
    <main className="stack">
      <section className="card stack-small">
        <div className="section-header">
          <div>
            <h2>Spiegelbeheer</h2>
            <p className="muted">Open, configureer of verwijder een gekoppelde spiegel.</p>
          </div>
        </div>

        {household.mirrors.length === 0 ? (
          <div className="stack-small">
            <p>Nog geen spiegels gekoppeld.</p>
            <div>
              <Link href="/dashboard/pair" className="button-link button-small">
                Eerste spiegel koppelen
              </Link>
            </div>
          </div>
        ) : (
          <div className="stack">
            {household.mirrors.map((mirror) => (
              <article key={mirror.id} className="mirror-card">
                <div className="section-header mirror-card-header">
                  <div>
                    <h3>{mirror.name}</h3>
                    <p className="muted">ID: {mirror.id}</p>
                  </div>
                  <div className="button-row mirror-card-primary-actions">
                    <Link href={`/mirror/${mirror.id}`} className="button-link button-small">
                      Spiegel
                    </Link>
                    <Link href={`/m?mirrorId=${mirror.id}`} className="button-link button-small">
                      Mobiel
                    </Link>
                  </div>
                </div>

                <details className="details-panel">
                  <summary className="details-summary">Meer acties</summary>
                  <div className="details-body">
                    <div className="button-row">
                      <MirrorSettingsCopyButton mirrorId={mirror.id} />
                      <a
                        href={`/api/mirrors/${mirror.id}/settings-export`}
                        target="_blank"
                        rel="noreferrer"
                        className="button-link button-secondary button-small"
                      >
                        Download JSON
                      </a>
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
                      {canManageMirrors ? (
                        <form action={deleteMirrorAction}>
                          <input type="hidden" name="mirrorId" value={mirror.id} />
                          <button type="submit" className="button-secondary button-small">
                            Verwijderen
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </details>

                <details className="details-panel">
                  <summary className="details-summary">Module instellingen</summary>
                  <div className="details-body">
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
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}

        {copyNotice ? (
          <p className={`notice ${copyNotice.kind === "success" ? "success" : "error"}`}>
            {copyNotice.text}
          </p>
        ) : null}

        {canManageMirrors && household.mirrors.length >= 2 ? (
          <div className="module-config-card stack-small">
            <h3>Instellingen kopieren</h3>
            <p className="muted">Kopieer configuratie van spiegel A naar spiegel B.</p>
            <form action={copyMirrorSettingsAction} className="module-config-grid">
              <label>
                Van spiegel
                <select name="sourceMirrorId" required defaultValue={household.mirrors[0]?.id}>
                  {household.mirrors.map((mirror) => (
                    <option key={`source-${mirror.id}`} value={mirror.id}>
                      {mirror.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Naar spiegel
                <select name="targetMirrorId" required defaultValue={household.mirrors[1]?.id}>
                  {household.mirrors.map((mirror) => (
                    <option key={`target-${mirror.id}`} value={mirror.id}>
                      {mirror.name}
                    </option>
                  ))}
                </select>
              </label>

              <button type="submit" className="button-secondary">
                Kopieer instellingen
              </button>
            </form>
          </div>
        ) : null}

        {canManageMirrors ? (
          <div className="module-config-card stack-small">
            <h3>Instellingen importeren</h3>
            <p className="muted">
              Exporteer JSON op development en plak dat hier op productie.
            </p>

            <form action={importMirrorSettingsAction} className="module-config-grid">
              <label>
                Naar spiegel
                <select name="targetMirrorId" required defaultValue={household.mirrors[0]?.id}>
                  {household.mirrors.map((mirror) => (
                    <option key={`import-${mirror.id}`} value={mirror.id}>
                      {mirror.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Settings JSON
                <textarea
                  name="settingsJson"
                  rows={10}
                  required
                  placeholder='{"version":1,"mirror":{...},"modules":[...]}'
                />
              </label>

              <button type="submit" className="button-secondary">
                Importeer instellingen
              </button>
            </form>
          </div>
        ) : null}
      </section>
    </main>
  );
}
