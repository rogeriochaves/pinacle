import { eq } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "../../auth";
import { teamMembers, teams, users } from "../../db/schema";
import { createTRPCRouter, publicProcedure } from "../server";

const signUpSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export const authRouter = createTRPCRouter({
  signUp: publicProcedure
    .input(signUpSchema)
    .mutation(async ({ ctx, input }) => {
      const { name, email, password } = input;

      // Check if user already exists
      const existingUser = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        throw new Error("User with this email already exists");
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user
      const [user] = await ctx.db
        .insert(users)
        .values({
          name,
          email,
          password: hashedPassword,
        })
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
        });

      // Create personal team for the new user
      try {
        const teamName = `${name}'s Team`;
        const teamSlug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-team`;

        const [team] = await ctx.db
          .insert(teams)
          .values({
            name: teamName,
            slug: teamSlug,
            description: `Personal team for ${name}`,
            ownerId: user.id,
          })
          .returning();

        // Add user as team owner
        await ctx.db.insert(teamMembers).values({
          teamId: team.id,
          userId: user.id,
          role: "owner",
        });

        console.log(`Created personal team ${team.id} for new user ${user.id}`);
      } catch (error) {
        console.error(
          `Failed to create personal team for new user ${user.id}:`,
          error,
        );
        // Don't throw error here - user creation should succeed even if team creation fails
      }

      return user;
    }),
});
