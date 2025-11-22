"use client";

import { Eye, EyeOff, Github } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import { getUTMFromStorage } from "../../../lib/analytics/utm";
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

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Handle OAuth errors from URL parameters
  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) {
      switch (urlError) {
        case "OAuthAccountNotLinked":
          setError(
            "An account with this email already exists. Please sign in with your email and password below, or use a different GitHub account.",
          );
          break;
        case "OAuthSignin":
          setError(
            "There was an error signing in with the OAuth provider. Please try again.",
          );
          break;
        case "OAuthCallback":
          setError(
            "There was an error during the OAuth callback. Please try again.",
          );
          break;
        case "OAuthCreateAccount":
          setError(
            "Could not create OAuth account. Please try again or contact support.",
          );
          break;
        case "EmailCreateAccount":
          setError("Could not create account. Please try again.");
          break;
        case "Callback":
          setError(
            "There was an error during authentication. Please try again.",
          );
          break;
        case "OAuthCallbackError":
          setError("OAuth provider returned an error. Please try again.");
          break;
        case "SessionRequired":
          setError("You must be signed in to access this page.");
          break;
        default:
          setError("An authentication error occurred. Please try again.");
      }
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid credentials");
      } else {
        // Check if session was created successfully
        const session = await getSession();
        if (session) {
          router.push(callbackUrl);
        }
      }
    } catch {
      setError("An error occurred during sign in");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGithubSignIn = () => {
    // Get UTM parameters from session storage or URL
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
            Sign in to your account
          </h2>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono font-bold">Welcome back</CardTitle>
            <CardDescription className="font-mono mb-4">
              Sign in to access your development environments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* GitHub Sign In */}
            <Button
              onClick={handleGithubSignIn}
              variant="outline"
              className="w-full font-mono"
              disabled={isLoading}
            >
              <Github className="mr-2 h-4 w-4" />
              Sign in with GitHub
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-gray-500 font-mono">
                  or continue with
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
                <Label htmlFor="email" className="font-mono">
                  Email address
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

              <div className="space-y-2">
                <Label htmlFor="password" className="font-mono">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
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
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <Link
                    href="/auth/forgot-password"
                    className="font-mono text-orange-600 hover:text-orange-700 underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
              </div>

              <Button
                type="submit"
                variant="accent"
                className="w-full font-mono"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-sm text-gray-400">
            Don't have an account yet?{" "}
            <Link
              href="/auth/signup"
              className="font-medium text-orange-500 hover:text-orange-400 underline"
            >
              Create your account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-2 text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}
