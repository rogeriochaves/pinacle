import type { Locale } from "@/i18n";

type EmailTranslations = {
  [key: string]: string | EmailTranslations;
};

// Helper to load email translations for a specific locale
export const getEmailTranslations = async (locale: Locale = "en") => {
  try {
    const messages = (await import(`../messages/${locale}.json`)).default;
    return messages.emails as EmailTranslations;
  } catch (error) {
    console.error(`Failed to load email translations for locale ${locale}:`, error);
    // Fallback to English
    const messages = (await import("../messages/en.json")).default;
    return messages.emails as EmailTranslations;
  }
};

// Helper to get a nested translation value
export const getEmailT = (
  translations: EmailTranslations,
  key: string,
  replacements?: Record<string, string | number>
): string => {
  const keys = key.split(".");
  let value: EmailTranslations | string = translations;

  for (const k of keys) {
    if (typeof value === "object" && k in value) {
      value = value[k] as EmailTranslations | string;
    } else {
      return key; // Return key if not found
    }
  }

  if (typeof value !== "string") {
    return key;
  }

  // Replace placeholders like {name}, {teamName}, etc.
  if (replacements) {
    return Object.entries(replacements).reduce(
      (str, [placeholder, replacement]) => {
        return str.replace(new RegExp(`\\{${placeholder}\\}`, "g"), String(replacement));
      },
      value
    );
  }

  return value;
};

