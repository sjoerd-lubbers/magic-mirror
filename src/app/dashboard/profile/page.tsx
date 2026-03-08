import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeEmail, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ProfilePageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

const profileSchema = z.object({
  displayName: z.string().max(80),
  email: z.email(),
});

async function updateProfileAction(formData: FormData) {
  "use server";

  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    displayName: String(formData.get("displayName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
  });

  if (!parsed.success) {
    redirect("/dashboard/profile?error=invalid_input");
  }

  const nextEmail = normalizeEmail(parsed.data.email);
  const existing = await prisma.user.findUnique({
    where: { email: nextEmail },
    select: { id: true },
  });

  if (existing && existing.id !== user.id) {
    redirect("/dashboard/profile?error=email_taken");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName: parsed.data.displayName || null,
      email: nextEmail,
    },
  });

  redirect("/dashboard/profile?saved=1");
}

function profileNotice(saved: string | undefined, error: string | undefined) {
  if (saved === "1") {
    return { kind: "success" as const, text: "Profiel opgeslagen." };
  }

  if (error === "email_taken") {
    return { kind: "error" as const, text: "Dit e-mailadres is al in gebruik." };
  }

  if (error === "invalid_input") {
    return { kind: "error" as const, text: "Ongeldige invoer. Controleer je naam en e-mail." };
  }

  return null;
}

export default async function DashboardProfilePage({ searchParams }: ProfilePageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const notice = profileNotice(params.saved, params.error);

  return (
    <main className="stack">
      <section className="card stack-small">
        <h2>Profiel</h2>
        <p className="muted">Beheer je naam en e-mailadres voor dit account.</p>

        {notice ? (
          <p className={`notice ${notice.kind === "success" ? "success" : "error"}`}>
            {notice.text}
          </p>
        ) : null}

        <form action={updateProfileAction} className="module-config-grid">
          <label>
            Naam
            <input
              name="displayName"
              maxLength={80}
              defaultValue={user.displayName ?? ""}
              placeholder="Jouw naam"
            />
          </label>

          <label>
            E-mail
            <input
              type="email"
              name="email"
              required
              defaultValue={user.email}
              placeholder="naam@voorbeeld.nl"
            />
          </label>

          <div>
            <button type="submit" className="button-secondary">
              Opslaan
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
