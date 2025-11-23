import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { locales } from "./src/i18n";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export default function middleware(request: NextRequest) {
  // Add the current pathname to headers so layouts can access it
  const response = intlMiddleware(request);

  if (response) {
    // Clone the response to add custom headers
    const newResponse = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    // Add the pathname header
    newResponse.headers.set("x-pathname", request.nextUrl.pathname);

    // Copy over any headers from the intl middleware response
    if (response.headers) {
      response.headers.forEach((value, key) => {
        newResponse.headers.set(key, value);
      });
    }

    return newResponse;
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
