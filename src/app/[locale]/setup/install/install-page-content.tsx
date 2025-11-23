"use client";

import {
  ArrowRight,
  GitBranch,
  Github,
  Loader2,
  Shield,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/trpc/client";

export default function InstallPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const t = useTranslations("setup.install");
  const tCommon = useTranslations("common");

  // Get all params to preserve through redirects
  const setupType = searchParams.get("type") || "repository";
  const template = searchParams.get("template");
  const tier = searchParams.get("tier");
  const agent = searchParams.get("agent");

  // Build URL with all params preserved - memoized with useCallback
  const buildUrl = useCallback(
    (path: string) => {
      const params = new URLSearchParams();
      params.set("type", setupType);
      if (template) params.set("template", template);
      if (tier) params.set("tier", tier);
      if (agent) params.set("agent", agent);
      return `${path}?${params.toString()}`;
    },
    [setupType, template, tier, agent],
  );

  const returnTo = searchParams.get("returnTo") || buildUrl("/setup/project");

  // Check if user has GitHub App installations
  const { data: installationData, isLoading: installationsLoading } =
    api.githubApp.getInstallations.useQuery();

  // Get installation URL
  const { data: installationUrl, isLoading: urlLoading } =
    api.githubApp.getInstallationUrl.useQuery({
      returnTo: returnTo,
    });

  useEffect(() => {
    if (status === "loading" || installationsLoading) return;

    if (!session) {
      // User is not signed in, redirect to setup flow
      router.replace(buildUrl("/setup"));
      return;
    }

    // Check if user already has GitHub App installed
    if (installationData?.hasInstallations) {
      // User already has the app installed, redirect to project selection
      router.replace(buildUrl("/setup/project"));
      return;
    }

    // If we have the installation URL, automatically redirect to GitHub
    if (installationUrl && !isRedirecting) {
      setIsRedirecting(true);
      window.location.href = installationUrl;
      return;
    }
  }, [
    session,
    status,
    installationData,
    installationsLoading,
    router,
    buildUrl,
    installationUrl,
    isRedirecting,
  ]);

  const handleInstallApp = () => {
    if (installationUrl) {
      setIsRedirecting(true);
      window.location.href = installationUrl;
    }
  };

  const [initialRender, setInitialRender] = useState(true);
  const [showManualInstall, setShowManualInstall] = useState(false);

  useEffect(() => {
    if (initialRender) {
      setTimeout(() => {
        setInitialRender(false);
      }, 2000);
    }
  }, [initialRender]);

  // If we haven't redirected after 5 seconds, something went wrong - show manual install
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isRedirecting && installationUrl) {
        setShowManualInstall(true);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [isRedirecting, installationUrl]);

  // If GitHub App is not configured, this is a development/deployment issue
  if (!urlLoading && !installationUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-red-600">
              {t("configError")}
            </CardTitle>
            <CardDescription>
              {t("configErrorDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => router.push("/dashboard/pods")}
              className="w-full"
            >
              {t("returnToDashboard")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (
    status === "loading" ||
    installationsLoading ||
    urlLoading ||
    isRedirecting ||
    initialRender
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-500" />
          <h2 className="text-xl font-semibold text-white mb-2 font-mono">
            {isRedirecting ? t("redirectingToGitHub") : tCommon("loading")}
          </h2>
          <p className="text-slate-400 font-mono">
            {isRedirecting
              ? t("settingUpApp")
              : t("checkingInstallations")}
          </p>
        </div>
      </div>
    );
  }

  // If auto-redirect failed after timeout, show manual install option
  if (showManualInstall) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-blue-100 rounded-full w-fit">
              <Github className="h-8 w-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">
              {t("title")}
            </CardTitle>
            <CardDescription className="text-base">
              {t("description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <Users className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                <h3 className="font-medium text-sm">{t("organizationAccess")}</h3>
                <p className="text-xs text-gray-600 mt-1">
                  {t("organizationAccessDesc")}
                </p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <GitBranch className="h-6 w-6 mx-auto mb-2 text-green-600" />
                <h3 className="font-medium text-sm">{t("createRepositories")}</h3>
                <p className="text-xs text-gray-600 mt-1">
                  {t("createRepositoriesDesc")}
                </p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <Shield className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                <h3 className="font-medium text-sm">{t("secureAccess")}</h3>
                <p className="text-xs text-gray-600 mt-1">
                  {t("secureAccessDesc")}
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">
                {t("whatHappensNext")}
              </h4>
              <ol className="text-sm text-blue-800 space-y-1">
                <li>{t("step1Redirect")}</li>
                <li>{t("step2Choose")}</li>
                <li>{t("step3Select")}</li>
                <li>{t("step4Return")}</li>
              </ol>
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleInstallApp}
                className="w-full"
                size="lg"
                disabled={!installationUrl}
              >
                <Github className="mr-2 h-5 w-5" />
                {t("installButton")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>

            <div className="text-xs text-gray-500 text-center">
              <p>{t("appWillRequest")}</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>{t("repoContents")}</li>
                <li>{t("repoMetadata")}</li>
                <li>{t("orgMembership")}</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default: show loading state (redirecting should happen automatically)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-orange-500" />
        <h2 className="text-xl font-semibold text-white mb-2 font-mono">
          {t("preparingInstall")}
        </h2>
        <p className="text-slate-400 font-mono">
          {t("redirectingShortly")}
        </p>
      </div>
    </div>
  );
}

