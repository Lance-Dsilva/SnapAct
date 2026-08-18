import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

/** Single stroke-based icon set so every glyph shares weight and terminals. */
function Base({ children, ...props }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconSparkle = (p: Props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12 2.6l1.9 5.1a3 3 0 001.8 1.8l5.1 1.9-5.1 1.9a3 3 0 00-1.8 1.8L12 20.2l-1.9-5.1a3 3 0 00-1.8-1.8L3.2 11.4l5.1-1.9a3 3 0 001.8-1.8L12 2.6z" />
    <path d="M19 2.5l.7 1.9.0.0 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9z" opacity="0.7" />
  </svg>
);

export const IconSearch = (p: Props) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.2-3.2" />
  </Base>
);

export const IconPaperclip = (p: Props) => (
  <Base {...p}>
    <path d="M21 11.5l-8.4 8.4a5 5 0 01-7.1-7.1l8.9-8.9a3.5 3.5 0 015 5l-8.9 8.9a2 2 0 01-2.8-2.8l8.2-8.2" />
  </Base>
);

export const IconMic = (p: Props) => (
  <Base {...p}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" />
  </Base>
);

export const IconBell = (p: Props) => (
  <Base {...p}>
    <path d="M18 8.5a6 6 0 10-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5z" />
    <path d="M13.7 19a2 2 0 01-3.4 0" />
  </Base>
);

export const IconChevronDown = (p: Props) => (
  <Base {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Base>
);

export const IconChevronRight = (p: Props) => (
  <Base {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Base>
);

export const IconCheck = (p: Props) => (
  <Base {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Base>
);

export const IconPlus = (p: Props) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconClock = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Base>
);

export const IconHelp = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.4a2.5 2.5 0 114 2.3c-.9.6-1.6 1-1.6 2.1" />
    <path d="M12 17.2h.01" strokeWidth={2.2} />
  </Base>
);

export const IconCalendar = (p: Props) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 9.8h17M8.5 3v3.6M15.5 3v3.6" />
  </Base>
);

export const IconGrid = (p: Props) => (
  <Base {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </Base>
);

export const IconList = (p: Props) => (
  <Base {...p}>
    <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" strokeWidth={2} />
  </Base>
);

export const IconFilter = (p: Props) => (
  <Base {...p}>
    <path d="M3.5 6h17M6.5 12h11M10 18h4" />
  </Base>
);

export const IconExternal = (p: Props) => (
  <Base {...p}>
    <path d="M14 4h6v6M20 4l-8.5 8.5" />
    <path d="M18 14.5V18a2.5 2.5 0 01-2.5 2.5H6A2.5 2.5 0 013.5 18V8.5A2.5 2.5 0 016 6h3.5" />
  </Base>
);

export const IconBookmark = (p: Props) => (
  <Base {...p}>
    <path d="M6.5 4.5h11a1 1 0 011 1V20l-6.5-4-6.5 4V5.5a1 1 0 011-1z" />
  </Base>
);

export const IconMore = (p: Props) => (
  <Base {...p} strokeWidth={2.4}>
    <path d="M6 12h.01M12 12h.01M18 12h.01" />
  </Base>
);

export const IconBolt = (p: Props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M13.5 2L4 13.5h6L9.5 22 20 10.5h-6.4L13.5 2z" />
  </svg>
);

export const IconCompass = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M15.2 8.8l-1.9 4.5-4.5 1.9 1.9-4.5 4.5-1.9z" />
  </Base>
);

/* ---------------------------------------------------------- content types */

export const IconQuote = (p: Props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M9.4 5.5C6.3 6.9 4.4 9.6 4.4 12.9c0 3.2 1.9 5.6 4.6 5.6 2.1 0 3.7-1.5 3.7-3.5 0-1.9-1.4-3.3-3.2-3.3-.4 0-.8.1-1 .2.4-1.6 1.7-3 3.4-3.9l-2.5-2.5zM19 5.5c-3.1 1.4-5 4.1-5 7.4 0 3.2 1.9 5.6 4.6 5.6 2.1 0 3.7-1.5 3.7-3.5 0-1.9-1.4-3.3-3.2-3.3-.4 0-.8.1-1 .2.4-1.6 1.7-3 3.4-3.9L19 5.5z" />
  </svg>
);

export const IconMedia = (p: Props) => (
  <Base {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="3" />
    <path d="M3 15.5l4.5-4a2 2 0 012.7 0l3.3 3M14 13.5l1.6-1.4a2 2 0 012.7 0L21 14.5" />
    <circle cx="15.5" cy="9" r="1.4" />
  </Base>
);

export const IconBriefcase = (p: Props) => (
  <Base {...p}>
    <rect x="2.5" y="7" width="19" height="13" rx="3" />
    <path d="M8.5 7V5.5A2 2 0 0110.5 3.5h3a2 2 0 012 2V7M2.5 12.5h19" />
  </Base>
);

export const IconChat = (p: Props) => (
  <Base {...p}>
    <path d="M20.5 11.6c0 4.1-3.8 7.4-8.5 7.4-1 0-2-.2-2.9-.4L4 20.5l1.4-3.6A7 7 0 013.5 11.6C3.5 7.5 7.3 4.2 12 4.2s8.5 3.3 8.5 7.4z" />
  </Base>
);

export const IconPin = (p: Props) => (
  <Base {...p}>
    <path d="M19 10.3c0 5-7 11-7 11s-7-6-7-11a7 7 0 0114 0z" />
    <circle cx="12" cy="10.2" r="2.6" />
  </Base>
);

export const IconPhone = (p: Props) => (
  <Base {...p}>
    <rect x="6" y="2.5" width="12" height="19" rx="3" />
    <path d="M10.5 18.4h3" />
  </Base>
);

export const IconBox = (p: Props) => (
  <Base {...p}>
    <path d="M20.5 8.2v7.6a2 2 0 01-1 1.7l-6.5 3.7a2 2 0 01-2 0l-6.5-3.7a2 2 0 01-1-1.7V8.2a2 2 0 011-1.7l6.5-3.7a2 2 0 012 0l6.5 3.7a2 2 0 011 1.7z" />
    <path d="M3.8 7.4L12 12l8.2-4.6M12 21V12" />
  </Base>
);

export const IconPerson = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.8" />
    <path d="M4.5 20.2a7.5 7.5 0 0115 0" />
  </Base>
);

export const IconBulb = (p: Props) => (
  <Base {...p}>
    <path d="M9.2 17.2a6.5 6.5 0 115.6 0v1.8a1.5 1.5 0 01-1.5 1.5h-2.6a1.5 1.5 0 01-1.5-1.5v-1.8z" />
    <path d="M9.8 20h4.4" />
  </Base>
);

export const IconDoc = (p: Props) => (
  <Base {...p}>
    <path d="M13.5 3.5H7a2.5 2.5 0 00-2.5 2.5v12A2.5 2.5 0 007 20.5h10a2.5 2.5 0 002.5-2.5V9.5l-6-6z" />
    <path d="M13.5 3.5v6h6M8.5 13.5h7M8.5 17h5" />
  </Base>
);

export const IconReceipt = (p: Props) => (
  <Base {...p}>
    <path d="M5 3.5h14v17l-2.3-1.5-2.4 1.5-2.3-1.5-2.4 1.5L7.3 19 5 20.5v-17z" />
    <path d="M9 8.5h6M9 12.5h6" />
  </Base>
);

export const IconCheckCircle = (p: Props) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.2l2.4 2.4 4.6-5" />
  </Base>
);
