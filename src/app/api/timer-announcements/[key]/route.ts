import { NextResponse } from "next/server";
import { readTimerAnnouncementAudio } from "@/lib/timer-announcement-audio";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ key: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { key } = await params;
  const audio = await readTimerAnnouncementAudio(key);

  if (!audio) {
    return NextResponse.json({ error: "Audio niet gevonden" }, { status: 404 });
  }

  console.info("Timer announcement audio geserveerd", {
    key,
    bytes: audio.byteLength,
  });

  return new NextResponse(audio, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
