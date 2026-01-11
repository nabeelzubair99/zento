"use client";

import * as React from "react";
import * as Select from "@radix-ui/react-select";

type Item = { id: string; name: string };

const ALL_VALUE = "__all__";
const UNCATEGORIZED_VALUE = "__uncategorized__";

export function CategorySelect({
  value,
  onChange,
  items,
  disabled,
  loading,
  maxWidth = 360,
}: {
  value: string; // "" (all) | "uncategorized" | real id
  onChange: (v: string) => void;
  items: Item[];
  disabled?: boolean;
  loading?: boolean;
  maxWidth?: number;
}) {
  const radixValue =
    value === "" ? ALL_VALUE : value === "uncategorized" ? UNCATEGORIZED_VALUE : value;

  return (
    <Select.Root
      value={radixValue}
      onValueChange={(v) => {
        if (v === ALL_VALUE) return onChange("");
        if (v === UNCATEGORIZED_VALUE) return onChange("uncategorized");
        onChange(v);
      }}
      disabled={disabled}
    >
      <Select.Trigger className="accSelectTrigger" style={{ maxWidth }}>
        <Select.Value placeholder={loading ? "Loading…" : "All categories"} />
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
            <Select.Item value={ALL_VALUE} className="accSelectItem">
              <Select.ItemText>All categories</Select.ItemText>
            </Select.Item>

            <Select.Item value={UNCATEGORIZED_VALUE} className="accSelectItem">
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
  );
}
