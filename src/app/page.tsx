import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="center-page">
      <div className="card card-wide">
        <h1>Magic Mirror Platform</h1>
        <p>
          Basis voor een multitenant mirror + webapp setup met modules, QR pairing,
          e-mailcode login en realtime timers.
        </p>
        <div className="button-row">
          <Link href="/login" className="button-link">
            Inloggen
          </Link>
        </div>
      </div>
    </main>
  );
}
