import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zento",
  description: "A calm, simple way to track your finances.",
};

function ZentoMark() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 40 40"
      aria-hidden
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="zentoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop
            offset="0%"
            stopColor="rgb(var(--accent))"
            stopOpacity="0.9"
          />
          <stop
            offset="100%"
            stopColor="rgb(181 142 92)"
            stopOpacity="0.9"
          />
        </linearGradient>
      </defs>

      <rect
        x="1"
        y="1"
        width="38"
        height="38"
        rx="14"
        fill="url(#zentoGrad)"
        opacity="0.18"
        stroke="rgb(var(--border))"
      />

      {/* leaf / petal shapes */}
      <path
        d="M10 22c0-6 6-10 12-10 0 6-4 12-12 12z"
        fill="rgb(var(--accent))"
        opacity="0.55"
      />
      <path
        d="M18 26c0-6 6-10 12-10 0 6-4 12-12 12z"
        fill="rgb(181 142 92)"
        opacity="0.55"
      />

      {/* tiny sparkle */}
      <path
        d="M12.5 12.5l1.2 2.2 2.2 1.2-2.2 1.2-1.2 2.2-1.2-2.2-2.2-1.2 2.2-1.2z"
        fill="white"
        opacity="0.55"
      />
    </svg>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="app-shell">
        <div className="container-app">
          {/* Top brand bar */}
          <header
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 28,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <ZentoMark />

              <div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    lineHeight: 1.1,
                  }}
                >
                  Zento
                </div>
                <div className="subtle">Warm, clear money tracking</div>
              </div>
            </div>

            <span className="pill pill-accent">Beta</span>
          </header>

          {children}

          <footer className="subtle" style={{ marginTop: 40 }}>
            <span>© {new Date().getFullYear()} Zento</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
