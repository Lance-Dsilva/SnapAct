"use client";

import Link from "next/link";
import type { ComponentType, ReactNode, SVGProps } from "react";
import {
  IconBookmark,
  IconCheck,
  IconChevronRight,
  IconExternal,
  IconQuote,
} from "@/components/Icons";
import {
  cleanQuote,
  dateParts,
  intentStyle,
  isOverdue,
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
  href,
  action,
}: {
  title: string;
  subtitle?: string;
  Icon: Icon;
  tint: string;
  color: string;
  count?: number;
  href?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 sm:rounded-2xl"
        style={{ background: tint, color }}
      >
        <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h2 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-[var(--ink)] sm:text-[17px]">
            {title}
          </h2>
          {count !== undefined ? (
            <span className="shrink-0 rounded-full bg-[var(--surface-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
              {count}
            </span>
          ) : null}
        </div>
        {/* Subtitles are context, not instruction — they go first on a narrow screen. */}
        {subtitle ? (
          <p className="mt-0.5 hidden truncate text-[12.5px] text-[var(--muted)] sm:block">
            {subtitle}
          </p>
        ) : null}
      </div>

      {action ??
        (href ? (
          <Link
            href={href}
            aria-label={`View all ${title.toLowerCase()}`}
            className="flex h-9 shrink-0 items-center gap-0.5 rounded-full px-2 text-[13px] font-medium text-[var(--muted)] active:bg-[var(--surface-soft)] sm:border sm:border-[var(--border)] sm:bg-white sm:px-3.5"
          >
            <span className="hidden sm:inline">View all</span>
            <IconChevronRight className="h-4 w-4" />
          </Link>
        ) : null)}
    </div>
  );
}

function Thumb({ memory, className = "" }: { memory: Memory; className?: string }) {
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
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink-soft)]">
      <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function IntentPill({ intent }: { intent: Memory["intent_mode"] }) {
  const style = intentStyle(intent);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ${style.className}`}
    >
      <style.Icon className="h-3 w-3" />
      {style.label}
    </span>
  );
}

/** Compact date marker. The stacked block needs width, so it waits for a tablet. */
function DateChip({ ymd, danger }: { ymd: string; danger?: boolean }) {
  const parts = dateParts(ymd);
  if (!parts) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-lg px-2 py-1 text-[11.5px] font-bold uppercase tracking-wide ${
        danger ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"
      }`}
    >
      {parts.month} {parts.day}
    </span>
  );
}

function DateBlock({ ymd, danger }: { ymd: string; danger?: boolean }) {
  const parts = dateParts(ymd);
  if (!parts) return null;
  return (
    <div
      className={`hidden w-[60px] shrink-0 flex-col items-center justify-center rounded-xl py-2 sm:flex ${
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
      <span className="text-[21px] font-bold leading-none text-[var(--ink)]">{parts.day}</span>
      {parts.year !== new Date().getFullYear() ? (
        <span className="mt-0.5 text-[10px] font-medium text-[var(--muted-light)]">
          {parts.year}
        </span>
      ) : null}
    </div>
  );
}

/* Buttons: 44px minimum height so they are reliably tappable. */
const BTN_BASE =
  "inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl px-3.5 text-[13px] font-medium transition active:scale-[0.98]";

function GhostButton({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const className = `${BTN_BASE} border border-[var(--border)] bg-white text-[var(--ink-soft)]`;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

function SolidButton({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const className = `${BTN_BASE} bg-[var(--ink)] text-white`;
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- row cards */

/**
 * Shared shell for the three digest rows.
 *
 * On a phone this is a two-tier card — media and text on top, controls beneath —
 * because a 375px line cannot hold a thumbnail, a title, a date and two buttons
 * without every one of them truncating. From `sm` up it relaxes into one row.
 */
function RowCard({
  memory,
  accent,
  dateYmd,
  danger,
  pill,
  actions,
}: {
  memory: Memory;
  accent: string;
  dateYmd?: string | null;
  danger?: boolean;
  pill: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} />

      <div className="p-3 pl-4 sm:flex sm:items-center sm:gap-4 sm:p-4 sm:pl-5">
        <div className="flex gap-3 sm:contents">
          <Link href={`/memory/${memory.id}`} className="shrink-0">
            <Thumb memory={memory} className="h-[60px] w-[60px] sm:h-[72px] sm:w-[116px]" />
          </Link>

          {dateYmd ? <DateBlock ymd={dateYmd} danger={danger} /> : null}

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <Link
                href={`/memory/${memory.id}`}
                className="line-clamp-2 flex-1 text-[14.5px] font-semibold leading-snug text-[var(--ink)] sm:truncate sm:text-[15px]"
              >
                {memory.title}
              </Link>
              {dateYmd ? (
                <span className="sm:hidden">
                  <DateChip ymd={dateYmd} danger={danger} />
                </span>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[var(--muted)]">
              {memory.intent_summary || memory.description}
            </p>
            <div className="mt-2 hidden sm:block">{pill}</div>
          </div>
        </div>

        {/* Controls get their own tier on a phone; inline from sm up. A pill and
            two buttons cannot share 360px, so the pill takes its own line and
            the buttons split the width evenly. */}
        <div className="mt-3 sm:mt-0 sm:shrink-0">
          <div className="sm:hidden">{pill}</div>
          {actions ? (
            <div className="mt-2 flex gap-2 sm:mt-0 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function DeadlineCard({ memory, onDone }: { memory: Memory; onDone?: (id: string) => void }) {
  const overdue = isOverdue(memory.due_on);
  return (
    <RowCard
      memory={memory}
      accent="#f43f5e"
      dateYmd={memory.due_on}
      danger
      pill={<StatusPill label={overdue ? `Overdue ${relativeDay(memory.due_on)}` : "Deadline"} color="#f43f5e" />}
      actions={
        onDone ? (
          <GhostButton onClick={() => onDone(memory.id)}>
            <IconCheck className="h-4 w-4" />
            Done
          </GhostButton>
        ) : null
      }
    />
  );
}

export function DecisionCard({ memory, onDone }: { memory: Memory; onDone?: (id: string) => void }) {
  const action = memory.suggested_actions?.find((a) => a.url);
  return (
    <RowCard
      memory={memory}
      accent="#6366f1"
      pill={<StatusPill label="Decision needed" color="#6366f1" />}
      actions={
        <>
          {action?.url ? (
            <GhostButton href={action.url}>
              <IconExternal className="h-4 w-4" />
              <span className="max-w-[120px] truncate sm:max-w-none">
                {action.label?.trim() || "Open"}
              </span>
            </GhostButton>
          ) : null}
          {onDone ? (
            <SolidButton onClick={() => onDone(memory.id)}>
              <IconCheck className="h-4 w-4" />
              Done
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
  const meta = [event.location, event.time].filter(Boolean).join(" · ");

  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
      <div className="p-3 sm:flex sm:items-center sm:gap-4 sm:p-4">
        <div className="flex gap-3 sm:contents">
          <Link href={`/memory/${memory.id}`} className="shrink-0">
            <Thumb memory={memory} className="h-[60px] w-[60px] sm:h-[84px] sm:w-[150px]" />
          </Link>

          {memory.event_on ? <DateBlock ymd={memory.event_on} /> : null}

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <Link
                href={`/memory/${memory.id}`}
                className="line-clamp-2 flex-1 text-[14.5px] font-semibold leading-snug text-[var(--ink)] sm:truncate sm:text-[15px]"
              >
                {memory.title}
              </Link>
              {memory.event_on ? (
                <span className="sm:hidden">
                  <DateChip ymd={memory.event_on} />
                </span>
              ) : null}
            </div>
            {meta ? (
              <p className="mt-1 line-clamp-1 text-[12.5px] font-medium text-indigo-600">{meta}</p>
            ) : null}
            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[var(--muted)]">
              {memory.description}
            </p>
          </div>
        </div>

        <div className="mt-3 sm:mt-0 sm:shrink-0">
          <div className="sm:hidden">
            <StatusPill label={memory.event_on ? relativeDay(memory.event_on) : "Event"} color="#3b82f6" />
          </div>
          <div className="mt-2 flex items-center gap-2 sm:mt-0 [&>a]:flex-1 sm:[&>a]:flex-none">
            <SolidButton href={action?.url || `/memory/${memory.id}`}>
              <span className="truncate">{action?.label?.trim() || "View"}</span>
              <IconChevronRight className="h-3.5 w-3.5 shrink-0" />
            </SolidButton>
            <button
              type="button"
              aria-label="Save for later"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-white text-[var(--muted)]"
            >
              <IconBookmark className="h-[17px] w-[17px]" />
            </button>
          </div>
        </div>
      </div>
    </article>
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
      className="relative block overflow-hidden rounded-2xl border border-indigo-100/80 p-5 sm:p-7"
      style={{ background: "linear-gradient(115deg, #f3f2ff 0%, #eef4ff 55%, #f5f3ff 100%)" }}
    >
      <IconQuote
        className="pointer-events-none absolute -right-3 bottom-0 h-20 w-20 text-white/70 sm:h-28 sm:w-28"
        aria-hidden
      />
      <div className="relative">
        <p className="max-w-2xl text-[16.5px] font-medium italic leading-[1.5] tracking-[-0.01em] text-[var(--ink)] sm:text-[20px]">
          “{text}”
        </p>
        <div className="mt-3 flex items-center gap-2">
          {attribution ? (
            <p className="text-[13px] text-[var(--muted)]">— {attribution}</p>
          ) : null}
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1 text-[11.5px] font-medium text-violet-700">
            <IconQuote className="h-3 w-3" />
            Saved quote
          </span>
        </div>
      </div>
    </Link>
  );
}

/* --------------------------------------------------------------- grid card */

export function MemoryCard({ memory }: { memory: Memory }) {
  const style = typeStyle(memory.content_type);
  const pending = memory.status === "pending";

  return (
    <Link
      href={`/memory/${memory.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-sm)] transition active:scale-[0.98]"
    >
      <div className="px-2.5 pb-1.5 pt-2.5">
        <span
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.05em]"
          style={{ color: style.text }}
        >
          <style.Icon className="h-3 w-3" />
          {pending ? "Reading…" : style.plural}
        </span>
      </div>

      <div className="px-2.5">
        <Thumb memory={memory} className="aspect-[4/3] w-full" />
      </div>

      <div className="flex flex-1 flex-col px-2.5 pb-2.5 pt-2">
        <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--ink)]">
          {pending ? memory.user_note || "Just saved" : memory.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-[var(--muted-light)]">{savedAt(memory.created_at)}</p>
        <div className="mt-2">
          {pending ? (
            <span className="inline-flex animate-pulse items-center rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--muted)]">
              Analyzing
            </span>
          ) : (
            <IntentPill intent={memory.intent_mode} />
          )}
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------ search result */

export function ResultCard({ memory }: { memory: RetrievedMemory }) {
  const style = typeStyle(memory.content_type);
  return (
    <Link
      href={`/memory/${memory.id}`}
      className="flex gap-3 rounded-2xl border border-[var(--border)] bg-white p-3 shadow-[var(--shadow-sm)] active:scale-[0.99]"
    >
      <Thumb memory={memory} className="h-[58px] w-[58px] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.05em]"
            style={{ color: style.text }}
          >
            <style.Icon className="h-3 w-3" />
            {style.label}
          </span>
          {memory.relevance === "primary" ? (
            <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
              Best match
            </span>
          ) : null}
        </div>
        <h3 className="mt-0.5 line-clamp-1 text-[13.5px] font-semibold text-[var(--ink)]">
          {memory.title}
        </h3>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[var(--muted)]">
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
    <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-white/60 px-6 py-10 text-center">
      <p className="text-[15px] font-semibold text-[var(--ink)]">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-[var(--muted)]">
        {body}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-2.5">
      <div className="h-2.5 w-16 rounded bg-[var(--surface-soft)]" />
      <div className="mt-2 aspect-[4/3] w-full animate-pulse rounded-xl bg-[var(--surface-soft)]" />
      <div className="mt-2 h-3 w-4/5 rounded bg-[var(--surface-soft)]" />
      <div className="mt-1.5 h-2.5 w-1/3 rounded bg-[var(--surface-soft)]" />
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
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-sm)]">
      <h3 className="text-[13px] font-semibold text-[var(--ink)]">Sources</h3>
      <ul className="mt-3 space-y-2">
        {citations.map((c) => (
          <li key={c.url}>
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-indigo-600 underline-offset-2"
            >
              {c.title || c.url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
