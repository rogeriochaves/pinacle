"use client";

import { ArrowLeft, Github, LogOut, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Locale, localeNames, locales } from "@/i18n";
import { api } from "@/lib/trpc/client";

export default function AccountPage() {
  const { data: session } = useSession();
  const { data: installations = [] } =
    api.githubApp.getUserInstallations.useQuery();
  const t = useTranslations("account");
  const currentLocale = useLocale() as Locale;
  const router = useRouter();

  const { data: userLanguageData } = api.users.getPreferredLanguage.useQuery();
  const updateLanguageMutation =
    api.users.updatePreferredLanguage.useMutation();

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" });
  };

  const handleLanguageChange = async (newLanguage: Locale) => {
    try {
      await updateLanguageMutation.mutateAsync({ language: newLanguage });
      toast.success(t("languageUpdated"));

      // Redirect to the new locale
      const currentPath = window.location.pathname;
      let newPath = currentPath;

      // Remove current locale prefix if it exists (including /en)
      for (const loc of locales) {
        if (currentPath.startsWith(`/${loc}/`) || currentPath === `/${loc}`) {
          newPath = currentPath.slice(`/${loc}`.length) || "/";
          break;
        }
      }

      // Add new locale prefix (including for English)
      if (newLanguage === "en") {
        newPath = `/en${newPath}`;
      } else {
        newPath = `/${newLanguage}${newPath}`;
      }

      router.push(newPath);
    } catch (error) {
      toast.error(t("languageUpdateFailed"));
      console.error("Failed to update language:", error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Button variant="ghost" asChild className="-ml-2">
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span className="font-mono text-sm">{t("backToWorkbench")}</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-mono font-bold text-slate-900 mb-2">
            {t("title")}
          </h1>
          <p className="text-slate-600 font-mono text-sm">{t("subtitle")}</p>
        </div>

        <div className="space-y-6">
          {/* Profile */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
              {t("profile")}
            </h2>

            <div className="flex items-center gap-6 mb-6">
              <div className="w-20 h-20 rounded-full bg-slate-900 border-4 border-slate-300 flex items-center justify-center shrink-0">
                <span className="text-white font-mono font-bold text-2xl">
                  {session?.user?.name?.charAt(0).toUpperCase() || "U"}
                </span>
              </div>

              <div className="flex-1">
                <h3 className="font-mono font-bold text-xl text-slate-900 mb-1">
                  {session?.user?.name || "User"}
                </h3>
                <p className="text-slate-600 font-mono text-sm flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  {session?.user?.email}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <p className="font-mono text-sm font-medium text-slate-900">
                    {t("userId")}
                  </p>
                  <p className="text-xs text-slate-600 font-mono">
                    {session?.user?.id}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
              {t("preferences")}
            </h2>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="language"
                  className="font-mono text-sm font-medium text-slate-900 mb-2 block"
                >
                  {t("language")}
                </label>
                <p className="text-slate-600 font-mono text-xs mb-3">
                  {t("languageDescription")}
                </p>
                <Select
                  value={userLanguageData?.language || currentLocale}
                  onValueChange={(value) =>
                    handleLanguageChange(value as Locale)
                  }
                  disabled={updateLanguageMutation.isPending}
                >
                  <SelectTrigger className="w-full max-w-xs font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locales.map((locale) => (
                      <SelectItem key={locale} value={locale}>
                        {localeNames[locale]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Connected Accounts */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
              {t("connectedAccounts")}
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center">
                    <Github className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-mono font-bold text-slate-900">
                      {t("github")}
                    </p>
                    <p className="text-sm text-slate-600 font-mono">
                      {installations && installations.length > 0
                        ? installations.length > 1
                          ? t("organizationsConnectedPlural", {
                              count: installations.length,
                            })
                          : t("organizationsConnected", {
                              count: installations.length,
                            })
                        : t("notConnected")}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="font-mono"
                  asChild
                >
                  <Link href="/setup">{t("manage")}</Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Billing */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
              {t("billing")}
            </h2>
            <p className="text-slate-600 font-mono text-sm mb-4">
              {t("billingDescription")}
            </p>
            <Button variant="outline" className="font-mono" asChild>
              <Link href="/dashboard/billing">{t("viewBilling")}</Link>
            </Button>
          </div>

          {/* Sign Out */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-mono font-bold text-lg text-slate-900 mb-2">
              {t("session")}
            </h2>
            <p className="text-slate-600 font-mono text-sm mb-4">
              {t("signedInAs", { email: session?.user?.email || "" })}
            </p>
            <Button
              onClick={handleSignOut}
              variant="outline"
              className="font-mono border-red-200 text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t("signOut")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
