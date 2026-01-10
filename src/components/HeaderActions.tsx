"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

const HOME_HREF = "/finance/transactions";
const DASHBOARD_HREF = "/dashboard";
const REPORTS_HREF = "/reports";
const LOGOUT_HREF = "/api/auth/signout";

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href !== "/" && pathname.startsWith(href + "/")) return true;
  return false;
}

function IconHome({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ opacity: active ? 1 : 0.8 }}
    >
      <path
        d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconDashboard({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ opacity: active ? 1 : 0.8 }}
    >
      <path d="M4 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 19h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 16v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 16V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 16v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconFilter({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ opacity: active ? 1 : 0.8 }}
    >
      <path
        d="M4 5h16l-6.5 7.5V20l-3-1.8v-5.7L4 5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 17l-1.5 0c-2 0-3.5-1.5-3.5-3.5V10.5C5 8.5 6.5 7 8.5 7H10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M15 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 12l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 12l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M15 6h4a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HeaderActions() {
  const pathname = usePathname();

  const items = [
    {
      href: HOME_HREF,
      label: "Capture",
      icon: <IconHome active={isActivePath(pathname, HOME_HREF)} />,
      active: isActivePath(pathname, HOME_HREF),
    },
    {
      href: DASHBOARD_HREF,
      label: "Dashboard",
      icon: <IconDashboard active={isActivePath(pathname, DASHBOARD_HREF)} />,
      active: isActivePath(pathname, DASHBOARD_HREF),
    },
    {
      href: REPORTS_HREF,
      label: "Reports",
      icon: <IconFilter active={isActivePath(pathname, REPORTS_HREF)} />,
      active: isActivePath(pathname, REPORTS_HREF),
    },
    {
      href: LOGOUT_HREF,
      label: "Logout",
      icon: <IconLogout />,
      active: false,
    },
  ];

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      {items.map((it) => {
        const commonStyle: React.CSSProperties = {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 12,
          border: "1px solid rgb(var(--border))",
          background: "rgb(var(--surface))",
        };

        const activeStyle: React.CSSProperties = it.active
          ? { boxShadow: "0 0 0 3px rgba(0,0,0,0.06)" }
          : {};

        return (
          <Link
            key={it.label}
            href={it.href}
            aria-label={it.label}
            title={it.label}
            className="btn btn-ghost"
            style={{ ...commonStyle, ...activeStyle }}
          >
            {it.icon}
          </Link>
        );
      })}
    </div>
  );
}
