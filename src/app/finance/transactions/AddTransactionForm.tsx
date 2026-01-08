"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

function parseAmountToCents(input: string): number | null {
  // Accepts: "12.34", "$12.34", "1,234.56"
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return null;

  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;

  return Math.round(num * 100);
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

export function AddTransactionForm() {
  const router = useRouter();

  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const [categories, setCategories] = React.useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = React.useState(true);
  const [categoryId, setCategoryId] = React.useState<string>(""); // "" = Uncategorized

  // Create category UI
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

      // Refresh list, then select the newly created category
      await loadCategories();
      setCategoryId(created.id);
    } catch {
      setCategoryError("Failed to create category.");
    } finally {
      setIsCreatingCategory(false);
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

      const amountRaw = (form.elements.namedItem("amount") as HTMLInputElement).value;
      const date = (form.elements.namedItem("date") as HTMLInputElement).value;

      if (!description) {
        setError("Description is required.");
        return;
      }

      const amountCents = parseAmountToCents(amountRaw);
      if (amountCents === null) {
        setError("Enter a valid amount (example: 12.34).");
        return;
      }
      if (!Number.isInteger(amountCents)) {
        setError("Amount must be a valid number.");
        return;
      }
      if (amountCents === 0) {
        setError("Amount cannot be 0.00.");
        return;
      }

      if (!date) {
        setError("Date is required.");
        return;
      }

      const res = await fetch("/api/finance/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          amountCents,
          date,
          categoryId: categoryId || null,
        }),
      });

      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }

      form.reset();
      setCategoryId("");
      router.refresh();
    } catch {
      setError("Something went wrong while saving. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label className="subtle">Description</label>
          <input className="input" name="description" required disabled={disabledAny} placeholder="e.g. Grocery run" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label className="subtle">Amount</label>
            <input
              className="input"
              name="amount"
              required
              inputMode="decimal"
              placeholder="12.34"
              disabled={disabledAny}
            />
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

          <div className="subtle" style={{ marginTop: 2 }}>
            Tip: Keep categories broad (Food, Rent, Bills, Fun).
          </div>
        </div>

        {/* Create category */}
        <div style={{ display: "grid", gap: 6 }}>
          <label className="subtle">Create a new category</label>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              className="input"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category (e.g. Food)"
              disabled={disabledAny}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault(); // don't submit the transaction form
                  void onCreateCategory();
                }
              }}
            />

            <button className="btn" type="button" onClick={onCreateCategory} disabled={disabledAny}>
              {isCreatingCategory ? "Creating..." : "Create"}
            </button>
          </div>

          {categoryError ? <div style={{ color: "crimson", fontSize: 13 }}>{categoryError}</div> : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="submit" disabled={disabledAny}>
          {isSaving ? "Saving..." : "Add transaction"}
        </button>

        {error ? <span style={{ color: "crimson", fontSize: 13 }}>{error}</span> : null}
      </div>
    </form>
  );
}
