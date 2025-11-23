import { locales } from "@/i18n";

/**
 * Generate Next.js metadata alternates for hreflang
 * Returns an object suitable for the alternates.languages property
 */
export function generateHreflangAlternates(pathname: string, _currentLocale?: string) {
  const languages: Record<string, string> = {};
  const baseUrl = process.env.NEXTAUTH_URL || "https://pinacle.dev";

  // Remove any existing locale prefix from the pathname to get the clean path
  let cleanPathname = pathname;
  for (const locale of locales) {
    if (cleanPathname.startsWith(`/${locale}/`)) {
      cleanPathname = cleanPathname.slice(`/${locale}`.length) || "/";
      break;
    } else if (cleanPathname === `/${locale}`) {
      cleanPathname = "/";
      break;
    }
  }

  // Generate hreflang links for each locale
  for (const locale of locales) {
    const href = locale === "en" ? `${baseUrl}${cleanPathname}` : `${baseUrl}/${locale}${cleanPathname}`;
    languages[locale] = href;
  }

  return languages;
}
