import type { MemberRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { normalizeEmail, requireUser } from "@/lib/auth";
import { getPrimaryHouseholdForUser } from "@/lib/household";
import { prisma } from "@/lib/prisma";

type DashboardFamilyPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

function familyNotice(saved: string | undefined, error: string | undefined) {
  if (saved === "created") {
    return { kind: "success" as const, text: "Gezinslid toegevoegd." };
  }

  if (saved === "updated") {
    return { kind: "success" as const, text: "Gezinslid bijgewerkt." };
  }

  if (saved === "deleted") {
    return { kind: "success" as const, text: "Gezinslid verwijderd." };
  }
  if (saved === "household") {
    return { kind: "success" as const, text: "Gezinsnaam bijgewerkt." };
  }

  if (error === "forbidden") {
    return { kind: "error" as const, text: "Alleen owner/admin mag gezinsleden beheren." };
  }
  if (error === "invalid_email") {
    return { kind: "error" as const, text: "Vul een geldig e-mailadres in." };
  }
  if (error === "invalid_member") {
    return { kind: "error" as const, text: "Gezinslid niet gevonden." };
  }
  if (error === "last_owner") {
    return { kind: "error" as const, text: "Er moet minimaal één owner overblijven." };
  }
  if (error === "self_remove") {
    return { kind: "error" as const, text: "Je kunt jezelf hier niet verwijderen." };
  }
  if (error === "no_household") {
    return { kind: "error" as const, text: "Geen huishouden gevonden." };
  }
  if (error === "invalid_household_name") {
    return { kind: "error" as const, text: "Vul een geldige gezinsnaam in (max 80 tekens)." };
  }

  return null;
}

async function ensureManagePermission() {
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);

  if (!membership) {
    redirect("/dashboard/family?error=no_household");
  }

  const canManage = membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";
  if (!canManage) {
    redirect("/dashboard/family?error=forbidden");
  }

  return { user, membership };
}

async function addFamilyMemberAction(formData: FormData) {
  "use server";

  const { membership } = await ensureManagePermission();

  const emailRaw = String(formData.get("email") ?? "").trim();
  const displayNameRaw = String(formData.get("displayName") ?? "").trim();
  const roleInput = String(formData.get("role") ?? "MEMBER");
  const role: MemberRole = roleInput === "OWNER" ? "OWNER" : "MEMBER";

  if (!emailRaw || !emailRaw.includes("@")) {
    redirect("/dashboard/family?error=invalid_email");
  }

  const email = normalizeEmail(emailRaw);
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, displayName: true },
  });

  let userId = existingUser?.id;

  if (!existingUser) {
    const createdUser = await prisma.user.create({
      data: {
        email,
        displayName: displayNameRaw || null,
      },
      select: { id: true },
    });
    userId = createdUser.id;
  } else if (displayNameRaw && displayNameRaw !== existingUser.displayName) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { displayName: displayNameRaw },
    });
  }

  if (!userId) {
    redirect("/dashboard/family?error=invalid_email");
  }

  const currentMembership = await prisma.householdMember.findUnique({
    where: {
      householdId_userId: {
        householdId: membership.householdId,
        userId,
      },
    },
    select: { id: true, role: true },
  });

  if (!currentMembership) {
    await prisma.householdMember.create({
      data: {
        householdId: membership.householdId,
        userId,
        role,
      },
    });
    redirect("/dashboard/family?saved=created");
  }

  if (currentMembership.role === "OWNER" && role === "MEMBER") {
    const ownerCount = await prisma.householdMember.count({
      where: {
        householdId: membership.householdId,
        role: "OWNER",
      },
    });

    if (ownerCount <= 1) {
      redirect("/dashboard/family?error=last_owner");
    }
  }

  await prisma.householdMember.update({
    where: { id: currentMembership.id },
    data: { role },
  });
  redirect("/dashboard/family?saved=updated");
}

async function updateHouseholdNameAction(formData: FormData) {
  "use server";

  const { membership } = await ensureManagePermission();
  const nextName = String(formData.get("householdName") ?? "").trim();

  if (!nextName || nextName.length > 80) {
    redirect("/dashboard/family?error=invalid_household_name");
  }

  await prisma.household.update({
    where: { id: membership.householdId },
    data: { name: nextName },
  });

  redirect("/dashboard/family?saved=household");
}

async function updateFamilyMemberAction(formData: FormData) {
  "use server";

  const { membership } = await ensureManagePermission();
  const memberId = String(formData.get("memberId") ?? "").trim();
  const displayNameRaw = String(formData.get("displayName") ?? "").trim();
  const roleInput = String(formData.get("role") ?? "MEMBER");
  const role: MemberRole = roleInput === "OWNER" ? "OWNER" : "MEMBER";

  if (!memberId) {
    redirect("/dashboard/family?error=invalid_member");
  }

  const member = await prisma.householdMember.findFirst({
    where: {
      id: memberId,
      householdId: membership.householdId,
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
  });

  if (!member) {
    redirect("/dashboard/family?error=invalid_member");
  }

  if (member.role === "OWNER" && role === "MEMBER") {
    const ownerCount = await prisma.householdMember.count({
      where: {
        householdId: membership.householdId,
        role: "OWNER",
      },
    });

    if (ownerCount <= 1) {
      redirect("/dashboard/family?error=last_owner");
    }
  }

  await prisma.$transaction(async (tx) => {
    if (member.role !== role) {
      await tx.householdMember.update({
        where: { id: member.id },
        data: { role },
      });
    }

    if (displayNameRaw !== (member.user.displayName ?? "")) {
      await tx.user.update({
        where: { id: member.user.id },
        data: { displayName: displayNameRaw || null },
      });
    }
  });

  redirect("/dashboard/family?saved=updated");
}

async function deleteFamilyMemberAction(formData: FormData) {
  "use server";

  const { user, membership } = await ensureManagePermission();
  const memberId = String(formData.get("memberId") ?? "").trim();

  if (!memberId) {
    redirect("/dashboard/family?error=invalid_member");
  }

  const member = await prisma.householdMember.findFirst({
    where: {
      id: memberId,
      householdId: membership.householdId,
    },
    select: {
      id: true,
      userId: true,
      role: true,
    },
  });

  if (!member) {
    redirect("/dashboard/family?error=invalid_member");
  }

  if (member.userId === user.id) {
    redirect("/dashboard/family?error=self_remove");
  }

  if (member.role === "OWNER") {
    const ownerCount = await prisma.householdMember.count({
      where: {
        householdId: membership.householdId,
        role: "OWNER",
      },
    });

    if (ownerCount <= 1) {
      redirect("/dashboard/family?error=last_owner");
    }
  }

  await prisma.householdMember.delete({
    where: { id: member.id },
  });
  redirect("/dashboard/family?saved=deleted");
}

export default async function DashboardFamilyPage({
  searchParams,
}: DashboardFamilyPageProps) {
  const user = await requireUser();
  const membership = await getPrimaryHouseholdForUser(user.id);
  const params = await searchParams;
  const notice = familyNotice(params.saved, params.error);

  if (!membership) {
    return (
      <main className="stack">
        <p>Geen huishouden gevonden.</p>
      </main>
    );
  }

  const canManage = membership.role === "OWNER" || user.role === "PLATFORM_ADMIN";

  return (
    <main className="stack">
      <section className="card stack-small">
        <h2>Gezinsleden</h2>
        <p className="muted">Overzicht van wie deze spiegels mag gebruiken.</p>

        {notice ? (
          <p className={`notice ${notice.kind === "success" ? "success" : "error"}`}>
            {notice.text}
          </p>
        ) : null}

        <div className="module-config-card stack-small">
          <h3>Gezin</h3>
          {canManage ? (
            <form action={updateHouseholdNameAction} className="module-config-grid">
              <label>
                Gezinsnaam
                <input
                  name="householdName"
                  required
                  maxLength={80}
                  defaultValue={membership.household.name}
                  placeholder="Naam van je gezin"
                />
              </label>
              <div>
                <button type="submit" className="button-secondary">
                  Opslaan
                </button>
              </div>
            </form>
          ) : (
            <p>{membership.household.name}</p>
          )}
        </div>

        {canManage ? (
          <form action={addFamilyMemberAction} className="module-config-grid">
            <h3>Gezinslid toevoegen</h3>
            <label>
              Naam
              <input name="displayName" maxLength={80} placeholder="Voornaam Achternaam" />
            </label>
            <label>
              E-mail
              <input type="email" name="email" required placeholder="naam@voorbeeld.nl" />
            </label>
            <label>
              Rol
              <select name="role" defaultValue="MEMBER">
                <option value="MEMBER">Member</option>
                <option value="OWNER">Owner</option>
              </select>
            </label>
            <div>
              <button type="submit" className="button-secondary">
                Toevoegen
              </button>
            </div>
          </form>
        ) : null}

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

              {canManage ? (
                <div className="button-row">
                  <form action={updateFamilyMemberAction} className="module-config-grid">
                    <input type="hidden" name="memberId" value={member.id} />
                    <label>
                      Naam
                      <input
                        name="displayName"
                        maxLength={80}
                        defaultValue={member.user.displayName ?? ""}
                        placeholder="Naam"
                      />
                    </label>
                    <label>
                      Rol
                      <select name="role" defaultValue={member.role}>
                        <option value="MEMBER">Member</option>
                        <option value="OWNER">Owner</option>
                      </select>
                    </label>
                    <div className="button-row">
                      <button type="submit" className="button-secondary button-small">
                        Opslaan
                      </button>
                    </div>
                  </form>

                  <form action={deleteFamilyMemberAction}>
                    <input type="hidden" name="memberId" value={member.id} />
                    <button type="submit" className="button-secondary button-small">
                      Verwijderen
                    </button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
