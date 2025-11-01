"use client";

import { ArrowRight, GithubIcon, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

type SetupType = "repository" | "new";

const SetupPageContent = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [setupType, setSetupType] = useState<SetupType>("repository");
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Get template, tier, and agent params
  const template = searchParams.get("template");
  const tier = searchParams.get("tier");
  const agent = searchParams.get("agent");

  useEffect(() => {
    const type = searchParams.get("type") as SetupType;
    if (type === "repository" || type === "new") {
      setSetupType(type);
    }
  }, [searchParams]);

  // Handle authentication flow
  useEffect(() => {
    if (status === "loading") return;

    // Build URL with all params
    const buildUrl = (path: string) => {
      const params = new URLSearchParams();
      params.set("type", setupType);
      if (template) params.set("template", template);
      if (tier) params.set("tier", tier);
      if (agent) params.set("agent", agent);
      return `${path}?${params.toString()}`;
    };

    if (!session) {
      // User is not signed in, redirect to GitHub OAuth
      signIn("github", {
        callbackUrl: buildUrl("/setup"),
      });
      return;
    }

    // Check if user has GitHub connection
    const user = session.user;
    if (!user.githubId) {
      // User signed in with email/password, need GitHub connection
      setIsRedirecting(true);
      signIn("github", {
        callbackUrl: buildUrl("/setup"),
      });
      return;
    }

    // User is authenticated with GitHub, now check if they have GitHub App installed
    router.replace(buildUrl("/setup/install"));
  }, [session, status, setupType, router, template, tier, agent]);

  const [initialRender, setInitialRender] = useState(true);

  useEffect(() => {
    if (initialRender) {
      setTimeout(() => {
        setInitialRender(false);
      }, 2000);
    }
  }, [initialRender]);

  if (status === "loading" || isRedirecting || initialRender) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-500" />
          <h2 className="text-xl font-semibold text-white mb-2 font-mono">
            Setting up your development environment...
          </h2>
          <p className="text-slate-400 font-mono">
            {!session
              ? "Redirecting to GitHub authentication..."
              : "Connecting your GitHub account..."}
          </p>
        </div>
      </div>
    );
  }

  // This should rarely be shown as we redirect above
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {setupType === "repository" ? "Open Repository" : "New Project"}
          </h1>
          <p className="text-gray-600">
            {setupType === "repository"
              ? "Connect your GitHub account to access your repositories"
              : "Connect your GitHub account to create a new project"}
          </p>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-gray-900 rounded-full flex items-center justify-center mb-4">
              <GithubIcon className="h-6 w-6 text-white" />
            </div>
            <CardTitle>Connect GitHub Account</CardTitle>
            <CardDescription>
              We need access to your GitHub repositories to set up your
              development environment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => {
                setIsRedirecting(true);
                const params = new URLSearchParams();
                params.set("type", setupType);
                if (template) params.set("template", template);
                if (tier) params.set("tier", tier);
                if (agent) params.set("agent", agent);
                signIn("github", {
                  callbackUrl: `/setup?${params.toString()}`,
                });
              }}
              className="w-full"
              disabled={isRedirecting}
            >
              {isRedirecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GithubIcon className="mr-2 h-4 w-4" />
              )}
              Connect GitHub Account
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <div className="mt-4 text-xs text-gray-500 text-center">
              <p>We'll request access to:</p>
              <ul className="mt-2 space-y-1">
                <li>• Read your repositories</li>
                <li>• Create deploy keys</li>
                <li>• Create new repositories (for new projects)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SetupPageContent;

