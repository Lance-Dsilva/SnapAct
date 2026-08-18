import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * The single gate for the website.
 *
 * Everything is private by default; the exceptions below are deliberate and each
 * carries its own protection:
 *   /lock, /api/auth/*   the door itself, rate limited server-side
 *   /api/shortcut/*      authenticated by the X-SnapAct-Key header instead,
 *                        because an iPhone Shortcut cannot hold a session cookie
 */
const PUBLIC_PATHS = ["/lock", "/api/auth/unlock", "/api/shortcut", "/_next", "/favicon"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const authorized = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (authorized) return NextResponse.next();

  // An API call gets JSON it can act on; a page gets sent to the keypad.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Locked. Unlock SnapAct first." }, { status: 401 });
  }

  const lock = request.nextUrl.clone();
  lock.pathname = "/lock";
  lock.search = "";
  if (pathname !== "/") lock.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(lock);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
