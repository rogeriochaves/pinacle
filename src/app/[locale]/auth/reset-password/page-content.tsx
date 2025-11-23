"use client";

import { Check, Code, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { LoadingFallback } from "@/components/loading-fallback";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/trpc/client";

function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("auth.resetPassword");
  const tSignUp = useTranslations("auth.signUp");

  const token = searchParams.get("token");

  const resetMutation = api.auth.resetPassword.useMutation();

  const validatePassword = (password: string) => {
    const requirements = [
      { test: password.length >= 8, text: tSignUp("passwordRequirements.atLeast8") },
      { test: /[A-Z]/.test(password), text: tSignUp("passwordRequirements.oneUppercase") },
      { test: /[a-z]/.test(password), text: tSignUp("passwordRequirements.oneLowercase") },
      { test: /\d/.test(password), text: tSignUp("passwordRequirements.oneNumber") },
    ];
    return requirements;
  };

  const passwordRequirements = validatePassword(password);
  const isPasswordValid = passwordRequirements.every((req) => req.test);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError(t("invalidResetLink"));
      return;
    }

    if (!isPasswordValid) {
      setError(t("errors.passwordRequirements"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("errors.passwordsDoNotMatch"));
      return;
    }

    try {
      await resetMutation.mutateAsync({ token, password });
      setSuccess(true);
      setTimeout(() => {
        router.push("/auth/signin");
      }, 3000);
    } catch (error) {
      setError((error as Error).message || t("errorOccurred"));
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
                {t("invalidLink")}
              </CardTitle>
              <CardDescription>
                {t("invalidLinkDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/auth/forgot-password">
                <Button variant="accent" className="w-full font-mono font-bold">
                  {t("requestNewLink")}
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
                {t("passwordResetSuccess")}
              </CardTitle>
              <CardDescription>
                {t("passwordResetSuccessDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {t("redirecting")}
              </p>
              <Link href="/auth/signin">
                <Button variant="accent" className="w-full font-mono font-bold">
                  {t("goToSignIn")}
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
              {t("title")}
            </CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
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
                  {t("newPassword")}
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
                    placeholder={t("enterNewPassword")}
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
                  {t("confirmPassword")}
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
                    placeholder={t("confirmNewPassword")}
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
                  ? t("resetting")
                  : t("resetButton")}
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

