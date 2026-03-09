import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  isPushEnabled,
  removePushSubscription,
  upsertPushSubscription,
} from "@/lib/push-notifications";

export const runtime = "nodejs";

const subscriptionSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    }

    if (!isPushEnabled()) {
      return NextResponse.json(
        { error: "Push staat niet geconfigureerd op de server" },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = subscriptionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige push subscription" }, { status: 400 });
    }

    await upsertPushSubscription({
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Push subscription opslaan mislukt", { error });

    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Push subscription opslaan mislukt"
            : `Push subscription opslaan mislukt: ${
                error instanceof Error ? error.message : "onbekende fout"
              }`,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = unsubscribeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "endpoint ontbreekt" }, { status: 400 });
    }

    await removePushSubscription({
      endpoint: parsed.data.endpoint,
      userId: user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Push subscription verwijderen mislukt", { error });
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "production"
            ? "Push subscription verwijderen mislukt"
            : `Push subscription verwijderen mislukt: ${
                error instanceof Error ? error.message : "onbekende fout"
              }`,
      },
      { status: 500 },
    );
  }
}
