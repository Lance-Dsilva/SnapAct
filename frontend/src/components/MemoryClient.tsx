"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SourcesList } from "@/components/Cards";
import { Header } from "@/components/Header";
import { deleteMemory, getMemory, setMemoryCompleted } from "@/lib/api";
import { formatDate, intentColor, relativeDay, typeLabel } from "@/lib/labels";
import type { Memory } from "@/types";

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <p className="mt-1 text-sm font-medium text-[var(--ink)]">{value}</p>
    </div>
  );
}

/** Pull display rows out of whichever typed facet this memory carries. */
function facts(memory: Memory): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const event = (memory.event || {}) as Record<string, string>;
  const place = (memory.place || {}) as Record<string, string>;
  const person = (memory.person || {}) as Record<string, string>;
  const product = (memory.product || {}) as Record<string, string>;

  if (memory.event_on) out.push(["Date", `${formatDate(memory.event_on)} · ${relativeDay(memory.event_on)}`]);
  if (event.time) out.push(["Time", event.time]);
  if (event.location) out.push(["Location", event.location]);
  if (place.name) out.push(["Place", place.name]);
  if (place.address) out.push(["Address", place.address]);
  if (person.name) out.push(["Person", [person.name, person.topic].filter(Boolean).join(" · ")]);
  if (product.name) out.push(["Product", product.name]);
  if (product.price) out.push(["Price", product.price]);
  if (product.vendor) out.push(["Vendor", product.vendor]);
  if (memory.due_on) out.push(["Due", `${formatDate(memory.due_on)} · ${relativeDay(memory.due_on)}`]);
  if (memory.source) out.push(["Source", memory.source]);
  out.push(["Saved", formatDate(memory.created_at)]);
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

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Header compact />
        <p className="mt-6 text-red-700">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-teal-700 hover:underline">
          ← Back home
        </Link>
      </div>
    );
  }

  if (!memory) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Header compact />
        <p className="mt-6 text-sm text-[var(--muted)]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <Header compact />

      {memory.image_url ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={memory.image_url}
            alt={memory.title}
            className="max-h-[28rem] w-full bg-slate-50 object-contain"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {typeLabel(memory.content_type)}
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${intentColor(memory.intent_mode)}`}
        >
          {memory.intent_mode}
        </span>
        {memory.completed ? (
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
            Done
          </span>
        ) : null}
        {memory.status === "failed" ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
            Analysis failed
          </span>
        ) : null}
      </div>

      <h1 className="text-3xl text-[var(--ink)]">{memory.title}</h1>
      <p className="leading-relaxed text-[var(--muted)]">{memory.description}</p>

      {memory.intent_summary ? (
        <p className="text-sm text-[var(--ink)]">
          <span className="font-semibold">Why you saved it: </span>
          {memory.intent_summary}
        </p>
      ) : null}

      {memory.user_note ? (
        <div className="rounded-2xl border-l-4 border-teal-400 bg-teal-50/50 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-teal-800">Your note</p>
          <p className="mt-1 text-sm text-[var(--ink)]">{memory.user_note}</p>
        </div>
      ) : null}

      {memory.user_question || memory.answer ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
          {memory.user_question ? (
            <p className="text-sm text-[var(--muted)]">You asked: {memory.user_question}</p>
          ) : null}
          {memory.answer ? (
            <p className="mt-2 whitespace-pre-line text-[var(--ink)]">{memory.answer}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {facts(memory).map(([label, value]) => (
          <Info key={label} label={label} value={value} />
        ))}
      </div>

      {memory.suggested_actions?.length ? (
        <div className="flex flex-wrap gap-2">
          {memory.suggested_actions.map((action) =>
            action.url ? (
              <a
                key={action.label}
                href={action.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white"
              >
                {action.label}
              </a>
            ) : (
              <span
                key={action.label}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]"
              >
                {action.label}
              </span>
            ),
          )}
        </div>
      ) : null}

      {memory.tags?.length ? (
        <div className="flex flex-wrap gap-2">
          {memory.tags.map((tag) => (
            <Link
              key={tag}
              href={`/ask?q=${encodeURIComponent(tag)}`}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200"
            >
              {tag}
            </Link>
          ))}
        </div>
      ) : null}

      {memory.ocr_text ? (
        <details className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">
            Text on screen
          </summary>
          <p className="mt-3 whitespace-pre-line text-sm text-[var(--muted)]">{memory.ocr_text}</p>
        </details>
      ) : null}

      <SourcesList citations={memory.citations} />

      <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-5">
        {memory.actionable ? (
          <button
            type="button"
            onClick={() => void toggleDone()}
            disabled={busy}
            className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {memory.completed ? "Mark not done" : "Mark done"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy}
          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        >
          Delete
        </button>
        <Link
          href="/"
          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
