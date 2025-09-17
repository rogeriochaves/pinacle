import { randomUUID } from "node:crypto";

import Link from "next/link";
import { redirect } from "next/navigation";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { provisionDefaultTeamForUser } from "@/server/auth/utils";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

const schema = z.object({
  name: z.string().min(2, "Please enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignUpSearchParams = {
  error?: string;
};

async function createAccount(formData: FormData) {
  "use server";

  const result = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.success) {
    const firstMessage = Object.values(result.error.flatten().fieldErrors)
      .flat()
      .filter(Boolean)[0];
    redirect(`/signup?error=${encodeURIComponent(firstMessage ?? "Invalid form data")}`);
  }

  const data = result.data;
  const email = data.email.toLowerCase();

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    redirect("/signup?error=An account with that email already exists");
  }

  const hashedPassword = await hash(data.password, 12);

  const [user] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      name: data.name,
      email,
      hashedPassword,
    })
    .returning();

  if (!user) {
    redirect("/signup?error=Unable to create account. Please try again.");
  }

  await provisionDefaultTeamForUser(user);

  redirect("/signin?created=1");
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<SignUpSearchParams>;
}) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-md border-border/70">
        <CardHeader className="space-y-3 text-center">
          <CardTitle className="text-2xl font-semibold">Create your Pinacle account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Spin up AI-ready pods in minutes. Already have an account?{" "}
            <Link href="/signin" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
            .
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {params?.error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {decodeURIComponent(params.error)}
            </div>
          ) : null}
          <form className="space-y-4" action={createAccount}>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Your name" required autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="At least 8 characters"
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full">
              Create account
            </Button>
          </form>
          <div className="pt-4 text-center text-xs text-muted-foreground">
            By creating an account you agree to our future terms. We will prompt you once they are live.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
