'use client';

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

import { ThemeProvider } from "@/components/theme-provider";
import { TRPCProvider } from "@/trpc/provider";

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider session={session}>
      <TRPCProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </TRPCProvider>
    </SessionProvider>
  );
}
