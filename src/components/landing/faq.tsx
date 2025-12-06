"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export const FAQ = () => {
  const t = useTranslations("faq");

  // Desktop order
  const faqsDesktop = [
    { key: "howDoesItWork" },
    { key: "whatIsIncluded" },
    { key: "isDataProtected" },
    { key: "isItForMe" },
    { key: "privateRepos" },
    { key: "billing" },
    { key: "installDependencies" },
    { key: "stopPod" },
    { key: "multipleServices" },
    { key: "configuration" },
  ];

  // Mobile order: "isItForMe" before "isDataProtected"
  const faqsMobile = [
    { key: "howDoesItWork" },
    { key: "whatIsIncluded" },
    { key: "isItForMe" },
    { key: "isDataProtected" },
    { key: "privateRepos" },
    { key: "billing" },
    { key: "installDependencies" },
    { key: "stopPod" },
    { key: "multipleServices" },
    { key: "configuration" },
  ];

  return (
    <section className="bg-gray-50 py-16 sm:py-24 border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold font-mono tracking-tight text-foreground sm:text-3xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-base text-muted-foreground font-mono">
            {t("contactPrefix")}
            <Link
              href="mailto:hello@pinacle.dev"
              className="text-orange-600 hover:text-orange-700 underline"
            >
              {t("reachOut")}
            </Link>
            {t("contactSuffix")}
          </p>
        </div>

        {/* FAQ Columns - fluid masonry layout */}
        {/* Desktop version */}
        <div className="hidden lg:block columns-1 md:columns-2 lg:columns-3 gap-8 space-y-8">
          {faqsDesktop.map((faq) => {
            const questionKey = `questions.${faq.key}.question`;
            const answerKey = `questions.${faq.key}.answer`;
            return (
              <div key={faq.key} className="break-inside-avoid mb-8">
                <h3 className="text-base font-bold font-mono text-foreground mb-3">
                  {t(questionKey)}
                </h3>
                <div className="text-sm text-muted-foreground font-mono leading-relaxed whitespace-pre-line">
                  {t(answerKey)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Mobile/Tablet version */}
        <div className="lg:hidden columns-1 md:columns-2 gap-8 space-y-8">
          {faqsMobile.map((faq) => {
            const questionKey = `questions.${faq.key}.question`;
            const answerKey = `questions.${faq.key}.answer`;
            return (
              <div key={faq.key} className="break-inside-avoid mb-8">
                <h3 className="text-base font-bold font-mono text-foreground mb-3">
                  {t(questionKey)}
                </h3>
                <div className="text-sm text-muted-foreground font-mono leading-relaxed whitespace-pre-line">
                  {t(answerKey)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
