"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Header, SearchBar } from "@/components/Header";
import {
  IconBookmark,
  IconBulb,
  IconCalendar,
  IconMic,
  IconPerson,
  IconPin,
  IconQuote,
  IconSend,
  IconSparkle,
} from "@/components/Icons";
import { fetchHealth, listMemories } from "@/lib/api";
import { cardSummary } from "@/lib/card-summary";
import { addDaysYmd, dueAtFromMemory, userAskedForFollowUp } from "@/lib/due-date";
import type { AttentionItem, HomeFeedPlan, MemoryDetail } from "@/types";

const FILTERS = [
  { id: "quote", label: "Quotes", Icon: IconQuote },
  { id: "event", label: "Events", Icon: IconCalendar },
  { id: "person_followup", label: "People", Icon: IconPerson },
  { id: "idea", label: "Ideas", Icon: IconBulb },
  { id: "place", label: "Places", Icon: IconPin },
] as const;

function formatDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatUploaded(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 16);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function uploadedAt(memory: MemoryDetail) {
  return memory.created_at || memory.captured_at || "";
}

function byNewest(a: MemoryDetail, b: MemoryDetail) {
  return new Date(uploadedAt(b) || 0).getTime() - new Date(uploadedAt(a) || 0).getTime();
}

function matchesType(memory: MemoryDetail, type: string) {
  const cat = String(memory.metadata?.category || "").toLowerCase();
  if (memory.content_type === type) return true;
  if (type === "quote" && (cat === "entertainment" || cat === "quote")) return true;
  if (type === "event" && cat === "event") return true;
  if (type === "person_followup" && (cat === "people" || cat === "person")) return true;
  return false;
}

function eventMeta(item: AttentionItem, memories: MemoryDetail[]) {
  const mem = memories.find((m) => m.memory_id === item.memory_id);
  const event = (mem?.analysis?.event || mem?.metadata?.event || {}) as Record<string, string>;
  const tags = (mem?.tags || []) as string[];
  const tag =
    tags.find((t) => /hackathon/i.test(t)) ||
    tags.find((t) => /meetup/i.test(t)) ||
    "Event";
  return {
    date: event.date || mem?.created_at,
    location: event.location || "",
    tag,
    image: item.image_url || mem?.image_url,
  };
}

export default function HomeClient() {
  const router = useRouter();
  const [feed, setFeed] = useState<HomeFeedPlan | null>(null);
  const [memories, setMemories] = useState<MemoryDetail[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [showAllScreenshots, setShowAllScreenshots] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [, mems] = await Promise.all([fetchHealth().catch(() => null), listMemories()]);
      const live = mems.memories
        .filter((m) => {
          const blob = `${m.title} ${m.description}`;
          return !/analysis is running in the background/i.test(blob);
        })
        .sort(byNewest);
      const tomorrow = addDaysYmd(null, 1);
      const today = addDaysYmd(null, 0);
      const todos = live
        .filter((m) => {
          const due = dueAtFromMemory(m);
          return (due === tomorrow || due === today) && userAskedForFollowUp(m);
        })
        .map((m) => {
          const due = dueAtFromMemory(m);
          return {
            ...toItem(m),
            reason: due === today ? `Due today (${due})` : `Due tomorrow (${due})`,
            priority: due === today ? 2 : 1,
          };
        });
      setMemories(live);
      setFeed({
        generated_at: new Date().toISOString(),
        needs_attention: todos,
        upcoming_events: live.filter((m) => matchesType(m, "event")).map(toItem),
        follow_ups: live.filter((m) => matchesType(m, "person_followup")).map(toItem),
        suggested_explorations: [],
        quotes: live.filter((m) => matchesType(m, "quote")).map(toItem),
        recent: live.map(toItem),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load SnapAct data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const quotes = feed?.quotes?.length ? feed.quotes : memories.filter((m) => matchesType(m, "quote")).map(toItem);
  const events = feed?.upcoming_events?.length
    ? feed.upcoming_events
    : memories.filter((m) => matchesType(m, "event")).map(toItem);
  const people = feed?.follow_ups?.length
    ? feed.follow_ups
    : memories.filter((m) => matchesType(m, "person_followup")).map(toItem);
  const recent = (feed?.recent?.length ? feed.recent : memories.map(toItem)).filter(
    (item) => Boolean(item.image_url) || Boolean(item.title),
  );
  const visibleRecent = showAllScreenshots ? recent : recent.slice(0, 3);
  const todos = feed?.needs_attention || [];

  const filtered = useMemo(() => {
    if (!category) return memories;
    return memories.filter((m) => matchesType(m, category)).sort(byNewest);
  }, [memories, category]);

  function submitAsk(e: FormEvent) {
    e.preventDefault();
    const q = ask.trim() || "What should I act on today?";
    router.push(`/ask?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-white px-5 pb-8 pt-4">
      <Header />

      <div className="mt-4">
        <SearchBar />
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map(({ id, label, Icon }) => {
          const active = category === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(active ? null : id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium ${
                active ? "bg-[#111827] text-white" : "bg-[#f3f4f6] text-[#111827]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-[#9ca3af]">Loading your screenshots…</p>
      ) : category ? (
        <section className="mt-6">
          <SectionHead title={FILTERS.find((f) => f.id === category)?.label || "All"} />
          <div className="mt-3 space-y-3">
            {filtered.map((m) => (
              <Link
                key={m.memory_id}
                href={`/memory/${m.memory_id}`}
                className="flex gap-3 rounded-2xl bg-[#f8f9fb] p-3"
              >
                {m.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-xl bg-[#e5e7eb]" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-semibold">{m.title}</div>
                  <p className="line-clamp-2 text-sm text-[#6b7280]">{cardSummary(m)}</p>
                </div>
              </Link>
            ))}
            {!filtered.length ? (
              <p className="text-sm text-[#9ca3af]">Nothing in this category yet.</p>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          {todos.length ? (
            <section className="mt-6">
              <SectionHead title="For tomorrow" href="/ask?q=things%20to%20do%20tomorrow" />
              <div className="mt-3 space-y-3">
                {todos.map((item) => {
                  const mem = memories.find((m) => m.memory_id === item.memory_id);
                  return (
                    <Link
                      key={item.memory_id}
                      href={`/memory/${item.memory_id}`}
                      className="flex gap-3 rounded-2xl bg-[#eff6ff] p-3"
                    >
                      {item.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.image_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                      ) : (
                        <div className="h-16 w-16 rounded-xl bg-[#dbeafe]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{item.title}</div>
                        <p className="mt-0.5 line-clamp-2 text-sm text-[#6b7280]">
                          {item.reason}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[12px] text-[var(--accent)]">
                          {mem ? cardSummary(mem) : "Follow up"}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
          <section className="mt-6">
            <SectionHead title="Screenshots" />
            <div className="mt-3 space-y-3">
              {visibleRecent.map((item) => {
                const mem = memories.find((m) => m.memory_id === item.memory_id);
                return (
                  <Link
                    key={item.memory_id}
                    href={`/memory/${item.memory_id}`}
                    className="flex gap-3 rounded-2xl bg-[#f8f9fb] p-3"
                  >
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                    ) : (
                      <div className="h-16 w-16 rounded-xl bg-[#e5e7eb]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{item.title}</div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-[#6b7280]">
                        {mem ? cardSummary(mem) : item.reason}
                      </p>
                      <p className="mt-1 text-[12px] text-[#9ca3af]">
                        {formatUploaded(mem ? uploadedAt(mem) : "")}
                      </p>
                    </div>
                  </Link>
                );
              })}
              {recent.length > 3 && !showAllScreenshots ? (
                <button
                  type="button"
                  onClick={() => setShowAllScreenshots(true)}
                  className="w-full rounded-2xl bg-[#f3f4f6] py-3 text-[14px] font-medium text-[var(--accent)]"
                >
                  More ({recent.length - 3})
                </button>
              ) : null}
              {showAllScreenshots && recent.length > 3 ? (
                <button
                  type="button"
                  onClick={() => setShowAllScreenshots(false)}
                  className="w-full text-[13px] font-medium text-[#6b7280]"
                >
                  Show less
                </button>
              ) : null}
              {!recent.length ? (
                <p className="text-sm text-[#9ca3af]">
                  No screenshots in memory yet. Capture one and it will show up here from search.
                </p>
              ) : null}
            </div>
          </section>

          <section className="mt-6">
            <SectionHead title="Saved Quotes" href="/ask?q=quotes" />
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {quotes.slice(0, 6).map((item) => {
                const mem = memories.find((m) => m.memory_id === item.memory_id);
                return (
                  <Link
                    key={item.memory_id}
                    href={`/memory/${item.memory_id}`}
                    className="w-[210px] shrink-0 rounded-2xl bg-[#f3f4f6] p-4"
                  >
                    <IconQuote className="h-5 w-5 text-[var(--accent)]" />
                    <p className="mt-3 line-clamp-4 min-h-[96px] text-[15px] font-medium leading-snug text-[#111827]">
                      {item.title}
                    </p>
                    <div className="mt-4 flex items-center justify-between text-[12px] text-[#9ca3af]">
                      <span>{formatDate(mem?.created_at)}</span>
                      <IconBookmark className="h-4 w-4" />
                    </div>
                  </Link>
                );
              })}
              {!quotes.length ? (
                <p className="text-sm text-[#9ca3af]">No quotes in memory yet.</p>
              ) : null}
            </div>
          </section>

          <section className="mt-7">
            <SectionHead title="Upcoming Events" href="/ask?q=events" />
            <div className="mt-3 space-y-3">
              {events.slice(0, 4).map((item) => {
                const meta = eventMeta(item, memories);
                return (
                  <Link
                    key={item.memory_id}
                    href={`/memory/${item.memory_id}`}
                    className="flex gap-3 rounded-2xl bg-white"
                  >
                    <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-[#111827]">
                      {meta.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={meta.image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] font-semibold text-white">
                          EVENT
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-[15px] font-semibold leading-tight">{item.title}</h3>
                        <IconBookmark className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                      </div>
                      <p className="mt-1 text-[13px] text-[#6b7280]">
                        {formatDate(meta.date)}
                        {meta.location ? ` · ${meta.location}` : ""}
                      </p>
                      <span className="mt-2 inline-flex rounded-full bg-[#dbeafe] px-2.5 py-0.5 text-[11px] font-medium text-[#1d4ed8]">
                        {meta.tag}
                      </span>
                    </div>
                  </Link>
                );
              })}
              {!events.length ? (
                <p className="text-sm text-[#9ca3af]">No upcoming events in memory yet.</p>
              ) : null}
            </div>
          </section>

          <section className="mt-7">
            <SectionHead title="People to Contact" href="/ask?q=who%20should%20I%20contact" />
            <div className="mt-3 space-y-3">
              {people.slice(0, 3).map((item) => {
                const mem = memories.find((m) => m.memory_id === item.memory_id);
                const person = (mem?.analysis?.person_followup || {}) as {
                  person_name?: string;
                  due_hint?: string;
                };
                const name = person.person_name || item.title;
                return (
                  <Link
                    key={item.memory_id}
                    href={`/memory/${item.memory_id}`}
                    className="flex items-center gap-3"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e5e7eb] text-base font-semibold text-[#374151]">
                      {mem?.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mem.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        name.charAt(0)
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{item.title}</div>
                      <p className="truncate text-[13px] text-[#6b7280]">{item.reason}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#dbeafe] px-2.5 py-1 text-[12px] font-medium text-[var(--accent)]">
                      <IconSparkle className="h-3.5 w-3.5" />
                      {person.due_hint || "Soon"}
                    </span>
                  </Link>
                );
              })}
              {!people.length ? (
                <p className="text-sm text-[#9ca3af]">No people follow-ups in memory yet.</p>
              ) : null}
            </div>
          </section>
        </>
      )}

      <section className="mt-8">
        <div className="mb-3 flex items-center gap-1.5 text-[17px] font-semibold">
          Ask SnapAct
          <IconSparkle className="h-4 w-4 text-[var(--accent)]" />
        </div>
        <form onSubmit={submitAsk} className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center rounded-full bg-[#f3f4f6] px-4 py-3">
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="What should I act on today?"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#9ca3af]"
            />
            <IconMic className="h-5 w-5 text-[#9ca3af]" />
          </div>
          <button
            type="submit"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white"
            aria-label="Send"
          >
            <IconSend className="h-5 w-5" />
          </button>
        </form>
        <div className="mt-3 flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Suggest
            icon={<IconCalendar className="h-3.5 w-3.5" />}
            label="Show similar events in Austin"
            onClick={() => router.push("/ask?q=Show%20similar%20events%20in%20Austin")}
          />
          <Suggest
            icon={<IconQuote className="h-3.5 w-3.5" />}
            label="What quotes inspire me?"
            onClick={() => router.push("/ask?q=What%20quotes%20inspire%20me%3F")}
          />
        </div>
      </section>
    </div>
  );
}

function toItem(m: MemoryDetail): AttentionItem {
  return {
    memory_id: m.memory_id,
    title: m.title,
    reason: m.description,
    priority: 0,
    content_type: m.content_type as AttentionItem["content_type"],
    intent_mode: m.intent_mode as AttentionItem["intent_mode"],
    image_url: m.image_url,
  };
}

function SectionHead({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-[20px] font-semibold tracking-tight">{title}</h2>
      {href ? (
        <Link href={href} className="text-[14px] font-medium text-[var(--accent)]">
          See all
        </Link>
      ) : null}
    </div>
  );
}

function Suggest({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#f3f4f6] px-3 py-2 text-[13px] text-[#111827]"
    >
      {icon}
      {label}
    </button>
  );
}
