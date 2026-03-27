import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { userCanAccessMirror } from "@/lib/household";
import {
  TIMER_ANNOUNCEMENT_TEST_MESSAGE,
  buildTimerAnnouncementAudioKey,
  prepareTimerAnnouncementAudio,
} from "@/lib/timer-announcement-audio";
import { broadcastToMirror, getMirrorSubscriberCount } from "@/lib/ws-hub";

export const runtime = "nodejs";

const schema = z.object({
  announcementVolume: z.number().int().min(0).max(100),
});

type Params = {
  params: Promise<{ mirrorId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const { mirrorId } = await params;
  const hasAccess = await userCanAccessMirror(user.id, mirrorId);

  if (!hasAccess) {
    return NextResponse.json({ error: "Geen toegang tot spiegel" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Ongeldig meldvolume" }, { status: 400 });
  }

  const subscriberCount = getMirrorSubscriberCount(mirrorId);

  if (subscriberCount < 1) {
    return NextResponse.json(
      { error: "Geen actieve spiegel verbonden voor testmelding" },
      { status: 409 },
    );
  }

  let announcementAudioKey: string | null = buildTimerAnnouncementAudioKey(
    TIMER_ANNOUNCEMENT_TEST_MESSAGE,
  );

  try {
    await prepareTimerAnnouncementAudio(TIMER_ANNOUNCEMENT_TEST_MESSAGE);
  } catch (error) {
    console.error("Test announcement audio voorbereiden mislukt", {
      mirrorId,
      error,
    });
    announcementAudioKey = null;
  }

  broadcastToMirror(mirrorId, {
    type: "timer_announcement_test",
    announcementVolume: parsed.data.announcementVolume,
    announcementAudioKey,
  });

  return NextResponse.json({
    ok: true,
    subscribers: subscriberCount,
  });
}
