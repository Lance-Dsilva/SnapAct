"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState, IntentPill, SourcesList } from "@/components/Cards";
import { Content, Page, TopBar } from "@/components/Shell";
import { IconCheck, IconChevronRight, IconExternal } from "@/components/Icons";
import { deleteMemory, getMemory, setMemoryCompleted } from "@/lib/api";
import { formatDate, relativeDay, savedAt, typeStyle } from "@/lib/labels";
import type { Memory } from "@/types";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-light)]">
        {label}
      </div>
      <p className="mt-1 text-[14px] font-medium text-[var(--ink)]">{value}</p>
    </div>
  );
}

/** Display rows pulled from whichever typed facet this memory carries. */
function facts(memory: Memory): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const event = (memory.event || {}) as Record<string, string>;
  const place = (memory.place || {}) as Record<string, string>;
  const person = (memory.person || {}) as Record<string, string>;
  const product = (memory.product || {}) as Record<string, string>;

  if (memory.event_on) {
    out.push(["Date", `${formatDate(memory.event_on)} · ${relativeDay(memory.event_on)}`]);
  }
  if (event.time) out.push(["Time", event.time]);
  if (event.location) out.push(["Location", event.location]);
  if (place.name) out.push(["Place", place.name]);
  if (place.address) out.push(["Address", place.address]);
  if (person.name) out.push(["Person", [person.name, person.topic].filter(Boolean).join(" · ")]);
  if (product.name) out.push(["Product", product.name]);
  if (product.price) out.push(["Price", product.price]);
  if (product.vendor) out.push(["Vendor", product.vendor]);
  if (memory.due_on) {
    out.push(["Due", `${formatDate(memory.due_on)} · ${relativeDay(memory.due_on)}`]);
  }
  if (memory.source) out.push(["Source", memory.source]);
  out.push(["Saved", savedAt(memory.created_at)]);
  return out;
}

export default function MemoryClient({ memoryId }: { memoryId: string }) {
  const router = useRouter();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMemory(memoryId)
      .then(setMemory)
      .catch((e) => setError(e instanceof Error ? e.message : "Not found"));
  }, [memoryId]);

  async function toggleDone() {
    if (!memory) return;
    setBusy(true);
    try {
      setMemory(await setMemoryCompleted(memory.id, !memory.completed));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!memory || !window.confirm("Delete this screenshot and its memory?")) return;
    setBusy(true);
    try {
      await deleteMemory(memory.id);
      router.push("/");
    } finally {
      setBusy(false);
    }
  }

  const style = memory ? typeStyle(memory.content_type) : null;

  return (
    <Page>
      <TopBar title="Memory" back="/" />
      <Content width="narrow">
        {error ? (
          <EmptyState
            title="Memory not found"
            body={error}
            action={
              <Link
                href="/"
                className="rounded-xl bg-[var(--ink)] px-5 py-2.5 text-[13px] font-medium text-white"
              >
                Back home
              </Link>
            }
          />
        ) : !memory || !style ? (
          <p className="py-16 text-center text-[14px] text-[var(--muted)]">Loading…</p>
        ) : (
          <div className="flex flex-col gap-6 rise">
            {memory.image_url ? (
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={memory.image_url}
                  alt={memory.title}
                  className="max-h-[30rem] w-full bg-[var(--surface-soft)] object-contain"
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em]"
                style={{ color: style.text }}
              >
                <style.Icon className="h-3.5 w-3.5" />
                {style.label}
              </span>
              <IntentPill intent={memory.intent_mode} />
              {memory.completed ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-medium text-emerald-700">
                  Done
                </span>
              ) : null}
              {memory.status === "failed" ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-medium text-amber-800">
                  Analysis failed
                </span>
              ) : null}
            </div>

            <div>
              <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)]">
                {memory.title}
              </h1>
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted)]">
                {memory.description}
              </p>
            </div>

            {memory.intent_summary ? (
              <p className="text-[14px] text-[var(--ink-soft)]">
                <span className="font-semibold">Why you saved it: </span>
                {memory.intent_summary}
              </p>
            ) : null}

            {memory.user_note ? (
              <div className="rounded-2xl border-l-[3px] border-indigo-400 bg-indigo-50/50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-indigo-700">
                  Your note
                </p>
                <p className="mt-1 text-[14px] text-[var(--ink)]">{memory.user_note}</p>
              </div>
            ) : null}

            {memory.user_question || memory.answer ? (
              <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]">
                {memory.user_question ? (
                  <p className="text-[13px] text-[var(--muted)]">
                    You asked: {memory.user_question}
                  </p>
                ) : null}
                {memory.answer ? (
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-[var(--ink)]">
                    {memory.answer}
                  </p>
                ) : null}
              </div>
            ) : null}

            {memory.suggested_actions?.length ? (
              <div className="flex flex-wrap gap-2">
                {memory.suggested_actions.map((action) =>
                  action.url ? (
                    <a
                      key={action.label}
                      href={action.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#1e293b]"
                    >
                      {action.label}
                      <IconChevronRight className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span
                      key={action.label}
                      className="inline-flex items-center rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-[13px] text-[var(--muted)]"
                    >
                      {action.label}
                    </span>
                  ),
                )}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              {facts(memory).map(([label, value]) => (
                <Fact key={label} label={label} value={value} />
              ))}
            </div>

            {memory.tags?.length ? (
              <div className="flex flex-wrap gap-2">
                {memory.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/ask?q=${encodeURIComponent(tag)}`}
                    className="rounded-full bg-white px-3 py-1.5 text-[12.5px] text-[var(--ink-soft)] ring-1 ring-[var(--border)] transition hover:ring-[var(--border-strong)]"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            ) : null}

            {memory.ocr_text ? (
              <details className="rounded-2xl border border-[var(--border)] bg-white p-4">
                <summary className="cursor-pointer text-[13px] font-semibold text-[var(--ink)]">
                  Text on screen
                </summary>
                <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-[var(--muted)]">
                  {memory.ocr_text}
                </p>
              </details>
            ) : null}

            <SourcesList citations={memory.citations} />

            <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-6">
              {memory.actionable ? (
                <button
                  type="button"
                  onClick={() => void toggleDone()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-60"
                >
                  <IconCheck className="h-4 w-4" />
                  {memory.completed ? "Mark not done" : "Mark done"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-[13px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
              >
                Delete
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-[13px] font-medium text-[var(--muted)]"
              >
                <IconExternal className="h-4 w-4" />
                Back home
              </Link>
            </div>
          </div>
        )}
      </Content>
    </Page>
  );
}
