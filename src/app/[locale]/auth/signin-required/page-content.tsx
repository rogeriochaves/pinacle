"use client";

import { ArrowLeft, LogIn } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SignInRequired() {
  const searchParams = useSearchParams();
  const podSlug = searchParams.get("pod");
  const returnUrl = searchParams.get("return_url");
  const t = useTranslations("auth.signInRequired");

  const handleSignIn = () => {
    // After sign in, redirect back to the pod URL which will trigger the auth flow
    signIn(undefined, {
      callbackUrl: returnUrl || "/dashboard",
    });
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
          <h1 className="text-3xl font-bold font-mono text-white mb-3">
            {t("title")}
          </h1>
          <p className="text-gray-400">
            {t("subtitle")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono font-bold">{t("accessPod")}</CardTitle>
            {podSlug && (
              <CardDescription className="font-mono mb-4">
                {t("requestingAccess")}{" "}
                <span className="font-bold text-gray-900">{podSlug}</span>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleSignIn}
              variant="accent"
              className="w-full font-mono"
            >
              <LogIn className="w-4 h-4 mr-2" />
              {t("signIn")}
            </Button>

            <Link href="/" className="block">
              <Button variant="outline" className="w-full font-mono">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("backToHome")}
              </Button>
            </Link>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-gray-500 font-mono">
                  {t("or")}
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-600 text-center">
              {t("noAccount")}{" "}
              <button
                type="button"
                onClick={handleSignIn}
                className="font-medium text-orange-600 hover:text-orange-700 underline"
              >
                {t("signUpNow")}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
