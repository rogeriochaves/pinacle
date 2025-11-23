"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export const CTA = () => {
  const t = useTranslations("cta");

  return (
    <section className="bg-white py-16 sm:py-20 border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
        <h2 className="text-2xl font-bold font-mono tracking-tight text-foreground sm:text-3xl mb-6">
          {t("title")}
        </h2>
        <Button variant="accent" size="lg" asChild>
          <Link href="/auth/signup" className="font-mono">
            {t("getStarted")}
          </Link>
        </Button>
      </div>
    </section>
  );
};

