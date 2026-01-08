import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zento",
  description: "A calm, simple way to track your finances.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="app-shell">
        <div className="container-app">
          {/* Top brand bar */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white shadow-sm border"
                   style={{ borderColor: "rgb(var(--border))" }}>
                <div
                  className="h-full w-full rounded-2xl"
                  style={{
                    background:
                      "radial-gradient(10px 10px at 30% 30%, rgba(214,123,56,.35), transparent 60%), radial-gradient(10px 10px at 70% 70%, rgba(34,122,95,.35), transparent 60%)",
                  }}
                />
              </div>
              <div>
                <div className="text-lg font-semibold leading-tight">Zento</div>
                <div className="subtle">Warm, clear money tracking</div>
              </div>
            </div>

            <span className="pill">Beta</span>
          </div>

          {children}

          <div className="mt-10 subtle">
            <span>© {new Date().getFullYear()} Zento</span>
          </div>
        </div>
      </body>
    </html>
  );
}
