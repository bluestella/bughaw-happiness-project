"use client";

import * as React from "react";
import { Combobox } from "@base-ui/react/combobox";
import { cn } from "@/lib/cn";
import type { TeamDirectoryEntry } from "@/lib/useTeamDirectory";

/**
 * Searchable dropdown for picking an existing teammate (from the invite
 * allowlist) instead of typing a raw email. Selecting an item calls
 * `onSelect` and clears the input — there's no free-text submission path.
 */
export function UserPicker({
  options,
  onSelect,
  placeholder = "Search teammates by email…",
  disabled,
}: {
  options: TeamDirectoryEntry[];
  onSelect: (email: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = React.useState("");

  return (
    <Combobox.Root<TeamDirectoryEntry>
      items={options}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
      itemToStringLabel={(entry) => entry.email}
      value={null}
      onValueChange={(entry) => {
        if (entry) {
          onSelect(entry.email);
          setInputValue("");
        }
      }}
      disabled={disabled}
    >
      <Combobox.Input
        placeholder={placeholder}
        className={cn(
          "w-full border border-line rounded-md px-2.5 py-2 text-[13px] focus:outline-none focus:border-coir focus:ring-2 focus:ring-coir/20 bg-white disabled:opacity-60"
        )}
      />
      <Combobox.Portal>
        <Combobox.Positioner className="z-50 outline-none" sideOffset={4}>
          <Combobox.Popup className="max-h-56 w-[var(--anchor-width)] overflow-y-auto rounded-md border border-line bg-white py-1 shadow-card">
            <Combobox.Empty className="px-2.5 py-2 text-[12px] text-ink-soft">
              No matching teammates.
            </Combobox.Empty>
            <Combobox.List>
              {(entry: TeamDirectoryEntry) => (
                <Combobox.Item
                  key={entry.email}
                  value={entry}
                  className="cursor-default px-2.5 py-1.5 text-[12px] text-ink outline-none data-[highlighted]:bg-paper"
                >
                  <p className="truncate">{entry.email}</p>
                  {entry.note && (
                    <p className="truncate text-[10px] text-ink-soft">{entry.note}</p>
                  )}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
