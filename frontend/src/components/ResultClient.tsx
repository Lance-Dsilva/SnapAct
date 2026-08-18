"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IntentPill, SourcesList } from "@/components/Cards";
import { Header } from "@/components/Header";
import { IconCheckCircle, IconChevronRight } from "@/components/Icons";
import { MarkdownAnswer } from "@/components/MarkdownAnswer";
import { waitForReady } from "@/lib/api";
import { relativeDay, typeStyle } from "@/lib/labels";
import type { CaptureResponse, Memory } from "@/types";

/**
 * Shown straight after a capture. The capture response comes through
 * sessionStorage so the result appears instantly, then the stored memory is
 * polled until background analysis fills in the organized version.
 */
export default function ResultClient({ memoryId }: { memoryId: string }) {
  const [capture, setCapture] = useState<CaptureResponse | null>(null);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const cached = sessionStorage.getItem(`snapact:capture:${memoryId}`);
      if (cached && !cancelled) {
        try {
          setCapture(JSON.parse(cached) as CaptureResponse);
        } catch {
          /* fall through to the fetch */
        }
      }
    }
    void hydrate();

    waitForReady(memoryId)
      .then((latest) => !cancelled && setMemory(latest))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load it"))
      .finally(() => !cancelled && setAnalyzing(false));

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
  const stillWorking = analyzing && memory?.status !== "ready";
  const style = typeStyle(contentType);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
        {error && !capture ? (
          <p className="text-rose-600">{error}</p>
        ) : !title ? (
          <p className="py-16 text-center text-[14px] text-[var(--muted)]">Loading…</p>
        ) : (
          <div className="flex flex-col gap-6 rise">
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 px-4 py-3.5">
              <IconCheckCircle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-emerald-600" />
              <div>
                <p className="text-[14px] font-medium text-emerald-900">
                  {capture?.short_message || "Saved to SnapAct"}
                </p>
                {stillWorking ? (
                  <p className="mt-0.5 animate-pulse text-[12.5px] text-emerald-700">
                    Reading the screenshot and filing it…
                  </p>
                ) : null}
              </div>
            </div>

            {imageUrl ? (
              <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={title}
                  className="max-h-[26rem] w-full bg-[var(--surface-soft)] object-contain"
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
              {intentMode ? <IntentPill intent={intentMode} /> : null}
              {eventOn ? (
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[12px] font-medium text-indigo-700">
                  {relativeDay(eventOn)}
                </span>
              ) : null}
              {dueOn ? (
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[12px] font-medium text-rose-700">
                  Due {relativeDay(dueOn)}
                </span>
              ) : null}
            </div>

            <div>
              <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[var(--ink)]">
                {title}
              </h1>
              {description ? (
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted)]">
                  {description}
                </p>
              ) : null}
            </div>

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
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink)] px-4 py-2.5 text-[13px] font-medium text-white"
                    >
                      {action.label}
                      <IconChevronRight className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span
                      key={action.label}
                      className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-[13px] text-[var(--muted)]"
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
                  <span
                    key={tag}
                    className="rounded-full bg-white px-3 py-1.5 text-[12.5px] text-[var(--ink-soft)] ring-1 ring-[var(--border)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <SourcesList citations={memory?.citations || capture?.citations} />

            <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-6">
              <Link
                href={`/memory/${memoryId}`}
                className="rounded-xl bg-[var(--ink)] px-4 py-2.5 text-[13px] font-medium text-white"
              >
                View memory
              </Link>
              <Link
                href="/upload"
                className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-[13px] font-medium text-[var(--ink-soft)]"
              >
                Save another
              </Link>
              <Link
                href="/"
                className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-[13px] font-medium text-[var(--muted)]"
              >
                Home
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
