"use client";

import { Code } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { api } from "../../../lib/trpc/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const requestResetMutation = api.auth.requestPasswordReset.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      await requestResetMutation.mutateAsync({ email });
      setSubmitted(true);
    } catch (error) {
      setError((error as Error).message || "An error occurred");
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 font-mono font-bold text-2xl"
            >
              <Code size={32} />
              PINACLE
            </Link>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-mono font-bold">
                CHECK YOUR EMAIL
              </CardTitle>
              <CardDescription>
                If an account exists with that email, we sent password reset
                instructions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                The link expires in 1 hour. Check your spam folder if you don't
                see it.
              </p>
              <Link href="/auth/signin">
                <Button variant="outline" className="w-full font-mono font-bold">
                  BACK TO SIGN IN
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-mono font-bold text-2xl"
          >
            <Code size={32} />
            PINACLE
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono font-bold">
              FORGOT PASSWORD
            </CardTitle>
            <CardDescription>
              Enter your email and we'll send you a reset link
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded-sm bg-red-50 border border-red-200 text-red-800 text-sm font-mono">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-mono font-bold">
                  EMAIL
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="YOUR@EMAIL.COM"
                />
              </div>

              <Button
                type="submit"
                variant="accent"
                className="w-full font-mono font-bold"
                disabled={requestResetMutation.isPending}
              >
                {requestResetMutation.isPending
                  ? "SENDING..."
                  : "SEND RESET LINK"}
              </Button>

              <div className="text-center">
                <Link
                  href="/auth/signin"
                  className="font-mono text-sm text-orange-600 hover:text-orange-700 underline"
                >
                  BACK TO SIGN IN
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

