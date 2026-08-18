"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  IconBell,
  IconGrid,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSparkle,
} from "@/components/Icons";

/**
 * Mobile-first application shell.
 *
 * The phone is the primary target, so the layout is designed at 375px and widens
 * from there. Two consequences drive everything below:
 *
 *  - Vertical space is the scarce resource. The header is one 52px row and the
 *    search field only takes a second row where it earns it (the home screen).
 *  - The top of a phone screen is the hardest place to reach. Primary navigation
 *    lives in a bottom tab bar, inside the safe area, not in a corner FAB that
 *    covers content and collides with Safari's toolbar.
 */

const GUTTER = "[--gutter:16px] sm:[--gutter:24px] lg:[--gutter:32px]";

export function TopBar({
  title,
  showSearch = false,
  back,
}: {
  title?: string;
  showSearch?: boolean;
  back?: string;
}) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur-xl"
      style={{ paddingTop: "var(--safe-top)" }}
    >
      <div className={`mx-auto w-full max-w-[1200px] px-[var(--gutter)] ${GUTTER}`}>
        <div className="flex h-[52px] items-center gap-3">
          {back ? (
            <Link
              href={back}
              aria-label="Back"
              className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--ink)] active:bg-[var(--surface-soft)]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ) : (
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-[10px] text-white"
                style={{ background: "var(--gradient)" }}
              >
                <IconSparkle className="h-[17px] w-[17px]" />
              </span>
              <span className="text-[17px] font-bold tracking-[-0.02em] text-[var(--ink)]">
                SnapAct
              </span>
            </Link>
          )}

          {title ? (
            <h1 className="min-w-0 flex-1 truncate text-[16px] font-semibold text-[var(--ink)]">
              {title}
            </h1>
          ) : (
            <span className="flex-1" />
          )}

          <button
            type="button"
            aria-label="Notifications"
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--muted)] active:bg-[var(--surface-soft)]"
          >
            <IconBell className="h-[19px] w-[19px]" />
            <span className="absolute right-2.5 top-2.5 h-[7px] w-[7px] rounded-full bg-indigo-500 ring-2 ring-[var(--background)]" />
          </button>
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
            style={{ background: "var(--gradient)" }}
          >
            D
          </Link>
        </div>

        {showSearch ? (
          <div className="pb-3">
            <SearchField />
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function SearchField({
  initial = "",
  placeholder = "Ask about your screenshots",
  autoFocus = false,
}: {
  initial?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
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
    <form onSubmit={onSubmit}>
      <div className="flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-white px-3.5 py-2.5 shadow-[var(--shadow-sm)] focus-within:border-indigo-300 focus-within:shadow-[0_0_0_4px_rgba(99,102,241,0.1)]">
        <IconSearch className="h-[18px] w-[18px] shrink-0 text-[var(--muted-light)]" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label="Search or ask about your screenshots"
          enterKeyHint="search"
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--muted-light)]"
        />
        <button
          type="submit"
          aria-label="Ask SnapAct"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white active:scale-95"
          style={{ background: "var(--gradient)" }}
        >
          <IconSparkle className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

const TABS = [
  { href: "/", label: "Library", Icon: IconGrid },
  { href: "/ask", label: "Ask", Icon: IconSparkle },
  { href: "/upload", label: "Add", Icon: IconPlus, accent: true },
  { href: "/settings", label: "Settings", Icon: IconSettings },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-white/92 backdrop-blur-xl"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="mx-auto flex h-[60px] max-w-[560px] items-stretch">
        {TABS.map(({ href, label, Icon, accent }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex h-full flex-col items-center justify-center gap-1"
              >
                {accent ? (
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-[var(--shadow-md)] active:scale-95"
                    style={{ background: "var(--gradient)" }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                ) : (
                  <>
                    <Icon
                      className={`h-[21px] w-[21px] ${
                        active ? "text-[var(--accent)]" : "text-[var(--muted-light)]"
                      }`}
                    />
                    <span
                      className={`text-[10.5px] font-medium ${
                        active ? "text-[var(--accent)]" : "text-[var(--muted-light)]"
                      }`}
                    >
                      {label}
                    </span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Page frame: gutters, max width, and room for the tab bar. */
export function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className={GUTTER}>
      {children}
      <TabBar />
    </div>
  );
}

export function Content({
  children,
  width = "wide",
}: {
  children: React.ReactNode;
  width?: "wide" | "narrow";
}) {
  return (
    <main
      className={`pad-bottom-nav mx-auto w-full px-[var(--gutter)] pt-4 ${
        width === "narrow" ? "max-w-[680px]" : "max-w-[1200px]"
      }`}
    >
      {children}
    </main>
  );
}
