import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "../globals.css";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/lib/providers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { locales } from "@/i18n";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pinacle - Vibe Coding VMs",
  description:
    "Spin up lightweight VMs with Claude Code, Vibe Kanban, and VS Code for seamless AI-powered development.",
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const messages = await getMessages({ locale });

  return (
    <html lang={locale}>
      <body className={`${jetbrainsMono.variable} font-mono antialiased`}>
        <GoogleAnalytics />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <ImpersonationBanner />
            {children}
          </Providers>
        </NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
