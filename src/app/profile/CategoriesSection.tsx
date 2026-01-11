"use client";

import * as React from "react";

type Category = {
  id: string;
  name: string;
  sortOrder: number;
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

function validateCategoryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Name is required.";
  if (trimmed.length > 40) return "Name is too long (max 40).";
  return null;
}

export default function CategoriesSection({
  isAuthed,
  initialItems,
}: {
  isAuthed: boolean;
  initialItems: Category[];
}) {
  const [items, setItems] = React.useState<Category[]>(initialItems);
  const [error, setError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const [newName, setNewName] = React.useState("");

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/finance/categories", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Category[];
      setItems(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  const onCreate = async () => {
    if (!isAuthed) return;
    setError(null);

    const msg = validateCategoryName(newName);
    if (msg) {
      setError(msg);
      return;
    }

    setIsBusy(true);
    try {
      const res = await fetch("/api/finance/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });

      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }

      setNewName("");
      await refresh();
    } finally {
      setIsBusy(false);
    }
  };

  const onRename = async (id: string, nextName: string) => {
    if (!isAuthed) return;
    setError(null);

    const msg = validateCategoryName(nextName);
    if (msg) {
      setError(msg);
      return;
    }

    setIsBusy(true);
    try {
      const res = await fetch(`/api/finance/categories?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName.trim() }),
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

  const onDelete = async (id: string) => {
    if (!isAuthed) return;

    // Keep it simple for now: delete → move transactions to Uncategorized
    // (You already support reassign in UI prompt; this keeps UX calm.)
    const ok = confirm(
      "Delete this category?\n\nTransactions in this category will become Uncategorized."
    );
    if (!ok) return;

    setError(null);
    setIsBusy(true);
    try {
      const res = await fetch(`/api/finance/categories?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reassignToCategoryId: null }),
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

  const move = async (id: string, dir: -1 | 1) => {
    if (!isAuthed) return;

    const idx = items.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= items.length) return;

    const next = [...items];
    const tmp = next[idx];
    next[idx] = next[nextIdx];
    next[nextIdx] = tmp;

    // Optimistic UI
    setItems(next);

    setError(null);
    setIsBusy(true);
    try {
      const order = next.map((c) => c.id);
      const res = await fetch("/api/finance/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });

      if (!res.ok) {
        setError(await readApiError(res));
        await refresh(); // revert
        return;
      }

      await refresh();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {!isAuthed ? (
        <div className="subtle" style={{ fontSize: 12 }}>
          Sign in to add, edit, delete, or reorder categories.
        </div>
      ) : null}

      {error ? <div style={{ color: "rgb(var(--danger))", fontSize: 13 }}>{error}</div> : null}

      {/* Create */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="input"
          placeholder="e.g. Groceries"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={!isAuthed || isBusy}
          style={{ minWidth: 260 }}
        />
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onCreate}
          disabled={!isAuthed || isBusy}
        >
          Add
        </button>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="subtle">No categories yet.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {items.map((c, i) => (
            <li
              key={c.id}
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
                <div style={{ fontWeight: 650 }}>{c.name}</div>
                <div className="subtle" style={{ fontSize: 12 }}>
                  Order: {i + 1}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={!isAuthed || isBusy || i === 0}
                  onClick={() => void move(c.id, -1)}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={!isAuthed || isBusy || i === items.length - 1}
                  onClick={() => void move(c.id, 1)}
                  title="Move down"
                >
                  ↓
                </button>

                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={!isAuthed || isBusy}
                  onClick={() => {
                    const next = prompt("Rename category", c.name);
                    if (next === null) return;
                    void onRename(c.id, next);
                  }}
                >
                  Edit
                </button>

                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={!isAuthed || isBusy}
                  onClick={() => void onDelete(c.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
