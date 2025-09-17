import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "@/components/sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const params = await searchParams;
  const showCreatedMessage = params?.created === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-md border-border/70">
        <CardHeader className="space-y-3 text-center">
          <CardTitle className="text-2xl font-semibold">Welcome back</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sign in to manage your Pinacle pods. New here?{" "}
            <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
              Create an account
            </Link>
            .
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {showCreatedMessage ? (
            <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
              Account created successfully. Sign in to continue.
            </div>
          ) : null}
          <SignInForm />
        </CardContent>
      </Card>
    </div>
  );
}
