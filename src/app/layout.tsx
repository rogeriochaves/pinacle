import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Providers } from "../lib/providers";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pinacle - Vibe Coding VMs",
  description:
    "Spin up lightweight VMs with Claude Code, Vibe Kanban, and VS Code for seamless AI-powered development.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jetbrainsMono.variable} font-mono antialiased`}>
        <Providers>
          <ImpersonationBanner />
          {children}
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
