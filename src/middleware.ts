import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { defaultLocale, locales } from "./i18n";

const intlMiddleware = createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,

  // Don't use locale prefix for default locale
  localePrefix: "as-needed",

  // Automatically detect user's preferred locale
  localeDetection: true,
});

export default function middleware(request: NextRequest) {
  // Add the current pathname to headers so layouts can access it
  const response = intlMiddleware(request);

  response.headers.set("x-pathname", request.nextUrl.pathname);

  return response;
}

export const config = {
  // Match all pathnames except for
  // - API routes
  // - _next (Next.js internals)
  // - static files
  // - sitemap.xml and robots.txt
  matcher: ["/((?!api|_next|sitemap\\.xml|robots\\.txt|.*\\..*).*)"],
};
