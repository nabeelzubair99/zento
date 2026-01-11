"use client";

import * as React from "react";
import * as Select from "@radix-ui/react-select";

type Item = { id: string; name: string };

const NONE_VALUE = "__none__"; // transaction mode: maps to ""
const ALL_VALUE = "__all__"; // filter mode: maps to ""
const UNASSIGNED_VALUE = "__unassigned__"; // filter mode: maps to "unassigned"

export function AccountSelect({
  /** If provided, a hidden <input> will be rendered for form submission */
  name,

  /** transaction mode: "" = no account | filter mode: "" = all, "unassigned" = unassigned */
  value,
  onChange,

  items,
  disabled,
  loading,
  maxWidth = 360,

  mode = "transaction",
  includeUnassigned = false,
}: {
  name?: string;

  value: string;
  onChange: (v: string) => void;

  items: Item[];
  disabled?: boolean;
  loading?: boolean;
  maxWidth?: number;

  mode?: "transaction" | "filter";
  includeUnassigned?: boolean;
}) {
  // external -> radix internal
  const radixValue = React.useMemo(() => {
    if (mode === "filter") {
      if (value === "") return ALL_VALUE;
      if (value === "unassigned") return UNASSIGNED_VALUE;
      return value;
    }
    return value === "" ? NONE_VALUE : value;
  }, [mode, value]);

  const placeholder =
    mode === "filter"
      ? loading
        ? "Loading…"
        : "All accounts"
      : loading
        ? "Loading…"
        : "No account";

  // radix internal -> external
  const handleValueChange = (v: string) => {
    if (mode === "filter") {
      if (v === ALL_VALUE) return onChange("");
      if (v === UNASSIGNED_VALUE) return onChange("unassigned");
      return onChange(v);
    }
    return onChange(v === NONE_VALUE ? "" : v);
  };

  return (
    <div style={{ maxWidth }}>
      {/* ✅ Works everywhere (instead of Select.HiddenSelect) */}
      {name ? <input type="hidden" name={name} value={value} /> : null}

      <Select.Root value={radixValue} onValueChange={handleValueChange} disabled={disabled}>
        <Select.Trigger className="accSelectTrigger">
          <Select.Value placeholder={placeholder} />
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
              {mode === "filter" ? (
                <>
                  <Select.Item value={ALL_VALUE} className="accSelectItem">
                    <Select.ItemText>All accounts</Select.ItemText>
                  </Select.Item>

                  {includeUnassigned ? (
                    <Select.Item value={UNASSIGNED_VALUE} className="accSelectItem">
                      <Select.ItemText>Unassigned</Select.ItemText>
                    </Select.Item>
                  ) : null}
                </>
              ) : (
                <Select.Item value={NONE_VALUE} className="accSelectItem">
                  <Select.ItemText>No account</Select.ItemText>
                </Select.Item>
              )}

              {items.length ? <div className="accSelectLabel">Accounts</div> : null}

              {items.map((p) => (
                <Select.Item key={p.id} value={p.id} className="accSelectItem">
                  <Select.ItemText>{p.name}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
