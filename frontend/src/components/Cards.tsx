"use client";

import Link from "next/link";
import type { AttentionItem, MemoryDetail } from "@/types";
import { intentColor, typeLabel } from "@/lib/labels";

export function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)] sm:text-2xl">
        {title}
      </h2>
      {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
    </div>
  );
}

export function AttentionCard({
  item,
  onDone,
}: {
  item: AttentionItem;
  onDone?: (id: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/memory/${item.memory_id}`}
            className="truncate font-medium text-[var(--ink)] hover:text-[var(--accent-dark)]"
          >
            {item.title}
          </Link>
          {item.intent_mode ? (
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${intentColor(item.intent_mode)}`}
            >
              {item.intent_mode}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">{item.reason}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link
          href={`/memory/${item.memory_id}`}
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] hover:bg-slate-50"
        >
          View
        </Link>
        {onDone ? (
          <button
            type="button"
            onClick={() => onDone(item.memory_id)}
            className="rounded-full bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
          >
            Done
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function EventCard({ item }: { item: AttentionItem }) {
  return (
    <Link
      href={`/memory/${item.memory_id}`}
      className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="aspect-[16/10] bg-[var(--surface-soft)]">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
            Event
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">
          Event
        </div>
        <h3 className="mt-1 font-medium text-[var(--ink)] group-hover:text-[var(--accent-dark)]">
          {item.title}
        </h3>
        <p className="mt-1 text-sm text-[var(--muted)]">{item.reason}</p>
        {item.suggested_action ? (
          <div className="mt-3 inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
            {item.suggested_action.label}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export function QuoteCard({ item }: { item: AttentionItem }) {
  return (
    <Link
      href={`/memory/${item.memory_id}`}
      className="block rounded-2xl border border-[var(--border)] bg-gradient-to-br from-white to-teal-50/60 p-5 shadow-[var(--shadow)]"
    >
      <p className="font-[family-name:var(--font-quote)] text-xl leading-snug text-[var(--ink)] sm:text-2xl">
        “{item.title}”
      </p>
      <p className="mt-3 text-xs uppercase tracking-[0.14em] text-teal-700">
        Saved quote
      </p>
    </Link>
  );
}

export function MemoryGridCard({ memory }: { memory: MemoryDetail }) {
  return (
    <Link
      href={`/memory/${memory.memory_id}`}
      className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="aspect-[4/3] bg-[var(--surface-soft)]">
        {memory.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={memory.image_url} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {typeLabel(memory.content_type)}
          </span>
          {memory.demo_seed ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              Demo seed
            </span>
          ) : null}
        </div>
        <h3 className="mt-1 line-clamp-2 text-sm font-medium text-[var(--ink)]">
          {memory.title}
        </h3>
        <span
          className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${intentColor(memory.intent_mode)}`}
        >
          {memory.intent_mode}
        </span>
      </div>
    </Link>
  );
}

export function CategoryPills({
  active,
  onChange,
}: {
  active: string;
  onChange: (id: string) => void;
}) {
  const cats = [
    { id: "all", label: "All" },
    { id: "event", label: "Events" },
    { id: "quote", label: "Quotes" },
    { id: "person_followup", label: "People" },
    { id: "place", label: "Places" },
    { id: "idea", label: "Ideas" },
    { id: "product", label: "Products" },
    { id: "knowledge", label: "Knowledge" },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {cats.map((c) => (
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
        </button>
      ))}
    </div>
  );
}

export function AgentSteps({
  steps,
  web,
  liveFailed,
}: {
  steps: string[];
  web?: boolean;
  liveFailed?: boolean;
}) {
  const researched =
    web || steps.some((s) => /research|search|web|external/i.test(s));
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
      <h3 className="text-sm font-semibold text-[var(--ink)]">Grok activity</h3>
      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step} className="flex items-start gap-2 text-sm text-[var(--ink)]">
            <span className="mt-0.5 text-teal-600">✓</span>
            <span>{step}</span>
          </li>
        ))}
      </ul>
      {researched ? (
        <p className="mt-3 text-xs font-medium text-teal-700">
          Current information checked · Web
        </p>
      ) : null}
      {liveFailed ? (
        <p className="mt-2 text-xs text-amber-700">
          Live verification is temporarily unavailable.
        </p>
      ) : null}
    </div>
  );
}

export function SourcesList({ citations }: { citations: { title?: string | null; url: string }[] }) {
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
