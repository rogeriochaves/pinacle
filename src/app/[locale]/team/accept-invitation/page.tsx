"use client";

import { CheckCircle, XCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/trpc/client";

function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isAccepted, setIsAccepted] = useState(false);

  const token = searchParams.get("token");

  // Fetch invitation details
  useEffect(() => {
    if (!token || status === "loading") return;

    // We'll need to add an endpoint to get invitation details without accepting
    // For now, we'll handle this in the accept mutation
  }, [token, status]);

  const acceptInvitation = api.teams.acceptInvitation.useMutation();

  const handleAccept = async () => {
    if (!token) return;

    setIsAccepting(true);
    setError(null);

    try {
      await acceptInvitation.mutateAsync({ token });
      setIsAccepted(true);

      // Store success message for dashboard toast
      sessionStorage.setItem("teamInvitationSuccess", "true");

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
    } finally {
      setIsAccepting(false);
    }
  };

  const handleSignIn = () => {
    // Redirect to signin with callback to this page
    const currentUrl = window.location.href;
    router.push(`/auth/signin?callbackUrl=${encodeURIComponent(currentUrl)}`);
  };

  const handleSignUp = () => {
    // Redirect to signup with callback to this page
    const currentUrl = window.location.href;
    router.push(`/auth/signup?callbackUrl=${encodeURIComponent(currentUrl)}`);
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
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
              Join Your Team
            </h2>
            <p className="text-gray-400">
              You've been invited to join a team on Pinacle
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-mono font-bold">
                Accept Invitation
              </CardTitle>
              <CardDescription className="font-mono mb-4">
                Sign in to your account or create one to join the team
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* GitHub Sign In */}
              <Button
                onClick={() => signIn("github", { callbackUrl: window.location.href })}
                variant="outline"
                className="w-full font-mono"
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                  />
                </svg>
                Continue with GitHub
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

              {/* Email Actions */}
              <div className="space-y-4">
                <Button onClick={handleSignIn} className="w-full font-mono">
                  Sign In
                </Button>
                <Button onClick={handleSignUp} variant="outline" className="w-full font-mono">
                  Create Account
                </Button>
              </div>

              <div className="text-xs text-gray-600 text-center">
                By joining, you agree to our{" "}
                <Link href="/terms" className="underline hover:text-gray-700">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline hover:text-gray-700">
                  Privacy Policy
                </Link>
                .
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isAccepted) {
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
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                <h3 className="mt-4 text-lg font-medium font-mono text-gray-900">
                  Welcome to the team!
                </h3>
                <p className="mt-2 text-sm font-mono text-gray-600">
                  You've successfully joined the team. Redirecting you to your dashboard...
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <Card>
          <CardHeader>
            <CardTitle className="font-mono">Accept Team Invitation</CardTitle>
            <CardDescription>
              You've been invited to join a team on Pinacle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex">
                  <XCircle className="h-5 w-5 text-red-400" />
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="text-center">
              <p className="text-sm text-gray-600">
                Click below to accept your invitation and join the team.
              </p>
            </div>

            <Button
              onClick={handleAccept}
              disabled={isAccepting}
              className="w-full font-mono bg-orange-500 hover:bg-orange-600"
            >
              {isAccepting ? "Accepting..." : "Accept Invitation"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <AcceptInvitationForm />
    </Suspense>
  );
}
