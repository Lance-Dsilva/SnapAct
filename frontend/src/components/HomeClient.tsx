"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CardSkeleton,
  DeadlineCard,
  DecisionCard,
  EmptyState,
  MemoryCard,
  QuoteHero,
  SectionHeader,
  UpcomingCard,
  ViewAll,
} from "@/components/Cards";
import { FilterChips } from "@/components/FilterChips";
import { Header } from "@/components/Header";
import {
  IconCalendar,
  IconChevronDown,
  IconClock,
  IconFilter,
  IconGrid,
  IconHelp,
  IconList,
  IconPlus,
  IconSparkle,
} from "@/components/Icons";
import {
  fetchDigest,
  fetchStalledCount,
  listMemories,
  repairStalled,
  setMemoryCompleted,
} from "@/lib/api";
import { typeStyle } from "@/lib/labels";
import type { Digest, Memory } from "@/types";

type Sort = "newest" | "oldest";

export default function HomeClient() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [category, setCategory] = useState("all");
  const [browsing, setBrowsing] = useState<{ category: string; items: Memory[] } | null>(null);
  const [sort, setSort] = useState<Sort>("newest");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(0);

  // Nothing is written to state before the first await, so mounting this effect
  // does not trigger a synchronous cascading render.
  const load = useCallback(async () => {
    try {
      const [data, repair] = await Promise.all([
        fetchDigest(),
        fetchStalledCount().catch(() => 0),
      ]);
      setDigest(data);
      setStalled(repair);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your screenshots");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // `load` awaits before writing any state, so nothing cascades on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Browsing a category is a plain filtered query, not a re-derivation of the feed.
  // Results are tagged with the category they belong to, so "all" needs no reset
  // and the effect never writes state synchronously.
  useEffect(() => {
    if (category === "all") return;
    let cancelled = false;

    async function fetchCategory() {
      try {
        const data = await listMemories({ contentType: category, limit: 60 });
        if (!cancelled) setBrowsing({ category, items: data.memories });
      } catch {
        if (!cancelled) setBrowsing({ category, items: [] });
      }
    }

    void fetchCategory();
    return () => {
      cancelled = true;
    };
  }, [category]);

  async function markDone(id: string) {
    setDigest((current) =>
      current
        ? {
            ...current,
            due_soon: current.due_soon.filter((m) => m.id !== id),
            needs_attention: current.needs_attention.filter((m) => m.id !== id),
          }
        : current,
    );
    await setMemoryCompleted(id, true).catch(() => void load());
  }

  async function retryFailed() {
    await repairStalled(10).catch(() => null);
    await load();
  }

  const shown = useMemo(() => {
    const items =
      category === "all"
        ? digest?.recent ?? []
        : browsing?.category === category
          ? browsing.items
          : [];
    const sorted = [...items].sort((a, b) =>
      sort === "newest"
        ? b.created_at.localeCompare(a.created_at)
        : a.created_at.localeCompare(b.created_at),
    );
    return sorted;
  }, [browsing, category, digest, sort]);

  const featuredQuote = useMemo(
    () => digest?.recent.find((m) => m.content_type === "quote" && m.ocr_text),
    [digest],
  );

  if (loading) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-[1360px] px-5 py-7 sm:px-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-[1360px] px-5 py-16 sm:px-8">
          <EmptyState
            title="SnapAct could not load your screenshots"
            body={error}
            action={
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-xl bg-[var(--ink)] px-5 py-2.5 text-[13px] font-medium text-white"
              >
                Try again
              </button>
            }
          />
        </main>
      </>
    );
  }

  const d = digest!;
  const browsingStyle = category !== "all" ? typeStyle(category) : null;

  return (
    <>
      <Header />

      <main className="mx-auto max-w-[1360px] px-5 pb-28 pt-6 sm:px-8">
        <FilterChips active={category} counts={d.counts} onChange={setCategory} />

        {stalled > 0 ? (
          <button
            type="button"
            onClick={() => void retryFailed()}
            className="mt-5 flex w-full items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-left text-[13.5px] text-amber-900 transition hover:bg-amber-50"
          >
            <span className="font-medium">
              {stalled} screenshot{stalled === 1 ? "" : "s"} couldn&apos;t be read.
            </span>
            <span className="text-amber-700 underline underline-offset-2">Retry now</span>
          </button>
        ) : null}

        {d.total === 0 ? (
          <div className="mt-10">
            <EmptyState
              title="Nothing saved yet"
              body="Share a screenshot from your iPhone Shortcut, or upload one here. SnapAct reads it, works out what it is, and files it so you can find it later."
              action={
                <Link
                  href="/upload"
                  className="rounded-xl bg-[var(--ink)] px-5 py-2.5 text-[13px] font-medium text-white"
                >
                  Upload a screenshot
                </Link>
              }
            />
          </div>
        ) : browsingStyle ? (
          /* ------------------------------------------------ single category */
          <section className="mt-8 rise">
            <SectionHeader
              title={browsingStyle.plural}
              subtitle={`Everything filed as ${browsingStyle.label.toLowerCase()}`}
              Icon={browsingStyle.Icon}
              tint={browsingStyle.tint}
              color={browsingStyle.text}
              count={shown.length}
              action={<LayoutControls sort={sort} setSort={setSort} layout={layout} setLayout={setLayout} />}
            />
            <MemoryGrid items={shown} layout={layout} />
          </section>
        ) : (
          <>
            {d.due_soon.length ? (
              <section className="mt-8 rise">
                <SectionHeader
                  title="Deadlines"
                  subtitle={
                    d.overdue_count
                      ? `${d.overdue_count} already past due`
                      : "Coming up in the next two weeks"
                  }
                  Icon={IconClock}
                  tint="#eff4ff"
                  color="#2563eb"
                  action={<ViewAll href="/ask?q=what%20deadlines%20do%20I%20have" />}
                />
                <div className="space-y-3">
                  {d.due_soon.slice(0, 4).map((memory) => (
                    <DeadlineCard key={memory.id} memory={memory} onDone={markDone} />
                  ))}
                </div>
              </section>
            ) : null}

            {d.needs_attention.length ? (
              <section className="mt-9 rise">
                <SectionHeader
                  title="Needs a decision"
                  subtitle="You saved these meaning to do something about them"
                  Icon={IconHelp}
                  tint="#eef2ff"
                  color="#4f46e5"
                  action={<ViewAll href="/ask?q=what%20should%20I%20act%20on" />}
                />
                <div className="space-y-3">
                  {d.needs_attention.slice(0, 4).map((memory) => (
                    <DecisionCard key={memory.id} memory={memory} onDone={markDone} />
                  ))}
                </div>
              </section>
            ) : null}

            {d.upcoming_events.length ? (
              <section className="mt-9 rise">
                <SectionHeader
                  title="Upcoming"
                  subtitle="Events still ahead"
                  Icon={IconCalendar}
                  tint="#eff4ff"
                  color="#2563eb"
                  action={<ViewAll href="/ask?q=what%20events%20have%20I%20saved" />}
                />
                <div className="space-y-3">
                  {d.upcoming_events.slice(0, 4).map((memory) => (
                    <UpcomingCard key={memory.id} memory={memory} />
                  ))}
                </div>
              </section>
            ) : null}

            {featuredQuote ? (
              <section className="mt-9 rise">
                <SectionHeader
                  title="Worth reading"
                  subtitle="A saved quote you might revisit"
                  Icon={IconSparkle}
                  tint="#f6f3ff"
                  color="#7c3aed"
                />
                <QuoteHero memory={featuredQuote} />
              </section>
            ) : null}

            <section className="mt-9 rise">
              <SectionHeader
                title="Everything"
                subtitle="All your memories, organized by SnapAct"
                Icon={IconGrid}
                tint="#eff4ff"
                color="#2563eb"
                count={d.total}
                action={
                  <LayoutControls sort={sort} setSort={setSort} layout={layout} setLayout={setLayout} />
                }
              />
              <MemoryGrid items={shown} layout={layout} />
            </section>
          </>
        )}
      </main>

      <Link
        href="/upload"
        aria-label="Add a screenshot"
        className="fixed bottom-7 right-7 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[var(--shadow-lg)] transition hover:scale-105"
        style={{ background: "var(--gradient)" }}
      >
        <IconPlus className="h-6 w-6" />
      </Link>
    </>
  );
}

function MemoryGrid({ items, layout }: { items: Memory[]; layout: "grid" | "list" }) {
  if (!items.length) {
    return (
      <EmptyState title="Nothing here yet" body="Nothing you've saved falls into this category." />
    );
  }
  return (
    <div
      className={
        layout === "grid"
          ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : "grid grid-cols-1 gap-3 lg:grid-cols-2"
      }
    >
      {items.map((memory) => (
        <MemoryCard key={memory.id} memory={memory} />
      ))}
    </div>
  );
}

function LayoutControls({
  sort,
  setSort,
  layout,
  setLayout,
}: {
  sort: Sort;
  setSort: (s: Sort) => void;
  layout: "grid" | "list";
  setLayout: (l: "grid" | "list") => void;
}) {
  return (
    <div className="hidden shrink-0 items-center gap-2 sm:flex">
      <button
        type="button"
        onClick={() => setSort(sort === "newest" ? "oldest" : "newest")}
        className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-medium text-[var(--ink-soft)] transition hover:border-[var(--border-strong)]"
      >
        <span className="text-[var(--muted)]">Sort:</span>
        {sort === "newest" ? "Newest" : "Oldest"}
        <IconChevronDown className="h-3.5 w-3.5 text-[var(--muted)]" />
      </button>

      <div className="flex items-center rounded-full border border-[var(--border)] bg-white p-0.5">
        {(["grid", "list"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setLayout(mode)}
            aria-label={`${mode} view`}
            aria-pressed={layout === mode}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
              layout === mode
                ? "bg-[var(--surface-soft)] text-[var(--ink)]"
                : "text-[var(--muted-light)] hover:text-[var(--ink)]"
            }`}
          >
            {mode === "grid" ? (
              <IconGrid className="h-[15px] w-[15px]" />
            ) : (
              <IconList className="h-[15px] w-[15px]" />
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3.5 py-2 text-[13px] font-medium text-[var(--ink-soft)] transition hover:border-[var(--border-strong)]"
      >
        <IconFilter className="h-[15px] w-[15px] text-[var(--muted)]" />
        Filter
      </button>
    </div>
  );
}
