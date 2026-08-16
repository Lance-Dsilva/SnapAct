"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SourcesList } from "@/components/Cards";
import { Header } from "@/components/Header";
import { MarkdownAnswer } from "@/components/MarkdownAnswer";
import { waitForReady } from "@/lib/api";
import { intentColor, relativeDay, typeLabel } from "@/lib/labels";
import type { CaptureResponse, Memory } from "@/types";

/**
 * Shown straight after a capture. The capture response is handed over through
 * sessionStorage so the result appears instantly, then the stored memory is
 * fetched to confirm what was actually persisted.
 */
export default function ResultClient({ memoryId }: { memoryId: string }) {
  const [capture, setCapture] = useState<CaptureResponse | null>(null);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem(`snapact:capture:${memoryId}`);
    if (cached) {
      try {
        setCapture(JSON.parse(cached) as CaptureResponse);
      } catch {
        /* fall through to the fetch */
      }
    }

    let cancelled = false;
    setAnalyzing(true);
    // The capture returned before analysis finished, so poll until the organized
    // version lands. The screenshot is already saved either way.
    waitForReady(memoryId)
      .then((latest) => {
        if (!cancelled) setMemory(latest);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the memory");
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [memoryId]);

  const title = memory?.title || capture?.title;
  const description = memory?.description || capture?.description;
  const contentType = memory?.content_type || capture?.content_type;
  const intentMode = memory?.intent_mode || capture?.intent_mode;
  const answer = memory?.answer || capture?.answer;
  const actions = memory?.suggested_actions || capture?.suggested_actions || [];
  const tags = memory?.tags || capture?.tags || [];
  const dueOn = memory?.due_on || capture?.due_on;
  const eventOn = memory?.event_on || capture?.event_on;
  const imageUrl = memory?.image_url || capture?.image_url;

  if (error && !capture) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Header compact />
        <p className="mt-6 text-red-700">{error}</p>
      </div>
    );
  }

  if (!title) {
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

      <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3">
        <p className="text-sm font-medium text-teal-900">
          {capture?.short_message || "Saved to SnapAct"}
        </p>
        {analyzing && memory?.status !== "ready" ? (
          <p className="mt-1 animate-pulse text-xs text-teal-800">
            Reading the screenshot and filing it…
          </p>
        ) : null}
      </div>

      {imageUrl ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={title}
            className="max-h-80 w-full bg-slate-50 object-contain"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {typeLabel(contentType)}
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${intentColor(intentMode)}`}
        >
          {intentMode}
        </span>
        {eventOn ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
            {relativeDay(eventOn)}
          </span>
        ) : null}
        {dueOn ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
            Due {relativeDay(dueOn)}
          </span>
        ) : null}
      </div>

      <h1 className="text-3xl text-[var(--ink)]">{title}</h1>
      {description ? <p className="leading-relaxed text-[var(--muted)]">{description}</p> : null}

      {answer ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]">
          <MarkdownAnswer text={answer} />
        </div>
      ) : null}

      {actions.length ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) =>
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

      {tags.length ? (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <SourcesList citations={memory?.citations || capture?.citations} />

      <div className="flex gap-2">
        <Link
          href={`/memory/${memoryId}`}
          className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-medium text-white"
        >
          View memory
        </Link>
        <Link
          href="/upload"
          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]"
        >
          Save another
        </Link>
        <Link
          href="/"
          className="rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
