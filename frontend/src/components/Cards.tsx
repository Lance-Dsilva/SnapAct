"use client";

import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  IconBookmark,
  IconCheck,
  IconChevronRight,
  IconExternal,
  IconMore,
  IconQuote,
} from "@/components/Icons";
import {
  cleanQuote,
  dateParts,
  intentStyle,
  isOverdue,
  monogram,
  relativeDay,
  savedAt,
  typeStyle,
} from "@/lib/labels";
import type { Memory, RetrievedMemory } from "@/types";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/* --------------------------------------------------------------- primitives */

export function SectionHeader({
  title,
  subtitle,
  Icon,
  tint,
  color,
  count,
  action,
}: {
  title: string;
  subtitle?: string;
  Icon: Icon;
  tint: string;
  color: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
        style={{ background: tint, color }}
      >
        <Icon className="h-[21px] w-[21px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--ink)]">
            {title}
          </h2>
          {count !== undefined ? (
            <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[12px] font-semibold text-[var(--muted)]">
              {count}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ViewAll({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="hidden shrink-0 items-center gap-1 rounded-full border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-medium text-[var(--ink-soft)] transition hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)] sm:flex"
    >
      View all
      <IconChevronRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function Thumb({
  memory,
  className = "",
}: {
  memory: Memory;
  className?: string;
}) {
  const style = typeStyle(memory.content_type);
  if (!memory.image_url) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-[var(--border)] ${className}`}
        style={{ background: style.tint, color: style.text }}
      >
        <style.Icon className="h-5 w-5" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={memory.image_url}
      alt=""
      loading="lazy"
      className={`thumb rounded-xl border border-[var(--border)] ${className}`}
    />
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink-soft)]">
      <span className="h-[6px] w-[6px] rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function IntentPill({ intent }: { intent: Memory["intent_mode"] }) {
  const style = intentStyle(intent);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${style.className}`}
    >
      <style.Icon className="h-3.5 w-3.5" />
      {style.label}
    </span>
  );
}

function DateBadge({
  ymd,
  tone,
}: {
  ymd: string;
  tone: "danger" | "neutral";
}) {
  const parts = dateParts(ymd);
  if (!parts) return null;
  const danger = tone === "danger";
  return (
    <div
      className={`flex w-[62px] shrink-0 flex-col items-center justify-center rounded-xl py-2 ${
        danger ? "bg-rose-50" : "bg-[var(--surface-soft)]"
      }`}
    >
      <span
        className={`text-[11px] font-bold uppercase tracking-wide ${
          danger ? "text-rose-600" : "text-indigo-600"
        }`}
      >
        {parts.month}
      </span>
      <span className="text-[22px] font-bold leading-none text-[var(--ink)]">{parts.day}</span>
      {parts.year !== new Date().getFullYear() ? (
        <span className="mt-0.5 text-[10px] font-medium text-[var(--muted-light)]">
          {parts.year}
        </span>
      ) : null}
    </div>
  );
}

function GhostButton({
  children,
  onClick,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 text-[13px] font-medium text-[var(--ink-soft)] transition hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)]";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

function SolidButton({
  children,
  onClick,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#1e293b]";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- row cards */

/**
 * The three digest rows share a shell: accent rail, thumbnail, body, actions.
 * Keeping it in one component is what makes the rhythm identical across sections.
 */
function RowCard({
  memory,
  accent,
  lead,
  pill,
  actions,
}: {
  memory: Memory;
  accent: string;
  lead?: ReactNode;
  pill: ReactNode;
  actions: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)] transition hover:shadow-[var(--shadow-md)]">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />
      <div className="flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-center">
        <Link href={`/memory/${memory.id}`} className="shrink-0">
          <Thumb memory={memory} className="h-[74px] w-[124px]" />
        </Link>

        {lead}

        <div className="min-w-0 flex-1">
          <Link
            href={`/memory/${memory.id}`}
            className="block truncate text-[15px] font-semibold text-[var(--ink)] transition hover:text-[var(--accent)]"
          >
            {memory.title}
          </Link>
          <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-[var(--muted)]">
            {memory.intent_summary || memory.description}
          </p>
          <div className="mt-2.5">{pill}</div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      </div>
    </div>
  );
}

export function DeadlineCard({
  memory,
  onDone,
}: {
  memory: Memory;
  onDone?: (id: string) => void;
}) {
  const overdue = isOverdue(memory.due_on);
  return (
    <RowCard
      memory={memory}
      accent="#f43f5e"
      lead={memory.due_on ? <DateBadge ymd={memory.due_on} tone="danger" /> : undefined}
      pill={
        <StatusPill
          label={overdue ? `Overdue · ${relativeDay(memory.due_on)}` : "Deadline"}
          color="#f43f5e"
        />
      }
      actions={
        onDone ? (
          <GhostButton onClick={() => onDone(memory.id)}>
            <IconCheck className="h-4 w-4" />
            Mark done
          </GhostButton>
        ) : null
      }
    />
  );
}

export function DecisionCard({
  memory,
  onDone,
}: {
  memory: Memory;
  onDone?: (id: string) => void;
}) {
  const action = memory.suggested_actions?.find((a) => a.url);
  const mark = monogram(memory.title);
  return (
    <RowCard
      memory={memory}
      accent="#6366f1"
      lead={
        <span
          className="hidden h-[58px] w-[58px] shrink-0 items-center justify-center rounded-2xl text-[15px] font-bold sm:flex"
          style={{ background: mark.bg, color: mark.fg }}
          aria-hidden
        >
          {mark.letters}
        </span>
      }
      pill={<StatusPill label="Decision needed" color="#6366f1" />}
      actions={
        <>
          {action?.url ? (
            <GhostButton href={action.url}>
              <IconExternal className="h-4 w-4" />
              {action.label?.trim() || "Open"}
            </GhostButton>
          ) : null}
          {onDone ? (
            <SolidButton onClick={() => onDone(memory.id)}>
              <IconCheck className="h-4 w-4" />
              Mark done
            </SolidButton>
          ) : null}
        </>
      }
    />
  );
}

export function UpcomingCard({ memory }: { memory: Memory }) {
  const event = (memory.event || {}) as Record<string, string>;
  const action = memory.suggested_actions?.find((a) => a.url);
  // Only render facts the memory actually carries — never invent attendance figures.
  const meta = [event.location, event.time].filter(Boolean).join(" · ");

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)] transition hover:shadow-[var(--shadow-md)]">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <Link href={`/memory/${memory.id}`} className="shrink-0">
          <Thumb memory={memory} className="h-[92px] w-[168px]" />
        </Link>

        {memory.event_on ? <DateBadge ymd={memory.event_on} tone="neutral" /> : null}

        <div className="min-w-0 flex-1">
          {meta ? (
            <p className="mb-1 truncate text-[12.5px] font-medium text-indigo-600">{meta}</p>
          ) : null}
          <Link
            href={`/memory/${memory.id}`}
            className="block truncate text-[15px] font-semibold text-[var(--ink)] transition hover:text-[var(--accent)]"
          >
            {memory.title}
          </Link>
          <p className="mt-1 line-clamp-2 text-[13.5px] leading-relaxed text-[var(--muted)]">
            {memory.description}
          </p>
          <div className="mt-2.5">
            <StatusPill
              label={memory.event_on ? relativeDay(memory.event_on) : "Event"}
              color="#3b82f6"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {action?.url ? (
            <SolidButton href={action.url}>
              {action.label?.trim() || "Open"}
              <IconChevronRight className="h-3.5 w-3.5" />
            </SolidButton>
          ) : (
            <SolidButton href={`/memory/${memory.id}`}>View</SolidButton>
          )}
          <button
            type="button"
            aria-label="Save for later"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--muted)] transition hover:text-[var(--ink)]"
          >
            <IconBookmark className="h-[17px] w-[17px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- quote hero */

export function QuoteHero({ memory }: { memory: Memory }) {
  const { text, attribution: parsed } = cleanQuote(
    memory.ocr_text || memory.description || memory.title,
  );
  const attribution = parsed || memory.entities?.[0]?.name;

  return (
    <Link
      href={`/memory/${memory.id}`}
      className="relative block overflow-hidden rounded-2xl border border-indigo-100/80 p-7"
      style={{ background: "linear-gradient(115deg, #f3f2ff 0%, #eef4ff 55%, #f5f3ff 100%)" }}
    >
      <IconQuote
        className="pointer-events-none absolute -right-2 bottom-0 h-28 w-28 text-white/70"
        aria-hidden
      />
      <div className="relative flex gap-5">
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/80 text-violet-600 shadow-sm sm:flex">
          <IconQuote className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="max-w-2xl text-[19px] font-medium italic leading-[1.5] tracking-[-0.01em] text-[var(--ink)] sm:text-[21px]">
            “{text}”
          </p>
          {attribution ? (
            <p className="mt-3 text-[14px] text-[var(--muted)]">— {attribution}</p>
          ) : null}
        </div>
        <span className="hidden h-fit shrink-0 items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-[12px] font-medium text-violet-700 shadow-sm sm:inline-flex">
          <IconQuote className="h-3 w-3" />
          Saved quote
        </span>
      </div>
    </Link>
  );
}

/* --------------------------------------------------------------- grid card */

export function MemoryCard({ memory }: { memory: Memory }) {
  const style = typeStyle(memory.content_type);
  const pending = memory.status === "pending";

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3">
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em]"
          style={{ color: style.text }}
        >
          <style.Icon className="h-3.5 w-3.5" />
          {pending ? "Reading…" : style.plural}
        </span>
        <Link
          href={`/memory/${memory.id}`}
          aria-label="Memory options"
          className="text-[var(--muted-light)] opacity-0 transition group-hover:opacity-100"
        >
          <IconMore className="h-4 w-4" />
        </Link>
      </div>

      <Link href={`/memory/${memory.id}`} className="block px-3.5">
        <Thumb memory={memory} className="aspect-[16/10] w-full" />
      </Link>

      <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-3">
        <Link
          href={`/memory/${memory.id}`}
          className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--ink)] transition hover:text-[var(--accent)]"
        >
          {pending ? memory.user_note || "Just saved" : memory.title}
        </Link>
        <p className="mt-1 text-[12px] text-[var(--muted-light)]">{savedAt(memory.created_at)}</p>

        <div className="mt-3 flex items-center justify-between pt-0.5">
          {pending ? (
            <span className="inline-flex animate-pulse items-center rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--muted)]">
              Analyzing
            </span>
          ) : (
            <IntentPill intent={memory.intent_mode} />
          )}
          <Link
            href={`/memory/${memory.id}`}
            aria-label={`Open ${memory.title}`}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--muted-light)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
          >
            <IconExternal className="h-[15px] w-[15px]" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ search result */

export function ResultCard({ memory }: { memory: RetrievedMemory }) {
  const style = typeStyle(memory.content_type);
  return (
    <Link
      href={`/memory/${memory.id}`}
      className="flex gap-3.5 rounded-2xl border border-[var(--border)] bg-white p-3.5 shadow-[var(--shadow)] transition hover:shadow-[var(--shadow-md)]"
    >
      <Thumb memory={memory} className="h-[66px] w-[100px] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.06em]"
            style={{ color: style.text }}
          >
            <style.Icon className="h-3 w-3" />
            {style.label}
          </span>
          {memory.relevance === "primary" ? (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
              Best match
            </span>
          ) : null}
        </div>
        <h3 className="mt-1 truncate text-[14px] font-semibold text-[var(--ink)]">
          {memory.title}
        </h3>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] text-[var(--muted)]">
          {memory.relevance_reason || memory.description}
        </p>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------- states */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-white/60 p-12 text-center">
      <p className="text-[15px] font-semibold text-[var(--ink)]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-[var(--muted)]">
        {body}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-3.5">
      <div className="h-3 w-20 rounded bg-[var(--surface-soft)]" />
      <div className="mt-3 aspect-[16/10] w-full animate-pulse rounded-xl bg-[var(--surface-soft)]" />
      <div className="mt-3 h-3.5 w-4/5 rounded bg-[var(--surface-soft)]" />
      <div className="mt-2 h-3 w-1/3 rounded bg-[var(--surface-soft)]" />
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
      <h3 className="text-[13px] font-semibold text-[var(--ink)]">Sources</h3>
      <ul className="mt-3 space-y-2">
        {citations.map((c) => (
          <li key={c.url}>
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-indigo-600 underline-offset-2 hover:underline"
            >
              {c.title || c.url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
