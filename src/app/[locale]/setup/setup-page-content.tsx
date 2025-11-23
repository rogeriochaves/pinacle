"use client";

import { ArrowRight, GithubIcon, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SetupType = "repository" | "new";

const SetupPageContent = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [setupType, setSetupType] = useState<SetupType>("repository");
  const [isRedirecting, setIsRedirecting] = useState(false);
  const t = useTranslations("setup");

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
  const [showManualConnect, setShowManualConnect] = useState(false);

  useEffect(() => {
    if (initialRender) {
      setTimeout(() => {
        setInitialRender(false);
      }, 2000);
    }
  }, [initialRender]);

  // If we haven't redirected after 5 seconds, something went wrong - show manual connect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (status !== "loading" && !isRedirecting) {
        setShowManualConnect(true);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [status, isRedirecting]);

  if (status === "loading" || isRedirecting || initialRender) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-500" />
          <h2 className="text-xl font-semibold text-white mb-2 font-mono">
            {t("settingUp")}
          </h2>
          <p className="text-slate-400 font-mono">
            {!session
              ? t("redirectingToGitHub")
              : t("connectingGitHub")}
          </p>
        </div>
      </div>
    );
  }

  // If auto-redirect failed after timeout, show manual connect option
  if (showManualConnect) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {setupType === "repository" ? t("openRepository") : t("newProject")}
            </h1>
            <p className="text-gray-600">
              {setupType === "repository"
                ? t("repositoryConnection.title")
                : t("repositoryConnection.newProjectTitle")}
            </p>
          </div>

          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-gray-900 rounded-full flex items-center justify-center mb-4">
                <GithubIcon className="h-6 w-6 text-white" />
              </div>
              <CardTitle>{t("connectGitHub")}</CardTitle>
              <CardDescription>
                {t("connectGitHubDescription")}
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
                {t("connectGitHubButton")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <div className="mt-4 text-xs text-gray-500 text-center">
                <p>{t("requestAccess")}</p>
                <ul className="mt-2 space-y-1">
                  <li>{t("readRepositories")}</li>
                  <li>{t("createDeployKeys")}</li>
                  <li>{t("createNewRepositories")}</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Default: show loading state (redirecting should happen automatically)
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-500" />
        <h2 className="text-xl font-semibold text-white mb-2 font-mono">
          {t("settingUp")}
        </h2>
        <p className="text-slate-400 font-mono">
          {t("preparingToConnect")}
        </p>
      </div>
    </div>
  );
};

export default SetupPageContent;

