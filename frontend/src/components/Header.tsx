"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  IconBell,
  IconChevronDown,
  IconMic,
  IconPaperclip,
  IconSparkle,
} from "@/components/Icons";

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-[10px] text-white"
        style={{ background: "var(--gradient)" }}
      >
        <IconSparkle className="h-[18px] w-[18px]" />
      </span>
      <span className="text-[19px] font-bold tracking-[-0.02em] text-[var(--ink)]">SnapAct</span>
    </Link>
  );
}

/**
 * The command bar. One field for both searching and asking — the sparkle button
 * and Enter both route to Ask, which is the thing people actually want.
 */
export function CommandBar({
  initial = "",
  placeholder = "Ask SnapAct about your screenshots...",
  showShortcutHint = true,
}: {
  initial?: string;
  placeholder?: string;
  showShortcutHint?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const query = value.trim();
    if (query) router.push(`/ask?q=${encodeURIComponent(query)}`);
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div
        className={`flex items-center gap-2.5 rounded-full border bg-white px-4 py-2.5 transition ${
          focused
            ? "border-indigo-300 shadow-[0_0_0_4px_rgba(99,102,241,0.1)]"
            : "border-[var(--border)] shadow-[var(--shadow)]"
        }`}
      >
        <IconSparkle className="h-[18px] w-[18px] shrink-0 text-indigo-500" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          aria-label="Search or ask about your screenshots"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--muted-light)]"
        />

        {showShortcutHint && !value && !focused ? (
          <kbd className="hidden shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--muted)] sm:block">
            ⌘K
          </kbd>
        ) : null}

        <Link
          href="/upload"
          aria-label="Attach a screenshot"
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] sm:flex"
        >
          <IconPaperclip className="h-[18px] w-[18px]" />
        </Link>
        <span
          aria-hidden
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--muted-light)] sm:flex"
        >
          <IconMic className="h-[18px] w-[18px]" />
        </span>

        <button
          type="submit"
          aria-label="Ask SnapAct"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition hover:opacity-90"
          style={{ background: "var(--gradient)" }}
        >
          <IconSparkle className="h-[18px] w-[18px]" />
        </button>
      </div>
    </form>
  );
}

export function Header({
  query,
  placeholder,
}: {
  query?: string;
  placeholder?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1360px] items-center gap-4 px-5 py-3 sm:px-8">
        <Logo />

        <div className="mx-auto w-full max-w-[620px]">
          <CommandBar initial={query} placeholder={placeholder} />
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-white hover:text-[var(--ink)]"
          >
            <IconBell className="h-[19px] w-[19px]" />
            <span className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full bg-indigo-500 ring-2 ring-[var(--background)]" />
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-full p-0.5 pr-1 transition hover:bg-white"
            aria-label="Account"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold text-white"
              style={{ background: "var(--gradient)" }}
            >
              D
            </span>
            <IconChevronDown className="h-4 w-4 text-[var(--muted)]" />
          </button>
        </div>
      </div>
    </header>
  );
}
