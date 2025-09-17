import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth, { type NextAuthOptions, getServerSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import { compare } from "bcryptjs";

import { env } from "@/env";
import { db } from "@/server/db";
import { accounts, sessions, users, verificationTokens } from "@/server/db/schema";
import { provisionDefaultTeamForUser } from "@/server/auth/utils";

const providers: NextAuthOptions["providers"] = [
  Credentials({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email", placeholder: "you@example.com" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials.password) {
        return null;
      }

      const email = credentials.email.toLowerCase();
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });

      if (!user?.hashedPassword) {
        return null;
      }

      const isValid = await compare(credentials.password, user.hashedPassword);
      if (!isValid) {
        return null;
      }

      return user;
    },
  }),
];

if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    }),
  );
}

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db, {
    users,
    accounts,
    sessions,
    verificationTokens,
  }),
  secret: env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/signin",
  },
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        const defaultTeamId =
          typeof user === "object" && user && "defaultTeamId" in user
            ? (user as Record<string, unknown>).defaultTeamId
            : null;
        token.defaultTeamId = (defaultTeamId as string | null) ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.defaultTeamId = (token.defaultTeamId as string | null) ?? null;
      }
      return session;
    },
  },
  events: {
    async createUser(message) {
      await provisionDefaultTeamForUser(message.user as typeof users.$inferSelect);
    },
  },
};

export const { handlers, signIn, signOut } = NextAuth(authOptions);

export const auth = () => getServerSession(authOptions);
