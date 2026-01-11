"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { signOut, useSession } from "next-auth/react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  kind?: "link" | "logout";
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
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

function IconUser({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ opacity: active ? 1 : 0.8 }}
    >
      <path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
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

export function NavBar({
  homeHref,
  dashboardHref = "/dashboard",
  reportsHref,
  profileHref = "/profile",
  signInHref = "/api/auth/signin",
}: {
  homeHref: string;
  reportsHref: string;
  dashboardHref?: string;
  profileHref?: string;
  signInHref?: string;
}) {
  const pathname = usePathname();
  const { status } = useSession();
  const isAuthed = status === "authenticated";

  const items: NavItem[] = [
    {
      href: homeHref,
      label: "Home",
      icon: <IconHome active={isActivePath(pathname, homeHref)} />,
      kind: "link",
    },
    {
      href: dashboardHref,
      label: "Dashboard",
      icon: <IconDashboard active={isActivePath(pathname, dashboardHref)} />,
      kind: "link",
    },
    {
      href: reportsHref,
      label: "Reports",
      icon: <IconFilter active={isActivePath(pathname, reportsHref)} />,
      kind: "link",
    },
    {
      href: profileHref,
      label: "Profile",
      icon: <IconUser active={isActivePath(pathname, profileHref)} />,
      kind: "link",
    },
    ...(isAuthed
      ? [
          {
            href: "#logout",
            label: "Logout",
            icon: <IconLogout />,
            kind: "logout" as const,
          },
        ]
      : [
          {
            href: signInHref,
            label: "Sign in",
            icon: <IconLogin />,
            kind: "link" as const,
          },
        ]),
  ];

  return (
    <>
      {/* Desktop nav */}
      <div className="navDesktop" style={{ display: "flex", gap: 10 }}>
        {items.map((it) => {
          const active = it.kind !== "logout" && isActivePath(pathname, it.href);

          if (it.kind === "logout") {
            return (
              <button
                key={it.label}
                type="button"
                aria-label={it.label}
                title={it.label}
                onClick={() => signOut({ callbackUrl: "/" })}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid rgb(var(--border))",
                  background: "rgb(var(--surface))",
                  cursor: "pointer",
                }}
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
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 12,
                border: "1px solid rgb(var(--border))",
                background: "rgb(var(--surface))",
                boxShadow: active ? "0 0 0 3px rgba(0,0,0,0.06)" : undefined,
              }}
            >
              {it.icon}
            </Link>
          );
        })}
      </div>

      {/* Mobile bottom nav */}
      <nav className="navMobile">
        {items.map((it) => {
          const active = it.kind !== "logout" && isActivePath(pathname, it.href);

          if (it.kind === "logout") {
            return (
              <button
                key={it.label}
                type="button"
                className={`navMobileItem ${active ? "isActive" : ""}`}
                onClick={() => signOut({ callbackUrl: "/" })}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            );
          }

          return (
            <Link key={it.label} href={it.href} className={`navMobileItem ${active ? "isActive" : ""}`}>
              {it.icon}
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <style jsx>{`
        .navMobile {
          display: none;
        }

        @media (max-width: 768px) {
          .navDesktop {
            display: none !important;
          }

          .navMobile {
            position: fixed;
            left: 12px;
            right: 12px;
            bottom: 12px;
            z-index: 50;

            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;

            padding: 10px;
            border-radius: 18px;
            border: 1px solid rgb(var(--border));
            background: rgba(255, 255, 255, 0.86);
            backdrop-filter: blur(10px);
            box-shadow: 0 18px 45px rgba(0, 0, 0, 0.12);

            padding-bottom: calc(10px + env(safe-area-inset-bottom));
          }

          .navMobileItem {
            display: grid;
            place-items: center;
            gap: 4px;
            padding: 10px 6px;
            border-radius: 14px;
            text-decoration: none;
            color: inherit;
            font-size: 11px;
            min-height: 54px;
          }

          .navMobileItem.isActive {
            background: rgba(0, 0, 0, 0.05);
            border: 1px solid rgb(var(--border));
          }
        }
      `}</style>
    </>
  );
}
