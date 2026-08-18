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
} from "@/components/Cards";
import { FilterChips } from "@/components/FilterChips";
import { IconCalendar, IconClock, IconGrid, IconHelp, IconSparkle } from "@/components/Icons";
import { Content, Page, TopBar } from "@/components/Shell";
import {
  fetchDigest,
  fetchStalledCount,
  listMemories,
  repairStalled,
  setMemoryCompleted,
} from "@/lib/api";
import { typeStyle } from "@/lib/labels";
import type { Digest, Memory } from "@/types";

export default function HomeClient() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [category, setCategory] = useState("all");
  const [browsing, setBrowsing] = useState<{ category: string; items: Memory[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(0);

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

  const shown = useMemo(() => {
    if (category === "all") return digest?.recent ?? [];
    return browsing?.category === category ? browsing.items : [];
  }, [browsing, category, digest]);

  const featuredQuote = useMemo(
    () => digest?.recent.find((m) => m.content_type === "quote" && m.ocr_text),
    [digest],
  );

  if (loading) {
    return (
      <Page>
        <TopBar showSearch />
        <Content>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </Content>
      </Page>
    );
  }

  if (error) {
    return (
      <Page>
        <TopBar showSearch />
        <Content>
          <EmptyState
            title="Couldn't load your screenshots"
            body={error}
            action={
              <button
                type="button"
                onClick={() => void load()}
                className="min-h-[44px] rounded-xl bg-[var(--ink)] px-5 text-[13px] font-medium text-white"
              >
                Try again
              </button>
            }
          />
        </Content>
      </Page>
    );
  }

  const d = digest!;
  const browsingStyle = category !== "all" ? typeStyle(category) : null;

  return (
    <Page>
      <TopBar showSearch />
      <Content>
        <FilterChips active={category} counts={d.counts} onChange={setCategory} />

        {stalled > 0 ? (
          <button
            type="button"
            onClick={() => void repairStalled(10).then(load)}
            className="mt-3 flex w-full items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-left text-[13px] text-amber-900"
          >
            <span className="font-medium">
              {stalled} screenshot{stalled === 1 ? "" : "s"} couldn&apos;t be read.
            </span>
            <span className="ml-auto shrink-0 underline underline-offset-2">Retry</span>
          </button>
        ) : null}

        {d.total === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="Nothing saved yet"
              body="Share a screenshot from your iPhone Shortcut, or add one here. SnapAct reads it and files it so you can find it later."
              action={
                <Link
                  href="/upload"
                  className="inline-flex min-h-[44px] items-center rounded-xl bg-[var(--ink)] px-5 text-[13px] font-medium text-white"
                >
                  Add a screenshot
                </Link>
              }
            />
          </div>
        ) : browsingStyle ? (
          <section className="mt-5 rise">
            <SectionHeader
              title={browsingStyle.plural}
              Icon={browsingStyle.Icon}
              tint={browsingStyle.tint}
              color={browsingStyle.text}
              count={shown.length}
            />
            <MemoryGrid items={shown} />
          </section>
        ) : (
          <>
            {d.due_soon.length ? (
              <section className="mt-5 rise">
                <SectionHeader
                  title="Deadlines"
                  subtitle={
                    d.overdue_count ? `${d.overdue_count} past due` : "Coming up in two weeks"
                  }
                  Icon={IconClock}
                  tint="#eff4ff"
                  color="#2563eb"
                  href="/ask?q=what%20deadlines%20do%20I%20have"
                />
                <div className="space-y-2.5">
                  {d.due_soon.slice(0, 3).map((memory) => (
                    <DeadlineCard key={memory.id} memory={memory} onDone={markDone} />
                  ))}
                </div>
              </section>
            ) : null}

            {d.needs_attention.length ? (
              <section className="mt-7 rise">
                <SectionHeader
                  title="Needs a decision"
                  subtitle="Saved meaning to do something"
                  Icon={IconHelp}
                  tint="#eef2ff"
                  color="#4f46e5"
                  href="/ask?q=what%20should%20I%20act%20on"
                />
                <div className="space-y-2.5">
                  {d.needs_attention.slice(0, 3).map((memory) => (
                    <DecisionCard key={memory.id} memory={memory} onDone={markDone} />
                  ))}
                </div>
              </section>
            ) : null}

            {d.upcoming_events.length ? (
              <section className="mt-7 rise">
                <SectionHeader
                  title="Upcoming"
                  subtitle="Events still ahead"
                  Icon={IconCalendar}
                  tint="#eff4ff"
                  color="#2563eb"
                  href="/ask?q=what%20events%20have%20I%20saved"
                />
                <div className="space-y-2.5">
                  {d.upcoming_events.slice(0, 3).map((memory) => (
                    <UpcomingCard key={memory.id} memory={memory} />
                  ))}
                </div>
              </section>
            ) : null}

            {featuredQuote ? (
              <section className="mt-7 rise">
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

            <section className="mt-7 rise">
              <SectionHeader
                title="Everything"
                subtitle="All your memories, organized"
                Icon={IconGrid}
                tint="#eff4ff"
                color="#2563eb"
                count={d.total}
              />
              <MemoryGrid items={shown} />
            </section>
          </>
        )}
      </Content>
    </Page>
  );
}

function MemoryGrid({ items }: { items: Memory[] }) {
  if (!items.length) {
    return (
      <EmptyState title="Nothing here yet" body="Nothing you've saved falls into this category." />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {items.map((memory) => (
        <MemoryCard key={memory.id} memory={memory} />
      ))}
    </div>
  );
}
