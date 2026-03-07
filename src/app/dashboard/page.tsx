import Link from "next/link";
import { redirect } from "next/navigation";
import { MirrorModuleToggles } from "@/components/dashboard/MirrorModuleToggles";
import { LogoutButton } from "@/components/dashboard/LogoutButton";
import { requireUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";
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
    redirect("/dashboard");
  }

  const canManageMirrors =
    membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  if (!canManageMirrors) {
    redirect("/dashboard");
  }

  const mirrorId = String(formData.get("mirrorId") ?? "").trim();
  if (!mirrorId) {
    redirect("/dashboard");
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
    redirect("/dashboard");
  }

  await prisma.mirror.delete({
    where: {
      id: mirror.id,
    },
  });

  redirect("/dashboard");
}

export default async function DashboardPage() {
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    return (
      <main className="page-wrap">
        <p>Geen huishouden gevonden voor deze gebruiker.</p>
      </main>
    );
  }

  const { household } = membership;
  const canManageMirrors =
    membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";

  return (
    <main className="page-wrap stack">
      <header className="card dashboard-header">
        <div>
          <h1>{household.name}</h1>
          <p>
            Ingelogd als {user.displayName ?? user.email} ({user.email})
          </p>
        </div>
        <LogoutButton />
      </header>

      <section className="card">
        <h2>Gezinsleden</h2>
        <ul className="simple-list">
          {household.members.map((member) => (
            <li key={member.id}>
              {member.user.displayName ?? member.user.email} ({member.role.toLowerCase()})
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack-small">
        <div className="section-header">
          <h2>Spiegels</h2>
          <Link href="/dashboard/pair" className="button-link button-small">
            Spiegel koppelen (QR)
          </Link>
        </div>

        {household.mirrors.length === 0 ? (
          <p>Nog geen spiegels gekoppeld.</p>
        ) : (
          <div className="stack">
            {household.mirrors.map((mirror) => (
              <article key={mirror.id} className="mirror-card">
                <div className="section-header">
                  <div>
                    <h3>{mirror.name}</h3>
                    <p className="muted">ID: {mirror.id}</p>
                  </div>
                  <div className="button-row">
                    <Link href={`/mirror/${mirror.id}`} className="button-link button-small">
                      Open mirror view
                    </Link>
                    <Link href={`/m?mirrorId=${mirror.id}`} className="button-link button-small">
                      Open mobiel
                    </Link>
                    {canManageMirrors ? (
                      <form action={deleteMirrorAction}>
                        <input type="hidden" name="mirrorId" value={mirror.id} />
                        <button type="submit" className="button-secondary button-small">
                          Verwijder spiegel
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>

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
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Snelle acties</h2>
        <div className="button-row">
          <Link href="/m" className="button-link">
            Naar mobiele timer app
          </Link>
        </div>
      </section>
    </main>
  );
}
