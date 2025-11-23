import { getRequestConfig } from "next-intl/server";

// Supported locales
export const locales = ["en", "zh", "es", "ru", "pt", "de", "ja", "fr"] as const;
export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "中文",
  es: "Español",
  ru: "Русский",
  pt: "Português",
  de: "Deutsch",
  ja: "日本語",
  fr: "Français",
};

export const defaultLocale: Locale = "en";

export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid
  const validatedLocale = (locale && locales.includes(locale as Locale) ? locale : defaultLocale) as Locale;

  return {
    locale: validatedLocale,
    messages: (await import(`./messages/${validatedLocale}.json`)).default,
  };
});

