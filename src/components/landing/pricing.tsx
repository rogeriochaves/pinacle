"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatCurrency, formatHourlyPrice } from "@/lib/currency-utils";
import {
  getAllResourceTiers,
  PRICING_TABLE,
  SNAPSHOT_STORAGE_PRICING,
} from "@/lib/pod-orchestration/resource-tier-registry";
import { api } from "@/lib/trpc/client";
import { Button } from "../ui/button";
import { Header } from "./header";

export const Pricing = () => {
  const tiers = getAllResourceTiers();
  const t = useTranslations("pricing");

  // Detect currency from IP using tRPC
  const { data: currencyData, isLoading } =
    api.currency.detectCurrency.useQuery();
  const currency = currencyData?.currency || "usd";

  return (
    <>
      {/* Dark header section */}
      <section className="relative bg-gray-900 py-6 px-6 lg:px-8 text-background">
        <div className="mx-auto max-w-7xl flex flex-col gap-10">
          <Header />

          <div className="flex flex-col gap-8 pt-16 pb-12">
            {/* Header */}
            <div className="text-center max-w-3xl mx-auto">
              <h1 className="text-4xl font-bold font-mono tracking-tight mb-4">
                {t("title")}
              </h1>
              <p className="text-lg text-gray-300 mb-2">
                {t("subtitle")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Light content section */}
      <section className="relative bg-slate-100 py-12 px-6 lg:px-8">
        <div className="mx-auto max-w-7xl flex flex-col gap-8">
          {/* Pricing Table */}
          <div className="overflow-hidden">
            <div className="mx-auto max-w-5xl">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-4 px-6 font-mono font-bold text-sm text-gray-700">
                        {t("tier")}
                      </th>
                      <th className="text-center py-4 px-6 font-mono font-bold text-sm text-gray-700">
                        {t("cpu")}
                      </th>
                      <th className="text-center py-4 px-6 font-mono font-bold text-sm text-gray-700">
                        {t("memory")}
                      </th>
                      <th className="text-center py-4 px-6 font-mono font-bold text-sm text-gray-700">
                        {t("storage")}
                      </th>
                      <th className="text-right py-4 px-6 font-mono font-bold text-sm text-gray-700">
                        {t("price")}
                      </th>
                      <th className="w-40 py-4 px-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map((tier) => {
                      const tierPricing =
                        PRICING_TABLE[tier.id as keyof typeof PRICING_TABLE];
                      const monthlyPrice = tierPricing[currency];

                      return (
                        <tr
                          key={tier.id}
                          className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                          <td className="py-5 px-6">
                            <div className="font-mono font-bold text-gray-900">
                              {tier.name}
                            </div>
                          </td>
                          <td className="text-center py-5 px-6">
                            <span className="text-gray-700">
                              {tier.cpu} {t("vcpu")}
                            </span>
                          </td>
                          <td className="text-center py-5 px-6">
                            <span className="text-gray-700">
                              {tier.memory} {t("gb")}
                            </span>
                          </td>
                          <td className="text-center py-5 px-6">
                            <span className="text-gray-700">
                              {tier.storage} {t("gb")}
                            </span>
                          </td>
                          <td className="text-right py-5 px-6">
                            <div className="font-mono font-bold text-gray-900">
                              {isLoading
                                ? "..."
                                : formatCurrency(monthlyPrice, currency, {
                                  showDecimals: false,
                                })}
                              <span className="text-sm text-gray-600 font-normal">
                                {t("perMonth")}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 font-mono mt-1">
                              {isLoading
                                ? "(....... per hour)"
                                : `(${formatHourlyPrice(monthlyPrice, currency)} ${t("perHour")})`}
                            </div>
                          </td>
                          <td className="py-5 px-6">
                            <Button
                              variant="accent"
                              size="sm"
                              asChild
                              className="w-full"
                            >
                              <Link href={"/setup?type=new"}>{t("getStarted")}</Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {tiers.map((tier) => {
                  const tierPricing =
                    PRICING_TABLE[tier.id as keyof typeof PRICING_TABLE];
                  const monthlyPrice = tierPricing[currency];

                  return (
                    <div
                      key={tier.id}
                      className="border-2 border-gray-300 rounded-sm bg-slate-100 p-6 hover:border-gray-400 transition-colors shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-mono font-bold text-xl text-gray-900">
                          {tier.name}
                        </h3>
                        <div>
                          <div className="font-mono font-bold text-gray-900 text-xl">
                            {isLoading
                              ? "..."
                              : formatCurrency(monthlyPrice, currency, {
                                  showDecimals: false,
                                })}
                            <span className="text-sm text-gray-600 font-normal">
                              /mo
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 font-mono text-right mt-1">
                            {!isLoading &&
                              `${formatHourlyPrice(monthlyPrice, currency)}/hr`}
                          </div>
                        </div>
                      </div>

                        <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-2 text-gray-700">
                          <Check className="h-4 w-4 text-orange-500" />
                          <span>{tier.cpu} {t("vcpu")}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700">
                          <Check className="h-4 w-4 text-orange-500" />
                          <span>{tier.memory} {t("gbMemory")}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-700">
                          <Check className="h-4 w-4 text-orange-500" />
                          <span>{tier.storage} {t("gbStorage")}</span>
                        </div>
                      </div>

                      <Button variant="accent" asChild className="w-full">
                        <Link href={"/setup?type=new"}>{t("getStarted")}</Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Snapshot Storage Pricing */}
          <div className="mt-8 mx-auto w-full max-w-5xl">
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-4 px-6 font-mono font-bold text-sm text-gray-700">
                        {t("snapshots")}
                      </th>
                      <th className="text-right py-4 px-6 font-mono font-bold text-sm text-gray-700">
                        {t("price")}
                      </th>
                      <th className="w-40 py-4 px-6"></th>
                    </tr>
                  </thead>
                <tbody>
                  <tr className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    <td className="py-5 px-6">
                      <div className="font-mono font-bold text-gray-900 flex items-center gap-2">
                        {t("snapshotStorage")}
                        <span
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-400 text-gray-600 text-xs cursor-help"
                          title={t("snapshotTooltip")}
                        >
                          i
                        </span>
                      </div>
                    </td>
                      <td className="text-right py-5 px-6">
                        <div className="font-mono font-bold text-gray-900">
                          {isLoading
                            ? "..."
                            : formatCurrency(
                                SNAPSHOT_STORAGE_PRICING[currency],
                                currency,
                                { showDecimals: true },
                              )}
                          <span className="text-sm text-gray-600 font-normal">
                            {t("perGbMonth")}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 font-mono mt-1">
                          {isLoading
                            ? "(....... per hour)"
                            : `(${formatHourlyPrice(
                                SNAPSHOT_STORAGE_PRICING[currency],
                                currency,
                              )} ${t("perGbPerHour")})`}
                        </div>
                      </td>
                      <td className="py-5 px-6 text-center">
                        <Link
                          href="/docs/snapshots"
                          className="text-sm underline font-mono"
                          target="_blank"
                        >
                          {t("viewDocs")}
                        </Link>
                      </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Mobile Card */}
            <div className="md:hidden">
              <div className="border-2 border-gray-300 rounded-sm bg-slate-100 p-6 hover:border-gray-400 transition-colors shadow-sm">
                <div className="flex flex-col items-start gap-4 mb-4">
                  <h3 className="font-mono font-bold text-xl text-gray-900 flex items-center gap-2">
                    Snapshot Storage
                    <span
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-400 text-gray-600 text-xs"
                      title="Automatic snapshots preserve your work when you stop a pod. Billed per GB per month. Delete anytime."
                    >
                      i
                    </span>
                  </h3>
                  <div>
                    <div className="font-mono font-bold text-gray-900 text-xl">
                      {isLoading
                        ? "..."
                        : formatCurrency(
                            SNAPSHOT_STORAGE_PRICING[currency],
                            currency,
                            { showDecimals: true },
                          )}
                      <span className="text-sm text-gray-600 font-normal">
                        /GB-month
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 font-mono text-right mt-1">
                      {!isLoading &&
                        `${formatHourlyPrice(
                          SNAPSHOT_STORAGE_PRICING[currency],
                          currency,
                        )} per GB per hour`}
                    </div>
                  </div>
                </div>
                <Button variant="outline" asChild className="w-full">
                  <Link href="/docs/snapshots" target="_blank">
                    View Docs
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          {/* Features Section */}
          <div className="mt-12 border-t-2 border-gray-300 pt-16 pb-12">
            <div className="mx-auto max-w-4xl">
              <h2 className="text-2xl font-bold font-mono mb-8 text-center text-gray-900">
                {t("whatYouGet")}
              </h2>
              <div className="grid md:grid-cols-2 gap-4 ml-4">
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">
                    {t("features.rootAccess")}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{t("features.vsCodeIntegration")}</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">
                    {t("features.runAgents247")}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{t("features.githubSync")}</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">
                    {t("features.persistentStorage")}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">
                    {t("features.secureIsolated")}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">
                    {t("features.startStopAnytime")}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">
                    {t("features.snapshotRestore")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
