import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";
import { z } from "zod";
import { db } from "./db";
import { teamMembers, teams, users } from "./db/schema";
import { sendWelcomeEmail } from "./email";
import { generateKSUID } from "./utils";

// Helper function to ensure every user has a personal team
async function ensureUserHasPersonalTeam(
  userId: string,
  username: string,
  displayName?: string | null,
): Promise<boolean> {
  try {
    // Check if user already has teams
    const existingTeams = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId))
      .limit(1);

    if (existingTeams.length === 0) {
      const teamName = `${displayName || username}'s Team`;
      const slugifiedUsername = username
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      const teamSlug = `${slugifiedUsername}-team-${generateKSUID("team").slice(5)}`;

      const [team] = await db
        .insert(teams)
        .values({
          name: teamName,
          slug: teamSlug,
          description: `Personal team for ${displayName || username}`,
          ownerId: userId,
        })
        .returning();

      // Add user as team owner
      await db.insert(teamMembers).values({
        teamId: team.id,
        userId: userId,
        role: "owner",
      });

      console.log(
        `Successfully created personal team ${team.id} for user ${userId}`,
      );

      return true; // Indicates this is a new user
    }

    return false; // User already had a team
  } catch (error) {
    console.error(`Failed to ensure personal team for user ${userId}:`, error);
    throw error;
  }
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/auth/signin",
  },
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope: "read:user user:email",
        },
      },
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const { email, password } = loginSchema.parse(credentials);

        const user = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user[0] || !user[0].password) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user[0].password);

        if (!isValid) {
          return null;
        }

        return {
          id: user[0].id,
          email: user[0].email,
          name: user[0].name,
          image: user[0].image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile, trigger }) {
      // Initial sign in
      if (user) {
        token.id = user.id;

        // Ensure personal team exists (user is guaranteed to exist in DB at this point)
        if (account?.provider === "github" && profile) {
          console.log("Creating personal team for GitHub user:", user.id);
          const githubLogin =
            typeof profile === "object" &&
            profile !== null &&
            "login" in profile
              ? String((profile as Record<string, unknown>).login)
              : user.name || "user";
          const isNewUser = await ensureUserHasPersonalTeam(
            user.id,
            githubLogin,
            profile.name,
          );

          // Send welcome email for new GitHub OAuth users
          if (isNewUser && user.email) {
            try {
              const baseUrl =
                process.env.NEXTAUTH_URL || "http://localhost:3000";
              const dashboardUrl = `${baseUrl}/dashboard`;

              await sendWelcomeEmail({
                to: user.email,
                name: user.name || githubLogin,
                dashboardUrl,
              });

              console.log(`Welcome email sent to GitHub user: ${user.email}`);
            } catch (error) {
              console.error(
                `Failed to send welcome email to ${user.email}:`,
                error,
              );
              // Don't throw - email failure shouldn't block authentication
            }
          }
        } else if (user.name) {
          console.log("Creating personal team for credentials user:", user.id);
          await ensureUserHasPersonalTeam(user.id, user.name, user.name);
        }
      }

      // Store GitHub OAuth token and expiry
      if (account?.provider === "github") {
        token.githubAccessToken = account.access_token;
        token.githubId = account.providerAccountId;
        
        // GitHub OAuth tokens from orgs with expiration policies typically expire in 8 hours
        // We'll be conservative and assume 8 hours, then validate proactively
        // expires_in is in seconds if provided, otherwise default to 8 hours
        const expiresIn = account.expires_at 
          ? account.expires_at * 1000 // Convert to milliseconds
          : Date.now() + 8 * 60 * 60 * 1000; // 8 hours from now
        
        token.githubAccessTokenExpires = expiresIn;
        token.error = undefined; // Clear any previous errors
        
        console.log(`[Auth] Stored GitHub token, expires at: ${new Date(expiresIn).toISOString()}`);
      }

      // Check if token needs validation (on subsequent requests)
      if (token.githubAccessToken && trigger !== "signIn" && trigger !== "signUp") {
        const now = Date.now();
        const expiresAt = token.githubAccessTokenExpires || 0;
        const timeUntilExpiry = expiresAt - now;
        const oneHour = 60 * 60 * 1000;

        // If token expires in less than 1 hour, validate it
        if (timeUntilExpiry < oneHour) {
          console.log(`[Auth] Token expires soon (${Math.round(timeUntilExpiry / 1000 / 60)} minutes), validating...`);
          
          try {
            const { checkGitHubTokenValidity } = await import("./github-helpers");
            const validation = await checkGitHubTokenValidity(token.githubAccessToken as string);
            
            if (!validation.valid) {
              console.error("[Auth] GitHub token is invalid:", validation.error);
              token.error = "github_token_expired";
              // Keep the token for now - the UI will prompt re-auth
            } else {
              console.log("[Auth] GitHub token is still valid");
              // Extend expiry by 8 hours since it's still valid
              token.githubAccessTokenExpires = Date.now() + 8 * 60 * 60 * 1000;
            }
          } catch (error) {
            console.error("[Auth] Error validating GitHub token:", error);
            // Don't mark as error on network issues - give benefit of doubt
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id;
        session.user.githubAccessToken = token.githubAccessToken;
        session.user.githubId = token.githubId;
        
        // Pass error flag to session so UI can handle re-auth
        if (token.error === "github_token_expired") {
          session.error = "github_token_expired";
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 12);
};
