"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { IconBell, IconCamera, IconSearch, IconSparkle } from "@/components/Icons";

export function Header({ compact = false }: { compact?: boolean }) {
  return (
    <header className="flex items-center justify-between">
      <Link href="/" className="text-[28px] font-bold tracking-tight text-[var(--accent)]">
        SnapAct
      </Link>
      <div className="flex items-center gap-3">
        <Link
          href="/upload"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#111827] hover:bg-[#f3f4f6]"
          aria-label="Upload screenshot"
        >
          {compact ? <IconCamera className="h-5 w-5" /> : <IconBell className="h-[22px] w-[22px]" />}
        </Link>
        <Link href="/upload" aria-label="Upload Screenshot" className="block">
          <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#7dd3fc] to-[#3b82f6] text-sm font-semibold text-white">
            D
          </span>
        </Link>
      </div>
    </header>
  );
}

export function SearchBar({
  initial = "",
  placeholder = "Search or ask your screenshots...",
}: {
  initial?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    router.push(`/ask?q=${encodeURIComponent(q)}`);
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <label className="sr-only" htmlFor="search-input">
        Search or ask
      </label>
      <div className="flex items-center gap-2 rounded-full bg-[#f3f4f6] px-4 py-3">
        <IconSearch className="h-[18px] w-[18px] shrink-0 text-[#9ca3af]" />
        <input
          id="search-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-[#111827] outline-none placeholder:text-[#9ca3af]"
        />
        <button type="submit" className="text-[var(--accent)]" aria-label="Ask SnapAct">
          <IconSparkle className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}

export function AskBar(props: { initial?: string; placeholder?: string }) {
  return <SearchBar {...props} />;
}
