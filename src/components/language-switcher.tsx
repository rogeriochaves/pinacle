"use client";

import { Globe } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { defaultLocale, type Locale, localeNames, locales } from "@/i18n";

export const LanguageSwitcher = () => {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("footer");

  const switchLocale = (newLocale: Locale) => {
    if (newLocale === locale) return;

    // Remove current locale prefix if it exists (including /en)
    let path = pathname;
    for (const loc of locales) {
      if (path.startsWith(`/${loc}/`) || path === `/${loc}`) {
        path = path.slice(`/${loc}`.length) || "/";
        break;
      }
    }

    // Add new locale prefix (including for English to /en)
    const newPath =
      newLocale === defaultLocale ? `/en${path}` : `/${newLocale}${path}`;
    router.push(newPath);
  };

  return (
    <Select
      value={locale}
      onValueChange={(value) => switchLocale(value as Locale)}
    >
      <SelectTrigger
        className="w-[140px] gap-2 text-white relative"
        aria-label={t("selectLanguage")}
      >
        <Globe className="h-4 w-4" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent >
        {locales.map((loc) => (
          <SelectItem key={loc} value={loc}>
            {localeNames[loc]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
