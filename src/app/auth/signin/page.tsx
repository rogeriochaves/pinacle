"use client";

import { useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Github, Code, Eye, EyeOff } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

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
          <Link href="/" className="flex items-center justify-center space-x-2 mb-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-orange-200 border-2 border-border-contrast">
              <Code className="h-4 w-4 text-orange-900" />
            </div>
            <span className="font-bold font-mono text-2xl text-foreground">PINACLE</span>
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
                <span className="bg-background px-2 text-muted-foreground font-mono font-bold">OR CONTINUE WITH</span>
              </div>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-200 border-2 border-red-800 rounded-sm p-3">
                  <p className="text-sm font-mono font-bold text-red-900">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="font-mono font-bold">EMAIL ADDRESS</Label>
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
                <Label htmlFor="password" className="font-mono font-bold">PASSWORD</Label>
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
