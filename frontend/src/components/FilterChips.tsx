"use client";

import { IconGrid } from "@/components/Icons";
import { TYPE_STYLES, typeStyle } from "@/lib/labels";
import type { ContentType } from "@/types";

/**
 * Category chips, ordered by how much the user actually has. Only types with
 * something in them appear — an empty category is noise, not navigation.
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
    <div className="scroll-x flex gap-2 overflow-x-auto pb-1">
      <Chip
        id="all"
        label="All"
        count={total}
        active={active === "all"}
        onChange={onChange}
        icon={<IconGrid className="h-[15px] w-[15px]" />}
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
            icon={<style.Icon className="h-[15px] w-[15px]" />}
          />
        );
      })}
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
      className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition ${
        active
          ? "border-transparent bg-[var(--ink)] text-white shadow-[var(--shadow-md)]"
          : "border-[var(--border)] bg-white text-[var(--ink-soft)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]"
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 ? (
        <span
          className={`text-[12px] font-semibold ${active ? "text-white/60" : "text-[var(--muted-light)]"}`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
