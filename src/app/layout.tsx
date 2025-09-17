import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";
import { auth } from "@/server/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pinacle · Long-running AI dev environments",
  description:
    "Spin up dedicated vibe coding pods with Claude Code, Vibe Kanban, and Code Server running 24/7 in secure micro-VMs.",
  metadataBase: new URL("https://pinacle.dev"),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          geistSans.variable,
          geistMono.variable,
        )}
      >
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
