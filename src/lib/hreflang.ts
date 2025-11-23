import { locales } from "@/i18n";

export interface HreflangLink {
  rel: "alternate";
  hreflang: string;
  href: string;
}

/**
 * Generate hreflang links for all supported locales for a given pathname
 */
export function generateHreflangLinks(pathname: string): HreflangLink[] {
  const links: HreflangLink[] = [];

  // Remove any existing locale prefix from the pathname
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
    const href = locale === "en" ? cleanPathname : `/${locale}${cleanPathname}`;
    links.push({
      rel: "alternate",
      hreflang: locale,
      href: `${process.env.NEXTAUTH_URL}${href}`,
    });
  }

  // Add x-default for the default (English) version
  const defaultHref = cleanPathname;
  links.push({
    rel: "alternate",
    hreflang: "x-default",
    href: `${process.env.NEXTAUTH_URL}${defaultHref}`,
  });

  return links;
}

/**
 * Get the canonical URL for SEO
 */
export function getCanonicalUrl(pathname: string, baseUrl?: string): string {
  const base = baseUrl || process.env.NEXTAUTH_URL || "https://pinacle.dev";
  return `${base}${pathname}`;
}

/**
 * Generate Next.js metadata alternates for hreflang
 * Returns an object suitable for the alternates.languages property
 */
export function generateHreflangAlternates(pathname: string, _currentLocale?: string) {
  const languages: Record<string, string> = {};

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
    const href = locale === "en" ? cleanPathname : `/${locale}${cleanPathname}`;
    languages[locale] = href;
  }

  return languages;
}

/**
 * Generate hreflang alternates for the current page based on locale
 */
export function generateHreflangForCurrentPage(currentPathname: string) {
  return generateHreflangAlternates(currentPathname);
}
