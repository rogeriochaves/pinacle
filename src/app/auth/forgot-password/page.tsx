"use client";

import Image from "next/image";
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
      <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center">
            <Link
              href="/"
              className="flex items-center justify-center space-x-2 mb-12"
            >
              <Image
                src="/logo.png"
                alt="Pinacle Logo"
                className="h-10 w-10"
                width={40}
                height={40}
              />
              <span className="font-bold font-mono text-2xl text-white">
                pinacle
              </span>
            </Link>
            <h2 className="text-3xl font-bold font-mono text-white mb-3">
              Check your email
            </h2>
            <p className="text-gray-400">
              We sent you password reset instructions
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-mono font-bold">
                Email sent
              </CardTitle>
              <CardDescription className="font-mono mb-4">
                If an account exists with that email, we sent password reset
                instructions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                The link expires in 1 hour. Check your spam folder if you don't
                see it.
              </p>
              <Link href="/auth/signin" className="block">
                <Button variant="accent" className="w-full font-mono">
                  Back to sign in
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link
            href="/"
            className="flex items-center justify-center space-x-2 mb-12"
          >
            <Image
              src="/logo.png"
              alt="Pinacle Logo"
              className="h-10 w-10"
              width={40}
              height={40}
            />
            <span className="font-bold font-mono text-2xl text-white">
              pinacle
            </span>
          </Link>
          <h2 className="text-3xl font-bold font-mono text-white mb-3">
            Forgot password
          </h2>
          <p className="text-gray-400">
            Enter your email and we'll send you a reset link
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono font-bold">
              Reset password
            </CardTitle>
            <CardDescription className="font-mono mb-4">
              We'll email you instructions to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-mono">
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                />
              </div>

              <Button
                type="submit"
                variant="accent"
                className="w-full font-mono"
                disabled={requestResetMutation.isPending}
              >
                {requestResetMutation.isPending
                  ? "Sending..."
                  : "Send reset link"}
              </Button>

              <div className="text-center">
                <Link
                  href="/auth/signin"
                  className="font-mono text-sm text-orange-500 hover:text-orange-400 underline"
                >
                  Back to sign in
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

