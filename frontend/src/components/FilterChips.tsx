"use client";

import { IconGrid } from "@/components/Icons";
import { TYPE_STYLES, typeStyle } from "@/lib/labels";
import type { ContentType } from "@/types";

/**
 * Category chips, ordered by how much the user actually has.
 *
 * The rail bleeds to the screen edges so chips scroll off naturally instead of
 * stopping at a gutter and looking clipped — the failure mode on a 375px screen,
 * where a fixed row can only ever show two and a half chips.
 */
export function FilterChips({
  active,
  counts,
  onChange,
}: {
  active: string;
  counts: Record<string, number>;
  onChange: (id: string) => void;
}) {
  const present = (Object.keys(TYPE_STYLES) as ContentType[])
    .filter((type) => (counts[type] ?? 0) > 0)
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="bleed relative">
      <div className="rail flex gap-2 overflow-x-auto pb-1">
        <Chip
          id="all"
          label="All"
          count={total}
          active={active === "all"}
          onChange={onChange}
          icon={<IconGrid className="h-[14px] w-[14px]" />}
        />
        {present.map((type) => {
          const style = typeStyle(type);
          return (
            <Chip
              key={type}
              id={type}
              label={style.plural}
              count={counts[type]}
              active={active === type}
              onChange={onChange}
              icon={<style.Icon className="h-[14px] w-[14px]" />}
            />
          );
        })}
        {/* Trailing spacer so the last chip clears the gutter. */}
        <span className="w-1 shrink-0" aria-hidden />
      </div>
    </div>
  );
}

function Chip({
  id,
  label,
  count,
  active,
  icon,
  onChange,
}: {
  id: string;
  label: string;
  count?: number;
  active: boolean;
  icon: React.ReactNode;
  onChange: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(id)}
      aria-pressed={active}
      className={`flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition active:scale-95 ${
        active
          ? "border-transparent bg-[var(--ink)] text-white"
          : "border-[var(--border)] bg-white text-[var(--ink-soft)]"
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 ? (
        <span
          className={`text-[11.5px] font-semibold ${active ? "text-white/60" : "text-[var(--muted-light)]"}`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
