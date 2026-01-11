"use client";

import * as React from "react";
import { AccountSelect } from "@/components/AccountSelect";

type Item = { id: string; name: string };

export function DefaultAccountSelect({
  items,
  initialDefaultId,
}: {
  items: Item[];
  initialDefaultId: string | null;
}) {
  const [value, setValue] = React.useState<string>(initialDefaultId ?? "");

  return (
    <form
      method="POST"
      action="/api/user/preferences"
      style={{ display: "grid", gap: 10, maxWidth: 420 }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <label className="subtle">Default account for Transactions</label>

        <AccountSelect
          name="defaultTransactionsPaymentSourceId"
          mode="transaction"
          value={value}
          onChange={setValue}
          items={items}
          maxWidth={420}
        />

        <div className="subtle" style={{ fontSize: 12 }}>
          This will pre-select the Account field when you return to Transactions.
        </div>
      </div>

      <button className="btn btn-ghost" type="submit">
        Save default
      </button>
    </form>
  );
}
