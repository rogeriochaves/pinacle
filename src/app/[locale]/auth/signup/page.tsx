"use client";

import { Check, Eye, EyeOff, Github } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
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
import { getUTMFromStorage } from "@/lib/analytics/utm";
import { api } from "@/lib/trpc/client";

function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("auth.signUp");
  const tCommon = useTranslations("common");

  const signUpMutation = api.auth.signUp.useMutation();

  const validatePassword = (password: string) => {
    const requirements = [
      { test: password.length >= 8, text: t("passwordRequirements.atLeast8") },
      { test: /[A-Z]/.test(password), text: t("passwordRequirements.oneUppercase") },
      { test: /[a-z]/.test(password), text: t("passwordRequirements.oneLowercase") },
      { test: /\d/.test(password), text: t("passwordRequirements.oneNumber") },
    ];
    return requirements;
  };

  const passwordRequirements = validatePassword(password);
  const isPasswordValid = passwordRequirements.every((req) => req.test);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isPasswordValid) {
      setError(t("errors.passwordRequirements"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("errors.passwordsDoNotMatch"));
      return;
    }

    try {
      // Get UTM parameters from session storage
      const utm = getUTMFromStorage();

      await signUpMutation.mutateAsync({
        name,
        email,
        password,
        ...(utm || {}),
      });

      // Auto sign in after successful registration
      const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t("errors.accountCreatedButSignInFailed"));
      } else {
        router.push(callbackUrl);
      }
    } catch (error) {
      setError(
        (error as Error).message || tCommon("error"),
      );
    }
  };

  const handleGithubSignIn = () => {
    // Get UTM parameters from session storage
    const utm = getUTMFromStorage();

    // Base callback URL
    let callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

    // Append UTM parameters to callback URL so they're preserved after OAuth
    if (utm) {
      const utmParams = new URLSearchParams();
      if (utm.utmSource) utmParams.set("utm_source", utm.utmSource);
      if (utm.utmMedium) utmParams.set("utm_medium", utm.utmMedium);
      if (utm.utmCampaign) utmParams.set("utm_campaign", utm.utmCampaign);
      if (utm.utmTerm) utmParams.set("utm_term", utm.utmTerm);
      if (utm.utmContent) utmParams.set("utm_content", utm.utmContent);

      const separator = callbackUrl.includes("?") ? "&" : "?";
      callbackUrl = `${callbackUrl}${separator}${utmParams.toString()}`;
    }

    signIn("github", { callbackUrl });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
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
            {t("title")}
          </h2>
          <p className="text-gray-400">
            {t("alreadyHaveAccount")}{" "}
            <Link
              href="/auth/signin"
              className="font-medium text-orange-500 hover:text-orange-400 underline"
            >
              {t("signIn")}
            </Link>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono font-bold">
              {t("getStartedFree")}
            </CardTitle>
            <CardDescription className="font-mono mb-4">
              {t("description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* GitHub Sign In */}
            <Button
              onClick={handleGithubSignIn}
              variant="outline"
              className="w-full font-mono"
            >
              <Github className="mr-2 h-4 w-4" />
              {t("withGitHub")}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-gray-500 font-mono">
                  {t("orContinueWith")}
                </span>
              </div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="name" className="font-mono">
                  {t("fullName")}
                </Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("enterFullName")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="font-mono">
                  {t("emailAddress")}
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("enterEmail")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="font-mono">
                  {t("password")}
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
                    placeholder={t("createPassword")}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>

                {/* Password Requirements */}
                {password && (
                  <div className="mt-2 space-y-1">
                    {passwordRequirements.map((req) => (
                      <div
                        key={req.text}
                        className={`flex items-center text-xs ${
                          req.test ? "text-green-600" : "text-gray-400"
                        }`}
                      >
                        <Check
                          className={`h-3 w-3 mr-2 ${
                            req.test ? "text-green-600" : "text-gray-300"
                          }`}
                        />
                        {req.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="font-mono">
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
                    placeholder={t("confirmYourPassword")}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-xs text-red-600">{t("errors.passwordsDoNotMatch")}</p>
                )}
              </div>

              <Button
                type="submit"
                variant="accent"
                className="w-full font-mono"
                disabled={
                  signUpMutation.isPending ||
                  !isPasswordValid ||
                  password !== confirmPassword
                }
              >
                {signUpMutation.isPending
                  ? t("creatingAccount")
                  : t("createAccountButton")}
              </Button>
            </form>

            <div className="text-xs text-gray-600 text-center">
              {t("termsPrefix")}
              <Link href="/terms" className="underline hover:text-gray-700">
                {t("termsOfService")}
              </Link>
              {t("and")}
              <Link href="/privacy" className="underline hover:text-gray-700">
                {t("privacyPolicy")}
              </Link>
              {t("termsSuffix")}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SignUpLoading() {
  const t = useTranslations("common");
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
        <p className="mt-2 text-gray-400">{t("loading")}</p>
      </div>
    </div>
  );
}

export default function SignUp() {
  return (
    <Suspense fallback={<SignUpLoading />}>
      <SignUpForm />
    </Suspense>
  );
}
