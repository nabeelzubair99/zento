"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type TransactionType = "EXPENSE" | "INCOME";

function parseAmountToCentsWithSign(
  input: string
): { centsAbs: number; sign: 1 | -1 } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const sign: 1 | -1 = trimmed.includes("-") ? -1 : 1;

  const cleaned = trimmed.replace(/[-$,\s]/g, "");
  if (!cleaned) return null;

  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;

  const centsAbs = Math.round(Math.abs(num) * 100);
  return { centsAbs, sign };
}

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

type Category = { id: string; name: string };

type TxFlag = "WORTH_IT" | "UNEXPECTED" | "REVIEW_LATER";

const FLAG_LABELS: Record<TxFlag, string> = {
  WORTH_IT: "Felt worth it",
  UNEXPECTED: "Unexpected",
  REVIEW_LATER: "Review later",
};

function toggleFlag(list: TxFlag[], flag: TxFlag) {
  return list.includes(flag) ? list.filter((f) => f !== flag) : [...list, flag];
}

export function AddTransactionForm() {
  const router = useRouter();

  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const [categories, setCategories] = React.useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = React.useState(true);
  const [categoryId, setCategoryId] = React.useState<string>(""); // "" = Uncategorized

  // Amount + type (Expense/Income)
  const [txType, setTxType] = React.useState<TransactionType | null>(null);
  const [amountText, setAmountText] = React.useState("");

  // Notes + flags (Phase 1)
  const [showDetails, setShowDetails] = React.useState(false);
  const [notes, setNotes] = React.useState<string>("");
  const [flags, setFlags] = React.useState<TxFlag[]>([]);

  // Create category UI
  const [showCreateCategory, setShowCreateCategory] = React.useState(false);
  const [newCategoryName, setNewCategoryName] = React.useState("");
  const [isCreatingCategory, setIsCreatingCategory] = React.useState(false);
  const [categoryError, setCategoryError] = React.useState<string | null>(null);

  const loadCategories = React.useCallback(async () => {
    setIsLoadingCategories(true);
    setCategoryError(null);
    try {
      const res = await fetch("/api/finance/categories", { cache: "no-store" });
      if (!res.ok) {
        setCategoryError(await readApiError(res));
        setCategories([]);
        return;
      }

      const data = (await res.json()) as Category[];
      setCategories(Array.isArray(data) ? data : []);
    } catch {
      setCategoryError("Failed to load categories.");
      setCategories([]);
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const disabledAny = isSaving || isCreatingCategory;

  const onCreateCategory = async () => {
    const name = newCategoryName.trim();
    setCategoryError(null);

    if (!name) {
      setCategoryError("Category name is required.");
      return;
    }

    setIsCreatingCategory(true);
    try {
      const res = await fetch("/api/finance/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        setCategoryError(await readApiError(res));
        return;
      }

      const created = (await res.json()) as { id: string; name: string };
      setNewCategoryName("");

      await loadCategories();
      setCategoryId(created.id);
      setShowCreateCategory(false);
    } catch {
      setCategoryError("Failed to create category.");
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const flipSign = () => {
    const trimmed = amountText.trim();
    const hasMinus = trimmed.startsWith("-");

    const next = hasMinus ? trimmed.replace(/^\s*-\s*/, "") : `-${trimmed}`;

    setAmountText(next);
    setTxType(hasMinus ? "INCOME" : "EXPENSE");
  };

  const setTypeAndNormalizeSign = (nextType: TransactionType) => {
    setTxType(nextType);
    const trimmed = amountText.trim();
    const hasMinus = trimmed.startsWith("-");

    if (nextType === "EXPENSE" && !hasMinus) {
      setAmountText(trimmed ? `-${trimmed}` : "-");
      return;
    }

    if (nextType === "INCOME" && hasMinus) {
      setAmountText(trimmed.replace(/^\s*-\s*/, ""));
    }
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSaving) return;

    setError(null);
    setIsSaving(true);

    try {
      const form = e.currentTarget;

      const description = (
        form.elements.namedItem("description") as HTMLInputElement
      ).value.trim();

      const date = (form.elements.namedItem("date") as HTMLInputElement).value;

      if (!description) {
        setError("Description is required.");
        return;
      }

      const parsed = parseAmountToCentsWithSign(amountText);
      if (parsed === null) {
        setError("Enter a valid amount (example: 12.34).");
        return;
      }
      if (!Number.isInteger(parsed.centsAbs)) {
        setError("Amount must be a valid number.");
        return;
      }
      if (parsed.centsAbs === 0) {
        setError("Amount cannot be 0.00.");
        return;
      }

      if (!date) {
        setError("Date is required.");
        return;
      }

      if (!txType) {
        setError("Please choose Expense or Income.");
        return;
      }

      const res = await fetch("/api/finance/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          amountCents: parsed.centsAbs,
          type: txType,
          date,
          categoryId: categoryId || null,
          notes: notes.trim() ? notes.trim() : null,
          flags,
        }),
      });

      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }

      form.reset();
      setAmountText("");
      setTxType(null);

      setCategoryId("");
      setShowCreateCategory(false);
      setCategoryError(null); // ✅ small cleanup

      setShowDetails(false);
      setNotes("");
      setFlags([]);

      router.refresh();
    } catch {
      setError("Something went wrong while saving. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      {/* Main fields */}
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label className="subtle">Description</label>
          <input
            className="input"
            name="description"
            required
            disabled={disabledAny}
            placeholder="e.g. Grocery run"
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          {/* Amount with $ prefix + type toggle + +/- button */}
          <div style={{ display: "grid", gap: 6 }}>
            <label className="subtle">Amount</label>

            {/* Type toggle */}
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
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
                  onClick={() => setTypeAndNormalizeSign("EXPENSE")}
                  disabled={disabledAny}
                  style={{
                    borderRadius: 0,
                    padding: "8px 12px",
                    fontWeight: 650,
                    background:
                      txType === "EXPENSE" ? "rgba(0,0,0,0.06)" : "transparent",
                  }}
                >
                  Expense
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setTypeAndNormalizeSign("INCOME")}
                  disabled={disabledAny}
                  style={{
                    borderRadius: 0,
                    padding: "8px 12px",
                    fontWeight: 650,
                    background:
                      txType === "INCOME" ? "rgba(0,0,0,0.06)" : "transparent",
                  }}
                >
                  Income
                </button>
              </div>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={flipSign}
                disabled={disabledAny}
                title="Flip sign"
              >
                ±
              </button>

              <span className="subtle" style={{ fontSize: 12 }}>
                Tip: use “-” for expenses
              </span>
            </div>

            {/* Amount input */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: "1px solid rgb(var(--border))",
                borderRadius: 14,
                padding: "0 12px",
                background: "rgb(var(--surface))",
              }}
            >
              <span className="subtle" style={{ fontSize: 14 }}>
                $
              </span>

              <input
                name="amount"
                required
                inputMode="decimal"
                placeholder="12.34"
                disabled={disabledAny}
                value={amountText}
                onChange={(e) => {
                  const next = e.target.value;
                  setAmountText(next);

                  const trimmed = next.trim();

                  if (trimmed.startsWith("-")) {
                    setTxType("EXPENSE");
                  } else if (trimmed.startsWith("+")) {
                    setTxType("INCOME");
                  } else if (trimmed !== "") {
                    setTxType("INCOME");
                  } else {
                    setTxType(null);
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  padding: "11px 0",
                  fontSize: 14,
                  color: "rgb(var(--text))",
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label className="subtle">Date</label>
            <input className="input" name="date" required type="date" disabled={disabledAny} />
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label className="subtle">Category</label>
          <select
            className="select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={disabledAny || isLoadingCategories}
            style={{ maxWidth: 360 }}
          >
            <option value="">{isLoadingCategories ? "Loading…" : "Uncategorized"}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setCategoryError(null);
                setShowCreateCategory((v) => !v);
              }}
              disabled={disabledAny}
              style={{ justifySelf: "flex-start" }}
            >
              {showCreateCategory ? "Hide category creator" : "Create a new category"}
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowDetails((v) => !v)}
              disabled={disabledAny}
            >
              {showDetails ? "Hide notes & flags" : "Add notes & flags"}
            </button>
          </div>
        </div>

        {/* Notes + flags */}
        {showDetails ? (
          <div
            style={{
              border: "1px solid rgb(var(--border))",
              borderRadius: 16,
              padding: 14,
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
                disabled={disabledAny}
                rows={3}
                placeholder="Add a little context… (what was this for, how did it feel?)"
                style={{ resize: "vertical", paddingTop: 10, paddingBottom: 10 }}
              />
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <div className="subtle">Gentle flags (optional)</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(Object.keys(FLAG_LABELS) as TxFlag[]).map((f) => {
                  const active = flags.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      className={`pill ${active ? "pill-accent" : ""}`}
                      onClick={() => setFlags((prev) => toggleFlag(prev, f))}
                      disabled={disabledAny}
                      style={{
                        cursor: disabledAny ? "not-allowed" : "pointer",
                        opacity: disabledAny ? 0.6 : 1,
                      }}
                    >
                      {FLAG_LABELS[f]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {/* Create category */}
        {showCreateCategory ? (
          <div
            style={{
              border: "1px solid rgb(var(--border))",
              borderRadius: 16,
              padding: 14,
              background: "rgba(255,255,255,0.55)",
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontWeight: 650 }}>New category</div>
              <div className="subtle">Example: Food, Rent, Utilities</div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                className="input"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name"
                disabled={disabledAny}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onCreateCategory();
                  }
                }}
                style={{ minWidth: 240 }}
              />

              <button className="btn btn-secondary" type="button" onClick={onCreateCategory} disabled={disabledAny}>
                {isCreatingCategory ? "Creating..." : "Create"}
              </button>
            </div>

            {categoryError ? <div style={{ color: "rgb(var(--danger))", fontSize: 13 }}>{categoryError}</div> : null}
          </div>
        ) : null}
      </div>

      {/* Footer actions */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="submit" disabled={disabledAny}>
          {isSaving ? "Saving..." : "Add transaction"}
        </button>

        {error ? <span style={{ color: "rgb(var(--danger))", fontSize: 13 }}>{error}</span> : null}
      </div>
    </form>
  );
}
