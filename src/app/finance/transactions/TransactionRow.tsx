"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Category = { id: string; name: string };

function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function isoToDateInputValue(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function readErrorMessage(res: Response) {
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

export function TransactionRow(props: {
  id: string;
  description: string;
  amountCents: number;
  dateISO: string;
  formattedDate: string;
  formattedAmount: string;
  categoryId?: string | null;
  categoryName?: string | null;
}) {
  const router = useRouter();

  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Undo delete state
  const [pendingDelete, setPendingDelete] = React.useState(false);
  const deleteTimerRef = React.useRef<number | null>(null);

  // Categories state (loaded only when editing)
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = React.useState(false);
  const [categoriesError, setCategoriesError] = React.useState<string | null>(null);

  const [desc, setDesc] = React.useState(props.description);
  const [amount, setAmount] = React.useState(String((props.amountCents / 100).toFixed(2)));
  const [date, setDate] = React.useState(isoToDateInputValue(props.dateISO));
  const [categoryId, setCategoryId] = React.useState<string>(props.categoryId ?? "");

  const descInputRef = React.useRef<HTMLInputElement | null>(null);

  const amountIsPositive = props.amountCents >= 0;

  async function loadCategoriesOnce() {
    if (categories.length > 0) return;

    setIsLoadingCategories(true);
    setCategoriesError(null);

    try {
      const res = await fetch("/api/finance/categories", { cache: "no-store" });
      if (!res.ok) {
        setCategoriesError(await readErrorMessage(res));
        return;
      }
      const data = (await res.json()) as Category[];
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategoriesError("Failed to load categories.");
    } finally {
      setIsLoadingCategories(false);
    }
  }

  // Keep local fields in sync when not editing
  React.useEffect(() => {
    if (!isEditing) {
      setDesc(props.description);
      setAmount(String((props.amountCents / 100).toFixed(2)));
      setDate(isoToDateInputValue(props.dateISO));
      setCategoryId(props.categoryId ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.description, props.amountCents, props.dateISO, props.categoryId, isEditing]);

  // Autofocus + load categories when editing
  React.useEffect(() => {
    if (isEditing) {
      void loadCategoriesOnce();
      setTimeout(() => descInputRef.current?.focus(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // Cleanup delete timer on unmount
  React.useEffect(() => {
    return () => {
      if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
    };
  }, []);

  const doDeleteNow = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/finance/transactions?id=${encodeURIComponent(props.id)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        setError(await readErrorMessage(res));
        setPendingDelete(false);
        return;
      }

      router.refresh();
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = () => {
    setError(null);
    setPendingDelete(true);

    if (deleteTimerRef.current) window.clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = window.setTimeout(() => {
      void doDeleteNow();
    }, 5000);
  };

  const onUndoDelete = () => {
    setError(null);
    setPendingDelete(false);
    if (deleteTimerRef.current) {
      window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
  };

  const onSave = async () => {
    setError(null);

    const description = desc.trim();
    if (!description) {
      setError("Description is required.");
      return;
    }

    const amountCents = parseAmountToCents(amount);
    if (amountCents === null) {
      setError("Enter a valid amount (example: 12.34).");
      return;
    }

    if (!date) {
      setError("Date is required.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/finance/transactions?id=${encodeURIComponent(props.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          amountCents,
          date,
          categoryId: categoryId || null,
        }),
      });

      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }

      setIsEditing(false);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  };

  const onCancel = () => {
    setError(null);
    setIsEditing(false);
  };

  const onEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isSaving) void onSave();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (!isSaving) onCancel();
      return;
    }
  };

  // ---------- VIEW MODE ----------
  if (!isEditing) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "baseline" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div
                style={{
                  fontWeight: 650,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 520,
                }}
                title={props.description}
              >
                {props.description}
              </div>

              {props.categoryName ? <span className="pill pill-accent">{props.categoryName}</span> : null}
            </div>

            <div className="subtle" style={{ marginTop: 2 }}>
              {props.formattedDate}
            </div>

            {error ? (
              <div style={{ marginTop: 8, color: "rgb(var(--danger))", fontSize: 13 }}>{error}</div>
            ) : null}
          </div>

          <div
            className={`amount ${amountIsPositive ? "amount-positive" : "amount-negative"}`}
            style={{ fontWeight: 750, whiteSpace: "nowrap" }}
            title={props.formattedAmount}
          >
            {props.formattedAmount}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setError(null);
              setPendingDelete(false);
              if (deleteTimerRef.current) {
                window.clearTimeout(deleteTimerRef.current);
                deleteTimerRef.current = null;
              }
              setIsEditing(true);
            }}
            disabled={isSaving || pendingDelete}
          >
            Edit
          </button>

          <button
            type="button"
            className="btn btn-danger"
            onClick={onDelete}
            disabled={isSaving || pendingDelete}
          >
            Delete
          </button>

          {pendingDelete ? (
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 14,
                border: "1px solid rgba(var(--danger), 0.25)",
                background: "rgba(var(--danger), 0.08)",
              }}
            >
              <span className="subtle" style={{ color: "rgb(var(--danger))" }}>
                Deleted. Finalizing in 5s…
              </span>
              <button type="button" className="btn btn-primary" onClick={onUndoDelete} disabled={isSaving}>
                Undo
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // ---------- EDIT MODE ----------
  return (
    <div
      onKeyDown={onEditKeyDown}
      style={{
        display: "grid",
        gap: 12,
        padding: 14,
        borderRadius: 16,
        border: "1px solid rgb(var(--border))",
        background: "rgba(255,255,255,0.65)",
      }}
    >
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label className="subtle">Description</label>
          <input
            ref={descInputRef}
            className="input"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            disabled={isSaving}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label className="subtle">Amount</label>
            <input
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              disabled={isSaving}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label className="subtle">Date</label>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isSaving}
            />
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label className="subtle">Category</label>
          <select
            className="select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={isSaving || isLoadingCategories}
            style={{ maxWidth: 360 }}
          >
            <option value="">{isLoadingCategories ? "Loading…" : "Uncategorized"}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {categoriesError ? (
            <span style={{ fontSize: 12, color: "rgb(var(--danger))" }}>{categoriesError}</span>
          ) : null}
        </div>

        {error ? <div style={{ color: "rgb(var(--danger))", fontSize: 13 }}>{error}</div> : null}

        <div className="subtle">
          Tip: <b>Enter</b> to save • <b>Esc</b> to cancel
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
      </div>
    </div>
  );
}
