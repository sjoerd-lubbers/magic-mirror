import { redirect } from "next/navigation";

type MobileTimerCompatPageProps = {
  searchParams: Promise<{ mirrorId?: string }>;
};

export default async function MobileTimerCompatPage({
  searchParams,
}: MobileTimerCompatPageProps) {
  const params = await searchParams;
  const mirrorId = params.mirrorId?.trim();

  if (mirrorId) {
    redirect(`/dashboard/mobile?mirrorId=${encodeURIComponent(mirrorId)}`);
  }

  redirect("/dashboard/mobile");
}
