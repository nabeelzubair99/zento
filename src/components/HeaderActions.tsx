"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { useSession, signOut } from "next-auth/react";

const HOME_HREF = "/finance/transactions";
const DASHBOARD_HREF = "/dashboard";
const REPORTS_HREF = "/reports";
const SIGNIN_HREF = "/api/auth/signin";

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

function IconLogin() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 7h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M10 12h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 12l3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 12l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M11 17H8.5C6.5 17 5 15.5 5 13.5v-3C5 8.5 6.5 7 8.5 7H11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HeaderActions() {
  const pathname = usePathname();
  const { status } = useSession();
  const isAuthed = status === "authenticated";

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

  const items = [
    {
      href: HOME_HREF,
      label: "Capture",
      icon: <IconHome active={isActivePath(pathname, HOME_HREF)} />,
      active: isActivePath(pathname, HOME_HREF),
      kind: "link" as const,
    },
    {
      href: DASHBOARD_HREF,
      label: "Dashboard",
      icon: <IconDashboard active={isActivePath(pathname, DASHBOARD_HREF)} />,
      active: isActivePath(pathname, DASHBOARD_HREF),
      kind: "link" as const,
    },
    {
      href: REPORTS_HREF,
      label: "Reports",
      icon: <IconFilter active={isActivePath(pathname, REPORTS_HREF)} />,
      active: isActivePath(pathname, REPORTS_HREF),
      kind: "link" as const,
    },
    ...(isAuthed
      ? [
          {
            href: "#logout",
            label: "Logout",
            icon: <IconLogout />,
            active: false,
            kind: "logout" as const,
          },
        ]
      : [
          {
            href: SIGNIN_HREF,
            label: "Sign in",
            icon: <IconLogin />,
            active: false,
            kind: "link" as const,
          },
        ]),
  ];

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      {items.map((it) => {
        const activeStyle: React.CSSProperties = it.active
          ? { boxShadow: "0 0 0 3px rgba(0,0,0,0.06)" }
          : {};

        if (it.kind === "logout") {
          return (
            <button
              key={it.label}
              type="button"
              aria-label={it.label}
              title={it.label}
              className="btn btn-ghost"
              style={{ ...commonStyle, ...activeStyle, cursor: "pointer" }}
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              {it.icon}
            </button>
          );
        }

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
