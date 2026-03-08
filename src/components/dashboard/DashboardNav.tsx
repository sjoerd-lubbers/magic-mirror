"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard/mirrors", label: "Spiegels" },
  { href: "/dashboard/mobile", label: "Mobiel" },
  { href: "/dashboard/family", label: "Gezin" },
  { href: "/dashboard/integrations", label: "Integraties" },
  { href: "/dashboard/system", label: "Systeem" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="dashboard-nav" aria-label="Dashboard navigatie">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`dashboard-nav-link${active ? " active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
      <Link href="/dashboard/pair" className="button-link button-small">
        Spiegel koppelen
      </Link>
    </nav>
  );
}
