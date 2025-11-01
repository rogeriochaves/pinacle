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
    async jwt({ token, user, account, profile, trigger, session }) {
      // Handle impersonation updates from client
      if (trigger === "update" && session?.impersonating !== undefined) {
        if (session.impersonating) {
          // Start impersonation
          token.impersonatingUserId = session.impersonatingUserId;
          token.realAdminId = token.id; // Save real admin ID
          console.log(
            `[Auth] Admin ${token.id} starting impersonation of user ${session.impersonatingUserId}`,
          );
        } else {
          // End impersonation
          console.log(
            `[Auth] Admin ${token.realAdminId} ending impersonation of user ${token.impersonatingUserId}`,
          );
          token.impersonatingUserId = undefined;
          token.realAdminId = undefined;
        }
      }

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

      // Store GitHub OAuth token
      if (account?.provider === "github") {
        token.githubAccessToken = account.access_token;
        token.githubId = account.providerAccountId;
        token.error = undefined; // Clear any previous errors
      }

      return token;
    },
    async session({ session, token }) {
      if (token.id && session.user) {
        // Check if admin is impersonating another user
        if (token.impersonatingUserId && token.realAdminId) {
          // Fetch impersonated user's data
          const [impersonatedUser] = await db
            .select()
            .from(users)
            .where(eq(users.id, token.impersonatingUserId as string))
            .limit(1);

          if (impersonatedUser) {
            // Replace session with impersonated user
            session.user.id = impersonatedUser.id;
            session.user.email = impersonatedUser.email;
            session.user.name = impersonatedUser.name;
            session.user.image = impersonatedUser.image;
            // Store admin info for audit and exit
            session.user.isImpersonating = true;
            session.user.realAdminId = token.realAdminId as string;
          }
        } else {
          // Normal session
          session.user.id = token.id;
          session.user.githubAccessToken = token.githubAccessToken;
          session.user.githubId = token.githubId;
          session.user.isImpersonating = false;
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
