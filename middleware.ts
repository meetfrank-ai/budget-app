import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "budget_session";

// Paths that must stay open so the user can actually log in, plus static
// asset paths Next serves directly.
const PUBLIC_PREFIXES = ["/login", "/_next/", "/icons/", "/images/"];
const PUBLIC_FILES = new Set([
  "/favicon.ico",
  "/manifest.json",
  "/robots.txt",
  "/sitemap.xml",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_FILES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const secret = process.env.APP_SESSION_SECRET;
  if (!secret) {
    // Fail closed: if the secret isn't set, the app is not safe to serve.
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("err", "config");
    return NextResponse.redirect(url);
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      // fall through to redirect
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname + (search ?? ""));
  return NextResponse.redirect(url);
}

export const config = {
  // Match everything except internal Next paths the matcher can't observe
  // anyway. We do the fine-grained public-path check inside the handler.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
