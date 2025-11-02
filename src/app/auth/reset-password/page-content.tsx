"use client";

import { Check, Code, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LoadingFallback } from "../../../components/loading-fallback";
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

const validatePassword = (password: string) => {
  const requirements = [
    { test: password.length >= 8, text: "At least 8 characters" },
    { test: /[A-Z]/.test(password), text: "One uppercase letter" },
    { test: /[a-z]/.test(password), text: "One lowercase letter" },
    { test: /\d/.test(password), text: "One number" },
  ];
  return requirements;
};

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = searchParams.get("token");

  const resetMutation = api.auth.resetPassword.useMutation();

  const passwordRequirements = validatePassword(password);
  const isPasswordValid = passwordRequirements.every((req) => req.test);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Invalid reset link");
      return;
    }

    if (!isPasswordValid) {
      setError("Please meet all password requirements");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      await resetMutation.mutateAsync({ token, password });
      setSuccess(true);
      setTimeout(() => {
        router.push("/auth/signin");
      }, 3000);
    } catch (error) {
      setError((error as Error).message || "An error occurred");
    }
  };

  if (!token) {
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
                INVALID LINK
              </CardTitle>
              <CardDescription>
                This password reset link is invalid or has expired.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/auth/forgot-password">
                <Button variant="accent" className="w-full font-mono font-bold">
                  REQUEST NEW LINK
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (success) {
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
                PASSWORD RESET
              </CardTitle>
              <CardDescription>
                Your password has been reset successfully
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Redirecting to sign in...
              </p>
              <Link href="/auth/signin">
                <Button variant="accent" className="w-full font-mono font-bold">
                  GO TO SIGN IN
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
              RESET PASSWORD
            </CardTitle>
            <CardDescription>Enter your new password below</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded-sm bg-red-50 border border-red-200 text-red-800 text-sm font-mono">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="password" className="font-mono font-bold">
                  NEW PASSWORD
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="ENTER YOUR NEW PASSWORD"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 right-0 h-full w-10"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {password && (
                  <div className="mt-2 space-y-1 text-xs">
                    {passwordRequirements.map((req) => (
                      <div
                        key={req.text}
                        className={`flex items-center gap-2 ${
                          req.test ? "text-green-600" : "text-muted-foreground"
                        }`}
                      >
                        <Check
                          className={`h-3 w-3 ${req.test ? "opacity-100" : "opacity-30"}`}
                        />
                        {req.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="confirmPassword"
                  className="font-mono font-bold"
                >
                  CONFIRM PASSWORD
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="CONFIRM YOUR NEW PASSWORD"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute inset-y-0 right-0 h-full w-10"
                    onClick={() =>
                      setShowConfirmPassword(!showConfirmPassword)
                    }
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                variant="accent"
                className="w-full font-mono font-bold"
                disabled={resetMutation.isPending || !isPasswordValid}
              >
                {resetMutation.isPending
                  ? "RESETTING..."
                  : "RESET PASSWORD"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}

