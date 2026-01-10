"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Category = { id: string; name: string };

type TransactionType = "EXPENSE" | "INCOME";

type TxFlag = "WORTH_IT" | "UNEXPECTED" | "REVIEW_LATER";

const FLAG_LABELS: Record<TxFlag, string> = {
  WORTH_IT: "Felt worth it",
  UNEXPECTED: "Unexpected",
  REVIEW_LATER: "Review later",
};

function toggleFlag(list: TxFlag[], flag: TxFlag) {
  return list.includes(flag) ? list.filter((f) => f !== flag) : [...list, flag];
}

function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

/**
 * Use UTC parts so ISO dates from the server don't shift by timezone and show the wrong day.
 */
function isoToDateInputValue(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoneyFromCents(centsAbs: number, type: TransactionType) {
  const dollars = centsAbs / 100;
  const sign = type === "EXPENSE" ? "-" : "";
  const formatted = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(dollars);
  return `${sign}${formatted}`;
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

  // Canonical: amountCents is absolute (positive); direction comes from type.
  amountCents: number;
  type: TransactionType;

  dateISO: string;
  formattedDate: string;

  formattedAmount?: string;

  categoryId?: string | null;
  categoryName?: string | null;

  notes?: string | null;
  flags?: TxFlag[] | null;
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

  // Store as ABS value in the input; type determines direction.
  const [amount, setAmount] = React.useState(
    String((Math.abs(props.amountCents) / 100).toFixed(2))
  );

  const [txType, setTxType] = React.useState<TransactionType>(props.type);
  const [date, setDate] = React.useState(isoToDateInputValue(props.dateISO));
  const [categoryId, setCategoryId] = React.useState<string>(props.categoryId ?? "");

  // Notes + flags local state
  const [notes, setNotes] = React.useState<string>(props.notes ?? "");
  const [flags, setFlags] = React.useState<TxFlag[]>(props.flags ?? []);

  const [showDetails, setShowDetails] = React.useState<boolean>(
    !!(props.notes || (props.flags?.length ?? 0) > 0)
  );

  const descInputRef = React.useRef<HTMLInputElement | null>(null);
  const prettyFlags = flags.filter(Boolean);

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
      setAmount(String((Math.abs(props.amountCents) / 100).toFixed(2)));
      setTxType(props.type);
      setDate(isoToDateInputValue(props.dateISO));
      setCategoryId(props.categoryId ?? "");
      setNotes(props.notes ?? "");
      setFlags(props.flags ?? []);
      setShowDetails(!!(props.notes || (props.flags?.length ?? 0) > 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.description,
    props.amountCents,
    props.type,
    props.dateISO,
    props.categoryId,
    props.notes,
    props.flags,
    isEditing,
  ]);

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
      const res = await fetch(
        `/api/finance/transactions?id=${encodeURIComponent(props.id)}`,
        { method: "DELETE" }
      );

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

    const amountCentsAbs = parseAmountToCents(amount);
    if (amountCentsAbs === null) {
      setError("Enter a valid amount (example: 12.34).");
      return;
    }
    if (!Number.isInteger(amountCentsAbs) || amountCentsAbs === 0) {
      setError("Amount must be greater than 0.00.");
      return;
    }

    if (!date) {
      setError("Date is required.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/finance/transactions?id=${encodeURIComponent(props.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description,
            amountCents: amountCentsAbs, // store abs
            type: txType,
            date,
            categoryId: categoryId || null,
            notes: notes.trim() ? notes.trim() : null,
            flags,
          }),
        }
      );

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
    const hasDetails = !!(props.notes || (props.flags?.length ?? 0) > 0);
    const viewFlags = (props.flags ?? []) as TxFlag[];

    const viewAmount = formatMoneyFromCents(Math.abs(props.amountCents), props.type);
    const viewIsPositive = props.type === "INCOME";

    return (
      <>
        <div className="txWrap">
          <div className="txTop">
            <div className="txMain">
              <div className="txTitleRow">
                <div className="txTitle" title={props.description}>
                  {props.description}
                </div>

                {props.categoryName ? (
                  <span className="pill pill-accent">{props.categoryName}</span>
                ) : null}
              </div>

              <div className="subtle txDate">{props.formattedDate}</div>

              {/* Amount appears here on mobile via CSS duplication (desktop keeps right-side amount) */}
              <div
                className={`amount txAmountInline ${
                  viewIsPositive ? "amount-positive" : "amount-negative"
                }`}
                title={viewAmount}
              >
                {viewAmount}
              </div>

              {hasDetails && showDetails && viewFlags.length ? (
                <div className="txFlags">
                  {viewFlags.map((f) => (
                    <span key={f} className="pill">
                      {FLAG_LABELS[f] ?? f}
                    </span>
                  ))}
                </div>
              ) : null}

              {hasDetails && showDetails && props.notes ? (
                <div className="note-block txNotes">{props.notes}</div>
              ) : null}

              {error ? <div className="txError">{error}</div> : null}
            </div>

            {/* Desktop amount (stays exactly like your old layout) */}
            <div
              className={`amount txAmountRight ${
                viewIsPositive ? "amount-positive" : "amount-negative"
              }`}
              title={viewAmount}
            >
              {viewAmount}
            </div>
          </div>

          {/* Actions */}
          <div className="txActions">
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

            {hasDetails ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowDetails((v) => !v)}
                disabled={isSaving || pendingDelete}
              >
                {showDetails ? "Hide details" : "Show details"}
              </button>
            ) : null}

            <button
              type="button"
              className="btn btn-danger"
              onClick={onDelete}
              disabled={isSaving || pendingDelete}
            >
              Delete
            </button>

            {pendingDelete ? (
              <div className="txUndo">
                <span className="subtle" style={{ color: "rgb(var(--danger))" }}>
                  Deleted. Finalizing in 5s…
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onUndoDelete}
                  disabled={isSaving}
                >
                  Undo
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <style jsx>{`
          /* Desktop defaults: match your existing layout */
          .txWrap {
            display: grid;
            gap: 10px;
          }

          .txTop {
            display: flex;
            justify-content: space-between;
            gap: 14px;
            align-items: baseline;
          }

          .txMain {
            min-width: 0;
          }

          .txTitleRow {
            display: flex;
            gap: 10px;
            align-items: center;
            flex-wrap: wrap;
          }

          .txTitle {
            font-weight: 650;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 520px;
          }

          .txDate {
            margin-top: 2px;
          }

          .txFlags {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 8px;
          }

          .txNotes {
            margin-top: 8px;
          }

          .txError {
            margin-top: 8px;
            color: rgb(var(--danger));
            font-size: 13px;
          }

          .txAmountRight {
            font-weight: 750;
            white-space: nowrap;
          }

          /* Hidden on desktop; shown on mobile so the amount sits under the title */
          .txAmountInline {
            display: none;
            margin-top: 8px;
            font-weight: 800;
            font-size: 18px;
            letter-spacing: -0.01em;
          }

          .txActions {
            display: flex;
            gap: 10px;
            align-items: center;
            flex-wrap: wrap;
          }

          .txUndo {
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border-radius: 14px;
            border: 1px solid rgba(var(--danger), 0.25);
            background: rgba(var(--danger), 0.08);
          }

          /* Mobile-only: polished card layout */
          @media (max-width: 768px) {
            .txTop {
              flex-direction: column;
              align-items: flex-start;
              gap: 10px;
            }

            .txTitle {
              max-width: 100%;
            }

            /* Put amount under the title and make it easier to scan */
            .txAmountRight {
              display: none;
            }
            .txAmountInline {
              display: inline-flex;
            }

            /* Actions: clean grid with big tap targets */
            .txActions {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px;
              align-items: stretch;
            }

            .txActions :global(button) {
              width: 100%;
              justify-content: center;
            }

            /* Undo takes full width on mobile */
            .txUndo {
              grid-column: 1 / -1;
              width: 100%;
              margin-left: 0;
              justify-content: space-between;
            }
          }
        `}</style>
      </>
    );
  }

  // ---------- EDIT MODE ----------
  return (
    <>
      <div onKeyDown={onEditKeyDown} className="txEditWrap">
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

          <div className="txEditTwoCol">
            <div style={{ display: "grid", gap: 6 }}>
              <label className="subtle">Amount</label>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    border: "1px solid rgb(var(--border))",
                    borderRadius: 999,
                    overflow: "hidden",
                    background: "rgb(var(--surface))",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setTxType("EXPENSE")}
                    disabled={isSaving}
                    style={{
                      borderRadius: 0,
                      padding: "8px 12px",
                      fontWeight: 650,
                      background: txType === "EXPENSE" ? "rgba(0,0,0,0.06)" : "transparent",
                    }}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setTxType("INCOME")}
                    disabled={isSaving}
                    style={{
                      borderRadius: 0,
                      padding: "8px 12px",
                      fontWeight: 650,
                      background: txType === "INCOME" ? "rgba(0,0,0,0.06)" : "transparent",
                    }}
                  >
                    Income
                  </button>
                </div>

                <span className="subtle" style={{ fontSize: 12 }}>
                  {txType === "EXPENSE" ? "Will save as negative" : "Will save as positive"}
                </span>
              </div>

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
              <span style={{ fontSize: 12, color: "rgb(var(--danger))" }}>
                {categoriesError}
              </span>
            ) : null}
          </div>

          <div
            style={{
              border: "1px solid rgb(var(--border))",
              borderRadius: 16,
              padding: 12,
              background: "rgba(255,255,255,0.55)",
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <label className="subtle">Note (optional)</label>
              <textarea
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isSaving}
                rows={3}
                placeholder="Add a little context…"
                style={{ resize: "vertical", paddingTop: 10, paddingBottom: 10 }}
              />
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div className="subtle">Gentle flags (optional)</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(Object.keys(FLAG_LABELS) as TxFlag[]).map((f) => {
                  const active = prettyFlags.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      className={`pill ${active ? "pill-accent" : ""}`}
                      onClick={() => setFlags((prev) => toggleFlag(prev, f))}
                      disabled={isSaving}
                      style={{
                        cursor: isSaving ? "not-allowed" : "pointer",
                        opacity: isSaving ? 0.6 : 1,
                      }}
                    >
                      {FLAG_LABELS[f]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error ? <div style={{ color: "rgb(var(--danger))", fontSize: 13 }}>{error}</div> : null}

          <div className="subtle">
            Tip: <b>Enter</b> to save • <b>Esc</b> to cancel
          </div>
        </div>

        <div className="txEditActions">
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={isSaving}>
            Cancel
          </button>
        </div>
      </div>

      <style jsx>{`
        .txEditWrap {
          display: grid;
          gap: 12px;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgb(var(--border));
          background: rgba(255, 255, 255, 0.65);
        }

        .txEditTwoCol {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .txEditActions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        @media (max-width: 768px) {
          /* Edit form: stack fields for comfort */
          .txEditTwoCol {
            grid-template-columns: 1fr;
          }

          /* Buttons: full-width, easy taps */
          .txEditActions {
            display: grid;
            grid-template-columns: 1fr;
          }

          .txEditActions :global(button) {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </>
  );
}
