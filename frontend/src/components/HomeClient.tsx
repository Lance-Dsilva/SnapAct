"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ActionCard,
  CategoryPills,
  EmptyState,
  EventCard,
  MemoryGridCard,
  QuoteCard,
  SectionTitle,
} from "@/components/Cards";
import { Header, SearchBar } from "@/components/Header";
import {
  fetchDigest,
  fetchStalledCount,
  listMemories,
  repairStalled,
  setMemoryCompleted,
} from "@/lib/api";
import { typeLabel } from "@/lib/labels";
import type { Digest, Memory } from "@/types";

export default function HomeClient() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [category, setCategory] = useState("all");
  const [browsing, setBrowsing] = useState<Memory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, repair] = await Promise.all([
        fetchDigest(),
        fetchStalledCount().catch(() => 0),
      ]);
      setDigest(data);
      setStalled(repair);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your screenshots");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Browsing a category is a plain filtered query, not a re-derivation of the feed.
  useEffect(() => {
    if (category === "all") {
      setBrowsing(null);
      return;
    }
    let cancelled = false;
    void listMemories({ contentType: category, limit: 60 })
      .then((data) => {
        if (!cancelled) setBrowsing(data.memories);
      })
      .catch(() => {
        if (!cancelled) setBrowsing([]);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  async function markDone(id: string) {
    setDigest((current) =>
      current
        ? {
            ...current,
            needs_attention: current.needs_attention.filter((m) => m.id !== id),
            due_soon: current.due_soon.filter((m) => m.id !== id),
          }
        : current,
    );
    await setMemoryCompleted(id, true).catch(() => void load());
  }

  async function retryFailed() {
    const result = await repairStalled(10).catch(() => null);
    setStalled(result?.remaining ?? 0);
    await load();
  }

  if (loading && !digest) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-6">
        <Header />
        <p className="mt-16 text-center text-sm text-[var(--muted)]">Loading your screenshots…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-6">
        <Header />
        <div className="mt-10 rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <p className="font-medium text-rose-900">SnapAct could not load your screenshots</p>
          <p className="mt-1 text-sm text-rose-800">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const d = digest!;
  const isEmpty = d.total === 0;
  const quotes = d.recent.filter((m) => m.content_type === "quote").slice(0, 3);

  return (
    <main className="mx-auto max-w-5xl px-5 py-6 pb-24">
      <Header />

      <div className="mt-6">
        <SearchBar />
      </div>

      {isEmpty ? (
        <div className="mt-10">
          <EmptyState
            title="Nothing saved yet"
            body="Share a screenshot from your iPhone Shortcut, or upload one here. SnapAct reads it, works out what it is, and files it so you can find it later."
          />
          <div className="mt-4 text-center">
            <Link
              href="/upload"
              className="inline-flex rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white"
            >
              Upload a screenshot
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <CategoryPills active={category} counts={d.counts} onChange={setCategory} />
          </div>

          {stalled > 0 ? (
            <button
              type="button"
              onClick={() => void retryFailed()}
              className="mt-4 w-full rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-900"
            >
              {stalled} screenshot{stalled === 1 ? "" : "s"} could not be read. Tap to retry.
            </button>
          ) : null}

          {browsing ? (
            <section className="mt-8">
              <SectionTitle title={typeLabel(category)} count={browsing.length} />
              {browsing.length ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {browsing.map((memory) => (
                    <MemoryGridCard key={memory.id} memory={memory} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={`No ${typeLabel(category).toLowerCase()} yet`}
                  body="Nothing you've saved falls into this category."
                />
              )}
            </section>
          ) : (
            <>
              {d.due_soon.length ? (
                <section className="mt-8">
                  <SectionTitle
                    title="Deadlines"
                    subtitle={
                      d.overdue_count
                        ? `${d.overdue_count} already past due`
                        : "Coming up in the next two weeks"
                    }
                  />
                  <div className="space-y-3">
                    {d.due_soon.map((memory) => (
                      <ActionCard key={memory.id} memory={memory} onDone={markDone} />
                    ))}
                  </div>
                </section>
              ) : null}

              {d.needs_attention.length ? (
                <section className="mt-8">
                  <SectionTitle
                    title="Needs a decision"
                    subtitle="You saved these meaning to do something about them"
                  />
                  <div className="space-y-3">
                    {d.needs_attention.map((memory) => (
                      <ActionCard key={memory.id} memory={memory} onDone={markDone} />
                    ))}
                  </div>
                </section>
              ) : null}

              {d.upcoming_events.length ? (
                <section className="mt-8">
                  <SectionTitle title="Upcoming" subtitle="Events still ahead" />
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {d.upcoming_events.map((memory) => (
                      <EventCard key={memory.id} memory={memory} />
                    ))}
                  </div>
                </section>
              ) : null}

              {quotes.length ? (
                <section className="mt-8">
                  <SectionTitle title="Worth rereading" />
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {quotes.map((memory) => (
                      <QuoteCard key={memory.id} memory={memory} />
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="mt-8">
                <SectionTitle title="Everything" count={d.total} />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {d.recent.map((memory) => (
                    <MemoryGridCard key={memory.id} memory={memory} />
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}

      <Link
        href="/upload"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ink)] text-2xl text-white shadow-lg"
        aria-label="Add a screenshot"
      >
        +
      </Link>
    </main>
  );
}
