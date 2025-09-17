'use client';

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignInForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const emailValue = formData.get("email")?.toString() ?? "";
    const passwordValue = formData.get("password")?.toString() ?? "";

    startTransition(async () => {
      const result = await signIn("credentials", {
        email: emailValue,
        password: passwordValue,
        redirect: false,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      window.location.href = "/dashboard";
    });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
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
          placeholder="Your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="text-center text-xs text-muted-foreground">or</div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
      >
        Continue with GitHub
      </Button>
    </form>
  );
}
