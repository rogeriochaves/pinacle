"use client";

import { CheckCircle, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { api } from "../../../lib/trpc/client";

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold font-mono text-gray-900">
              Join Your Team
            </h2>
            <p className="mt-2 text-gray-600">
              You've been invited to join a team on Pinacle. Please sign in or create an account to accept the invitation.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="font-mono">Team Invitation</CardTitle>
              <CardDescription>
                Sign in with the email address that received this invitation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={handleSignIn} className="w-full font-mono">
                Sign In
              </Button>
              <Button onClick={handleSignUp} variant="outline" className="w-full font-mono">
                Create Account
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isAccepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                <h3 className="mt-2 text-lg font-medium text-gray-900">
                  Welcome to the team!
                </h3>
                <p className="mt-1 text-sm text-gray-500">
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
