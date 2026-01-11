"use client";

import * as React from "react";

type PaymentSourceType = "BANK" | "CARD" | "CASH";

type PaymentSource = {
  id: string;
  name: string;
  type: PaymentSourceType;
  createdAt: string | Date;
  updatedAt: string | Date;
};

async function readApiError(res: Response) {
  try {
    const data = await res.json();
    if (data?.error) return String(data.error);
  } catch {}
  try {
    const text = await res.text();
    if (text) return text;
  } catch {}
  return "Request failed.";
}

async function setDefaultPaymentSource(idOrNull: string | null) {
  const res = await fetch("/api/user/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // empty string => null on the server (your route supports this)
    body: JSON.stringify({
      defaultTransactionsPaymentSourceId: idOrNull ?? "",
    }),
  });

  if (!res.ok) throw new Error(await readApiError(res));
}

export default function PaymentSourcesSection({
  isAuthed,
  initialItems,
  initialDefaultId,
}: {
  isAuthed: boolean;
  initialItems: PaymentSource[];
  // null means "All accounts" default
  initialDefaultId: string | null;
}) {
  const [items, setItems] = React.useState<PaymentSource[]>(initialItems);
  const [defaultId, setDefaultId] = React.useState<string | null>(initialDefaultId);

  const [error, setError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<PaymentSourceType>("CARD");

  const refresh = React.useCallback(async () => {
    try {
      const [psRes, prefRes] = await Promise.all([
        fetch("/api/finance/payment-sources", { cache: "no-store" }),
        fetch("/api/user/preferences", { cache: "no-store" }).catch(() => null),
      ]);

      if (psRes.ok) {
        const data = (await psRes.json()) as PaymentSource[];
        setItems(Array.isArray(data) ? data : []);
      }

      // Optional: if you have a GET /api/user/preferences, keep defaultId in sync.
      // If you don't, this silently does nothing.
      if (prefRes && prefRes.ok) {
        const pref = (await prefRes.json()) as { user?: { defaultTransactionsPaymentSourceId?: string | null } };
        const next = pref?.user?.defaultTransactionsPaymentSourceId ?? null;
        setDefaultId(next);
      }
    } catch {}
  }, []);

  const onCreate = async () => {
    if (!isAuthed) return;
    setError(null);

    const n = name.trim();
    if (!n) {
      setError("Name is required.");
      return;
    }

    setIsBusy(true);
    try {
      const res = await fetch("/api/finance/payment-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, type }),
      });

      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }

      setName("");
      await refresh();
    } finally {
      setIsBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!isAuthed) return;
    if (!confirm("Delete this payment method? Transactions will become unassigned.")) return;

    setError(null);
    setIsBusy(true);
    try {
      const res = await fetch(`/api/finance/payment-sources/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }

      // If we deleted the current default, revert to All accounts
      if (defaultId === id) {
        try {
          await setDefaultPaymentSource(null);
          setDefaultId(null);
        } catch {
          // non-fatal; UI will still work
        }
      }

      await refresh();
    } finally {
      setIsBusy(false);
    }
  };

  const onRename = async (id: string, nextName: string) => {
    if (!isAuthed) return;

    setError(null);
    setIsBusy(true);
    try {
      const res = await fetch(`/api/finance/payment-sources/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });

      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }

      await refresh();
    } finally {
      setIsBusy(false);
    }
  };

  const onMakeDefault = async (idOrNull: string | null) => {
    if (!isAuthed) return;

    setError(null);
    setIsBusy(true);
    try {
      await setDefaultPaymentSource(idOrNull);
      setDefaultId(idOrNull);
    } catch (e: any) {
      setError(e?.message ?? "Failed to set default.");
    } finally {
      setIsBusy(false);
    }
  };

  const isDefaultAll = defaultId === null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!isAuthed ? (
        <div className="subtle" style={{ fontSize: 12 }}>
          Sign in to add, edit, delete, or set a default payment method.
        </div>
      ) : null}

      {error ? <div style={{ color: "rgb(var(--danger))", fontSize: 13 }}>{error}</div> : null}

      {/* Create */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="input"
          placeholder="e.g. Chase Checking"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isAuthed || isBusy}
          style={{ minWidth: 260 }}
        />

        <select
          className="select"
          value={type}
          onChange={(e) => setType(e.target.value as PaymentSourceType)}
          disabled={!isAuthed || isBusy}
        >
          <option value="BANK">Bank</option>
          <option value="CARD">Card</option>
          <option value="CASH">Cash</option>
        </select>

        <button className="btn btn-secondary" type="button" onClick={onCreate} disabled={!isAuthed || isBusy}>
          Add
        </button>
      </div>

      {/* List */}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {/* Always-available "All accounts" default option */}
        <li
          style={{
            border: "1px solid rgb(var(--border))",
            borderRadius: 16,
            padding: 12,
            display: "flex",
            gap: 10,
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 650 }}>All accounts</div>
              {isDefaultAll ? <span className="pill pill-accent">Default</span> : null}
            </div>
            <div className="subtle" style={{ fontSize: 12 }}>
              No default selected
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!isDefaultAll ? (
              <button
                className="btn btn-ghost"
                type="button"
                disabled={!isAuthed || isBusy}
                onClick={() => void onMakeDefault(null)}
              >
                Make default
              </button>
            ) : null}
          </div>
        </li>

        {/* Actual payment sources */}
        {items.length === 0 ? (
          <li className="subtle">No payment methods yet.</li>
        ) : (
          items.map((p) => {
            const isDefault = defaultId === p.id;

            return (
              <li
                key={p.id}
                style={{
                  border: "1px solid rgb(var(--border))",
                  borderRadius: 16,
                  padding: 12,
                  display: "flex",
                  gap: 10,
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "grid", gap: 2 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 650 }}>{p.name}</div>
                    {isDefault ? <span className="pill pill-accent">Default</span> : null}
                  </div>
                  <div className="subtle" style={{ fontSize: 12 }}>
                    {p.type}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={!isAuthed || isBusy}
                    onClick={() => {
                      const next = prompt("Rename payment method", p.name);
                      if (next === null) return;
                      const trimmed = next.trim();
                      if (!trimmed) return;
                      void onRename(p.id, trimmed);
                    }}
                  >
                    Edit
                  </button>

                  {!isDefault ? (
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={!isAuthed || isBusy}
                      onClick={() => void onMakeDefault(p.id)}
                    >
                      Make default
                    </button>
                  ) : null}

                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={!isAuthed || isBusy}
                    onClick={() => void onDelete(p.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
