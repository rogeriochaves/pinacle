"use client";

import { ArrowLeft, LogIn } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
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
            Sign in required
          </h1>
          <p className="text-gray-400">
            You need to be signed in to access this pod
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono font-bold">Access pod</CardTitle>
            {podSlug && (
              <CardDescription className="font-mono mb-4">
                Requesting access to:{" "}
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
              Sign in
            </Button>

            <Link href="/" className="block">
              <Button variant="outline" className="w-full font-mono">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to home
              </Button>
            </Link>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-gray-500 font-mono">
                  or
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-600 text-center">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={handleSignIn}
                className="font-medium text-orange-600 hover:text-orange-700 underline"
              >
                Sign up now
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
