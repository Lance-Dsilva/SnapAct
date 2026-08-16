"use client";

import Link from "next/link";
import { CATEGORIES, intentColor, relativeDay, typeLabel, urgencyColor } from "@/lib/labels";
import type { Memory, RetrievedMemory } from "@/types";

export function SectionTitle({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle?: string;
  count?: number;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-xl text-[var(--ink)] sm:text-2xl">{title}</h2>
        {count !== undefined ? (
          <span className="text-sm text-[var(--muted)]">{count}</span>
        ) : null}
      </div>
      {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
    </div>
  );
}

function Thumb({ memory, className }: { memory: Memory; className?: string }) {
  if (!memory.image_url) {
    return (
      <div className={`flex items-center justify-center bg-[var(--surface-soft)] ${className}`}>
        <span className="text-xs text-[var(--muted)]">{typeLabel(memory.content_type)}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={memory.image_url} alt="" loading="lazy" className={`object-cover ${className}`} />
  );
}

/** A memory that needs doing, with its deadline and its one real action. */
export function ActionCard({
  memory,
  onDone,
}: {
  memory: Memory;
  onDone?: (id: string) => void;
}) {
  const action = memory.suggested_actions?.[0];
  const when = memory.due_on || memory.event_on;
  const overdue = Boolean(
    memory.due_on && memory.due_on < new Date().toISOString().slice(0, 10),
  );

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
      <Link href={`/memory/${memory.id}`} className="shrink-0">
        <Thumb memory={memory} className="h-14 w-14 rounded-xl" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/memory/${memory.id}`}
            className="truncate font-medium text-[var(--ink)] hover:text-[var(--accent-dark)]"
          >
            {memory.title}
          </Link>
          {when ? (
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                overdue ? "border-rose-200 bg-rose-50 text-rose-700" : urgencyColor(memory.urgency)
              }`}
            >
              {overdue ? "Overdue " : ""}
              {relativeDay(when)}
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">
          {memory.intent_summary || memory.description}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {action?.url ? (
            <a
              href={action.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-white"
            >
              {action.label}
            </a>
          ) : null}
          {onDone ? (
            <button
              type="button"
              onClick={() => onDone(memory.id)}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-slate-50"
            >
              Mark done
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EventCard({ memory }: { memory: Memory }) {
  const event = (memory.event || {}) as Record<string, string>;
  return (
    <Link
      href={`/memory/${memory.id}`}
      className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <Thumb memory={memory} className="aspect-[16/10] w-full" />
      <div className="p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">
          {memory.event_on ? relativeDay(memory.event_on) : "Event"}
        </div>
        <h3 className="mt-1 line-clamp-2 font-medium text-[var(--ink)] group-hover:text-[var(--accent-dark)]">
          {memory.title}
        </h3>
        {event.location ? (
          <p className="mt-1 truncate text-sm text-[var(--muted)]">{event.location}</p>
        ) : null}
      </div>
    </Link>
  );
}

export function QuoteCard({ memory }: { memory: Memory }) {
  // The quote text itself is the OCR, not the generated title.
  const text = memory.ocr_text?.trim() || memory.title;
  return (
    <Link
      href={`/memory/${memory.id}`}
      className="block rounded-2xl border border-[var(--border)] bg-gradient-to-br from-white to-teal-50/60 p-5 shadow-[var(--shadow)]"
    >
      <p className="line-clamp-4 text-lg leading-snug text-[var(--ink)]">“{text}”</p>
      <p className="mt-3 text-xs uppercase tracking-[0.14em] text-teal-700">Saved quote</p>
    </Link>
  );
}

export function MemoryGridCard({ memory }: { memory: Memory }) {
  return (
    <Link
      href={`/memory/${memory.id}`}
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <Thumb memory={memory} className="aspect-[4/3] w-full" />
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {memory.status === "pending" ? "Reading…" : typeLabel(memory.content_type)}
          </span>
          {memory.status === "failed" ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              Needs retry
            </span>
          ) : null}
        </div>
        <h3 className="mt-1 line-clamp-2 text-sm font-medium text-[var(--ink)]">
          {memory.status === "pending" ? memory.user_note || "Just saved" : memory.title}
        </h3>
        {memory.status === "pending" ? (
          <span className="mt-2 inline-flex animate-pulse rounded-full border border-[var(--border)] bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            Analyzing
          </span>
        ) : (
          <span
            className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${intentColor(memory.intent_mode)}`}
          >
            {memory.intent_mode}
          </span>
        )}
      </div>
    </Link>
  );
}

/** Search / Ask result, showing why it matched. */
export function ResultCard({ memory }: { memory: RetrievedMemory }) {
  return (
    <Link
      href={`/memory/${memory.id}`}
      className="flex gap-3 rounded-2xl border border-[var(--border)] bg-white p-3 shadow-[var(--shadow)] transition hover:shadow-md"
    >
      <Thumb memory={memory} className="h-16 w-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {typeLabel(memory.content_type)}
          </span>
          {memory.relevance === "primary" ? (
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-800">
              Best match
            </span>
          ) : null}
        </div>
        <h3 className="mt-0.5 truncate text-sm font-medium text-[var(--ink)]">{memory.title}</h3>
        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">
          {memory.relevance_reason || memory.description}
        </p>
      </div>
    </Link>
  );
}

export function CategoryPills({
  active,
  counts,
  onChange,
}: {
  active: string;
  counts?: Record<string, number>;
  onChange: (id: string) => void;
}) {
  // Only show a category the user actually has something in.
  const visible = CATEGORIES.filter((c) => c.id === "all" || (counts?.[c.id] ?? 0) > 0);
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {visible.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition ${
            active === c.id
              ? "bg-[var(--ink)] text-white"
              : "border border-[var(--border)] bg-white text-[var(--muted)] hover:text-[var(--ink)]"
          }`}
        >
          {c.label}
          {c.id !== "all" && counts?.[c.id] ? (
            <span className="ml-1.5 text-[11px] opacity-60">{counts[c.id]}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function SourcesList({
  citations,
}: {
  citations?: Array<{ title?: string | null; url: string }> | null;
}) {
  if (!citations?.length) return null;
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
      <h3 className="text-sm font-semibold text-[var(--ink)]">Sources</h3>
      <ul className="mt-3 space-y-2">
        {citations.map((c) => (
          <li key={c.url}>
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-teal-700 underline-offset-2 hover:underline"
            >
              {c.title || c.url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-soft)] p-8 text-center">
      <p className="font-medium text-[var(--ink)]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">{body}</p>
    </div>
  );
}
