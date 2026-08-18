import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SnapAct",
  description: "Your screenshots, understood.",
  appleWebApp: { capable: true, title: "SnapAct", statusBarStyle: "default" },
};

/**
 * `viewport-fit=cover` lets the layout reach under the iPhone's home indicator,
 * which is what makes `env(safe-area-inset-*)` report real values. Zoom stays
 * enabled — disabling it is an accessibility failure, not a polish detail.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f8fa",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-[var(--background)] text-[var(--ink)]">{children}</body>
    </html>
  );
}
