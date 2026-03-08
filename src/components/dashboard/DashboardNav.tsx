"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard/mirrors", label: "Spiegels", mobileLabel: "Spiegels", icon: "mirror" },
  { href: "/dashboard/mobile", label: "Timers", mobileLabel: "Timers", icon: "timers" },
  { href: "/dashboard/family", label: "Gezin", mobileLabel: "Gezin", icon: "family" },
  {
    href: "/dashboard/integrations",
    label: "Integraties",
    mobileLabel: "Integraties",
    icon: "integrations",
  },
];

function DashboardNavIcon({ icon }: { icon: (typeof navItems)[number]["icon"] }) {
  if (icon === "mirror") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="8.5" r="1.1" fill="currentColor" />
      </svg>
    );
  }
  if (icon === "timers") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 9v4l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M9 3h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "family") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="9" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="16.5" cy="10" r="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M4.5 18c.6-2.5 2.2-4 4.5-4h.1c2.3 0 3.9 1.5 4.5 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M14 18c.3-1.7 1.4-2.8 3.1-2.8 1.6 0 2.7 1.1 3 2.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "integrations") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 7h8v4h-3v2h3v4H8v-4h3v-2H8z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <circle cx="6" cy="9" r="1.4" fill="currentColor" />
        <circle cx="18" cy="9" r="1.4" fill="currentColor" />
        <circle cx="6" cy="15" r="1.4" fill="currentColor" />
        <circle cx="18" cy="15" r="1.4" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 8v4m0 4h.01" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <>
      <nav className="dashboard-nav dashboard-nav-desktop" aria-label="Dashboard navigatie">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={`desktop-${item.href}`}
              href={item.href}
              className={`dashboard-nav-link${active ? " active" : ""}`}
            >
              <span className="dashboard-nav-link-inner">
                <span className="dashboard-nav-icon">
                  <DashboardNavIcon icon={item.icon} />
                </span>
                <span>{item.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <nav className="dashboard-nav dashboard-nav-mobile" aria-label="Dashboard ondernavigatie">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={`mobile-${item.href}`}
              href={item.href}
              className={`dashboard-nav-link${active ? " active" : ""}`}
            >
              <span className="dashboard-nav-link-inner">
                <span className="dashboard-nav-icon">
                  <DashboardNavIcon icon={item.icon} />
                </span>
                <span>{item.mobileLabel}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
