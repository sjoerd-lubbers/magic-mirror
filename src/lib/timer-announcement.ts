export const TIMER_ANNOUNCEMENT_TEST_MESSAGE =
  "Dit is een test van het timer meldvolume.";

export function buildTimerAnnouncementAudioUrl(key: string) {
  return `/api/timer-announcements/${encodeURIComponent(key)}`;
}

export function formatTimerAnnouncementDurationLabel(durationSeconds: number) {
  if (durationSeconds < 60) {
    return `${durationSeconds} seconden`;
  }

  return `${Math.round(durationSeconds / 60)} minuten`;
}

export function buildTimerAnnouncementMessage({
  greetingName,
  durationSeconds,
}: {
  greetingName: string | null;
  durationSeconds: number;
}) {
  const safeGreetingName = greetingName?.trim() || "daar";
  const durationLabel = formatTimerAnnouncementDurationLabel(durationSeconds);
  return `Hoi ${safeGreetingName}, de wekker van ${durationLabel} is voorbij.`;
}
