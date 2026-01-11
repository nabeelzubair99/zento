"use client";

import * as React from "react";
import Link from "next/link";
import { AccountSelect } from "@/components/AccountSelect";
import * as Select from "@radix-ui/react-select";

type CategoryItem = { id: string; name: string };
type PaymentSourceItem = { id: string; name: string };

const CAT_ALL = "__all__";
const CAT_UNCATEGORIZED = "__uncategorized__";

function CategorySelect({
  name,
  value, // "" | "uncategorized" | real id
  onChange,
  items,
  disabled,
  maxWidth = 360,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  items: CategoryItem[];
  disabled?: boolean;
  maxWidth?: number;
}) {
  const radixValue = value === "" ? CAT_ALL : value === "uncategorized" ? CAT_UNCATEGORIZED : value;

  const handleValueChange = (v: string) => {
    if (v === CAT_ALL) return onChange("");
    if (v === CAT_UNCATEGORIZED) return onChange("uncategorized");
    return onChange(v);
  };

  return (
    <div style={{ maxWidth }}>
      {/* ensures GET form submits the real value */}
      <input type="hidden" name={name} value={value} />

      <Select.Root value={radixValue} onValueChange={handleValueChange} disabled={disabled}>
        <Select.Trigger className="accSelectTrigger">
          <Select.Value placeholder="All categories" />
          <Select.Icon className="accSelectIcon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content className="accSelectContent" position="popper" sideOffset={6}>
            <Select.Viewport className="accSelectViewport">
              <Select.Item value={CAT_ALL} className="accSelectItem">
                <Select.ItemText>All categories</Select.ItemText>
              </Select.Item>

              <Select.Item value={CAT_UNCATEGORIZED} className="accSelectItem">
                <Select.ItemText>Uncategorized</Select.ItemText>
              </Select.Item>

              {items.length ? <div className="accSelectLabel">Categories</div> : null}

              {items.map((c) => (
                <Select.Item key={c.id} value={c.id} className="accSelectItem">
                  <Select.ItemText>{c.name}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

export function ReportsFilters({
  month,
  q,
  categoryId,
  paymentSourceId, // "" | "unassigned" | real id

  categories,
  paymentSources,

  emptyState,
}: {
  month: string;
  q: string;
  categoryId: string;
  paymentSourceId: string;

  categories: CategoryItem[];
  paymentSources: PaymentSourceItem[];

  emptyState: boolean;
}) {
  const [accountValue, setAccountValue] = React.useState(paymentSourceId);
  const [categoryValue, setCategoryValue] = React.useState(categoryId);

  return (
    <form method="GET" style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <label className="subtle">Month</label>
        <input
          className="input"
          type="month"
          name="month"
          defaultValue={month}
          style={{ width: "fit-content" }}
          disabled={emptyState}
        />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label className="subtle">Search</label>
        <input
          className="input"
          name="q"
          defaultValue={q}
          placeholder="Search description or notes…"
          disabled={emptyState}
        />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label className="subtle">Account</label>

        <AccountSelect
          name="paymentSourceId"
          mode="filter"
          includeUnassigned
          value={accountValue}
          onChange={(v) => setAccountValue(v)}
          items={paymentSources}
          disabled={emptyState}
          loading={emptyState}
          maxWidth={360}
        />

        {emptyState ? (
          <div className="subtle" style={{ fontSize: 12 }}>
            Add your first transaction to unlock reporting.
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label className="subtle">Category</label>

        <CategorySelect
          name="categoryId"
          value={categoryValue}
          onChange={(v) => setCategoryValue(v)}
          items={categories}
          disabled={emptyState}
          maxWidth={360}
        />
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" type="submit" disabled={emptyState}>
          Apply
        </button>

        <Link className="btn" href={`/reports?month=${month}`} aria-disabled={emptyState}>
          Reset
        </Link>
      </div>
    </form>
  );
}
