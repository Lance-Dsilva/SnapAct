export function IconSearch({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconSparkle({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3.2c.2 2.6 1.5 4.4 4.2 5.2-2.7.8-4 2.6-4.2 5.2-.2-2.6-1.5-4.4-4.2-5.2C10.5 7.6 11.8 5.8 12 3.2z" />
      <path d="M18.2 13.2c.12 1.4.8 2.3 2.2 2.8-1.4.5-2.08 1.4-2.2 2.8-.12-1.4-.8-2.3-2.2-2.8 1.4-.5 2.08-1.4 2.2-2.8z" />
    </svg>
  );
}

export function IconBell({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9z" strokeLinejoin="round" />
      <path d="M10 18a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}

export function IconQuote({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.5 7.5C6 7.5 4.2 9.4 4.2 12.2c0 2 1.3 3.5 3.1 4.1-.3.9-1.1 1.7-2.3 2.4.4.3.9.4 1.4.4 2.9 0 5.1-2.3 5.1-5.7 0-3.2-1.6-5.9-3-5.9zm11 0c-2.5 0-4.3 1.9-4.3 4.7 0 2 1.3 3.5 3.1 4.1-.3.9-1.1 1.7-2.3 2.4.4.3.9.4 1.4.4 2.9 0 5.1-2.3 5.1-5.7 0-3.2-1.6-5.9-3-5.9z" />
    </svg>
  );
}

export function IconCalendar({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M4 10h16" strokeLinecap="round" />
    </svg>
  );
}

export function IconPerson({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19c1.2-3.2 3.4-4.7 6.5-4.7s5.3 1.5 6.5 4.7" strokeLinecap="round" />
    </svg>
  );
}

export function IconBulb({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 18h6M10 21h4" strokeLinecap="round" />
      <path d="M8 14.2A5.5 5.5 0 1 1 16 10c0 2-1 3-2.2 4.2-.6.6-.8 1.3-.8 2H11c0-.7-.2-1.4-.8-2A5.2 5.2 0 0 1 8 14.2z" />
    </svg>
  );
}

export function IconPin({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
      <circle cx="12" cy="11" r="1.8" />
    </svg>
  );
}

export function IconBookmark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4.5h10v15l-5-3.2-5 3.2v-15z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconMic({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="4" width="6" height="10" rx="3" />
      <path d="M7 11a5 5 0 0 0 10 0M12 16v3" strokeLinecap="round" />
    </svg>
  );
}

export function IconSend({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19V6M7 11l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCamera({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 8l1.4-2h5.2L16 8h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}
