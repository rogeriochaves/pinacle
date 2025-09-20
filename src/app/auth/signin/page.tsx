"use client";

import { Code, Eye, EyeOff, Github } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
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

export default function SignIn() {
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
          router.push("/dashboard");
        }
      }
    } catch {
      setError("An error occurred during sign in");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGithubSignIn = () => {
    signIn("github", { callbackUrl: "/dashboard" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <Link
            href="/"
            className="flex items-center justify-center space-x-2 mb-6"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-orange-200 border-2 border-border-contrast">
              <Code className="h-4 w-4 text-orange-900" />
            </div>
            <span className="font-bold font-mono text-2xl text-foreground">
              PINACLE
            </span>
          </Link>
          <h2 className="text-3xl font-bold font-mono text-foreground">
            SIGN IN TO YOUR ACCOUNT
          </h2>
          <p className="mt-2 text-sm font-mono text-muted-foreground">
            OR{" "}
            <Link
              href="/auth/signup"
              className="font-bold text-orange-600 hover:text-orange-700 underline"
            >
              CREATE A NEW ACCOUNT
            </Link>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono font-bold">WELCOME BACK</CardTitle>
            <CardDescription className="font-mono">
              Sign in to access your development environments
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* GitHub Sign In */}
            <Button
              onClick={handleGithubSignIn}
              variant="outline"
              className="w-full font-mono font-bold"
              disabled={isLoading}
            >
              <Github className="mr-2 h-4 w-4" />
              SIGN IN WITH GITHUB
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t-2 border-border-contrast" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground font-mono font-bold">
                  OR CONTINUE WITH
                </span>
              </div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg
                        className="h-5 w-5 text-red-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-red-800">
                        {error}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="font-mono font-bold">
                  EMAIL ADDRESS
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ENTER YOUR EMAIL"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="font-mono font-bold">
                  PASSWORD
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
                    placeholder="ENTER YOUR PASSWORD"
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
                    className="font-mono font-bold text-orange-600 hover:text-orange-700 underline"
                  >
                    FORGOT YOUR PASSWORD?
                  </Link>
                </div>
              </div>

              <Button
                type="submit"
                variant="accent"
                className="w-full font-mono font-bold"
                disabled={isLoading}
              >
                {isLoading ? "SIGNING IN..." : "SIGN IN"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-sm font-mono text-muted-foreground">
            DON'T HAVE AN ACCOUNT?{" "}
            <Link
              href="/auth/signup"
              className="font-bold text-orange-600 hover:text-orange-700 underline"
            >
              SIGN UP FOR FREE
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
