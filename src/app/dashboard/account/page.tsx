"use client";

import { ArrowLeft, Github, LogOut, Mail } from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Button } from "../../../components/ui/button";
import { api } from "../../../lib/trpc/client";

export default function AccountPage() {
  const { data: session } = useSession();
  const { data: installations = [] } = api.githubApp.getUserInstallations.useQuery();

  const handleSignOut = () => {
    signOut({ callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Button variant="ghost" asChild className="-ml-2">
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span className="font-mono text-sm">Back to Workbench</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-mono font-bold text-slate-900 mb-2">
            Account
          </h1>
          <p className="text-slate-600 font-mono text-sm">
            Manage your personal settings and connected accounts
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
              Profile
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
                    User ID
                  </p>
                  <p className="text-xs text-slate-600 font-mono">
                    {session?.user?.id}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Connected Accounts */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
              Connected Accounts
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center">
                    <Github className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-mono font-bold text-slate-900">GitHub</p>
                    <p className="text-sm text-slate-600 font-mono">
                      {installations && installations.length > 0
                        ? `${installations.length} organization${installations.length > 1 ? "s" : ""} connected`
                        : "Not connected"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="font-mono"
                  asChild
                >
                  <Link href="/setup">Manage</Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Billing */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
              Billing
            </h2>
            <p className="text-slate-600 font-mono text-sm mb-4">
              Manage your subscription and payment methods
            </p>
            <Button variant="outline" className="font-mono" disabled>
              Coming Soon
            </Button>
          </div>

          {/* Sign Out */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-mono font-bold text-lg text-slate-900 mb-2">
              Session
            </h2>
            <p className="text-slate-600 font-mono text-sm mb-4">
              You're currently signed in as {session?.user?.email}
            </p>
            <Button
              onClick={handleSignOut}
              variant="outline"
              className="font-mono border-red-200 text-red-600 hover:bg-red-50"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
