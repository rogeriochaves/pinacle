"use client";

import { AlertCircle, ArrowLeft, CreditCard, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../../components/ui/button";
import { api } from "../../../lib/trpc/client";

export default function BillingPage() {
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);

  const { data: subscriptionStatus, isLoading: isLoadingStatus } =
    api.billing.getSubscriptionStatus.useQuery();

  const { data: currentUsage, isLoading: isLoadingUsage } =
    api.billing.getCurrentUsage.useQuery();

  const { data: invoiceData, isLoading: isLoadingInvoices } =
    api.billing.getInvoiceHistory.useQuery({ limit: 50, offset: 0 });

  const invoices = invoiceData?.invoices || [];

  const createPortalMutation = api.billing.createPortalSession.useMutation();

  const handleManageSubscription = async () => {
    setIsLoadingPortal(true);
    try {
      const result = await createPortalMutation.mutateAsync({
        returnUrl: window.location.href,
      });
      window.location.href = result.url;
    } catch (error) {
      toast.error("Failed to open billing portal");
      console.error(error);
      setIsLoadingPortal(false);
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(date));
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      active: { bg: "bg-green-100", text: "text-green-800", label: "Active" },
      past_due: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Past Due" },
      canceled: { bg: "bg-red-100", text: "text-red-800", label: "Canceled" },
      inactive: { bg: "bg-gray-100", text: "text-gray-800", label: "Inactive" },
      paused: { bg: "bg-blue-100", text: "text-blue-800", label: "Paused" },
    };

    const config = statusConfig[status] || statusConfig.inactive;

    return (
      <span
        className={`${config.bg} ${config.text} px-3 py-1 rounded-full text-xs font-mono font-bold`}
      >
        {config.label}
      </span>
    );
  };

  const getInvoiceStatusBadge = (status: string) => {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      paid: { bg: "bg-green-100", text: "text-green-800", label: "Paid" },
      open: { bg: "bg-blue-100", text: "text-blue-800", label: "Open" },
      draft: { bg: "bg-gray-100", text: "text-gray-800", label: "Draft" },
      uncollectible: { bg: "bg-red-100", text: "text-red-800", label: "Failed" },
      void: { bg: "bg-gray-100", text: "text-gray-800", label: "Void" },
    };

    const config = statusConfig[status] || statusConfig.draft;

    return (
      <span
        className={`${config.bg} ${config.text} px-2 py-1 rounded text-xs font-mono`}
      >
        {config.label}
      </span>
    );
  };

  const isLoading = isLoadingStatus || isLoadingUsage || isLoadingInvoices;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <Button variant="ghost" asChild className="-ml-2">
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span className="font-mono text-sm">Back to Workbench</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-mono font-bold text-slate-900 mb-2">
            Billing & Subscription
          </h1>
          <p className="text-slate-600 font-mono text-sm">
            Manage your subscription, view usage, and download invoices
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Subscription Status */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-mono font-bold text-lg text-slate-900">
                  Subscription
                </h2>
                {subscriptionStatus?.status &&
                  getStatusBadge(subscriptionStatus.status)}
              </div>

              {!subscriptionStatus?.hasSubscription ? (
                <div className="py-8 text-center">
                  <CreditCard className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 font-mono text-sm mb-4">
                    No active subscription
                  </p>
                  <Button asChild className="font-mono">
                    <Link href="/setup">Create Your First Pod</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {subscriptionStatus?.gracePeriodStartedAt && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-mono font-bold text-sm text-yellow-900 mb-1">
                          Payment Issue
                        </p>
                        <p className="text-sm text-yellow-800 font-mono">
                          Your last payment failed. Please update your payment method
                          to avoid service interruption.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <p className="font-mono text-xs text-slate-600 mb-1">
                        Currency
                      </p>
                      <p className="font-mono font-bold text-lg text-slate-900">
                        {subscriptionStatus?.currency?.toUpperCase() || "USD"}
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={handleManageSubscription}
                    disabled={isLoadingPortal}
                    className="font-mono w-full sm:w-auto"
                  >
                    {isLoadingPortal ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Opening...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 mr-2" />
                        Manage Subscription
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Current Usage */}
            {subscriptionStatus?.hasSubscription && currentUsage && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
                  Upcoming Invoice
                </h2>

                {!currentUsage.upcomingInvoice ? (
                  <p className="text-slate-600 font-mono text-sm">
                    {currentUsage.message || "No upcoming invoice"}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {currentUsage.upcomingInvoice.lineItems.map((item: {
                      description: string | null;
                      amount: number;
                      currency: string;
                      quantity: number | null;
                    }, idx: number) => (
                      <div
                        key={`line-item-${idx}`}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
                      >
                        <div>
                          <p className="font-mono font-bold text-slate-900">
                            {item.description || "Usage"}
                          </p>
                          {item.quantity && (
                            <p className="font-mono text-sm text-slate-600">
                              {item.quantity} units
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-slate-900">
                            {formatCurrency(
                              item.amount,
                              item.currency,
                            )}
                          </p>
                        </div>
                      </div>
                    ))}

                    <div className="pt-4 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono font-bold text-lg text-slate-900">
                            Total
                          </p>
                          <p className="font-mono text-xs text-slate-600">
                            Period: {formatDate(new Date(currentUsage.upcomingInvoice.periodStart * 1000))} - {formatDate(new Date(currentUsage.upcomingInvoice.periodEnd * 1000))}
                          </p>
                        </div>
                        <p className="font-mono font-bold text-2xl text-slate-900">
                          {formatCurrency(
                            currentUsage.upcomingInvoice.total,
                            currentUsage.upcomingInvoice.currency,
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Invoice History */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="font-mono font-bold text-lg text-slate-900 mb-4">
                Invoice History
              </h2>

              {invoices.length === 0 ? (
                <div className="py-8 text-center">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 font-mono text-sm">
                    No invoices yet
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left font-mono text-xs font-bold text-slate-600 py-3 px-2">
                          Date
                        </th>
                        <th className="text-left font-mono text-xs font-bold text-slate-600 py-3 px-2">
                          Amount
                        </th>
                        <th className="text-left font-mono text-xs font-bold text-slate-600 py-3 px-2">
                          Status
                        </th>
                        <th className="text-right font-mono text-xs font-bold text-slate-600 py-3 px-2">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => (
                        <tr
                          key={invoice.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-3 px-2">
                            <p className="font-mono text-sm text-slate-900">
                              {formatDate(invoice.createdAt)}
                            </p>
                            {invoice.periodStart && invoice.periodEnd && (
                              <p className="font-mono text-xs text-slate-500">
                                {formatDate(invoice.periodStart)} -{" "}
                                {formatDate(invoice.periodEnd)}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <p className="font-mono text-sm font-bold text-slate-900">
                              {formatCurrency(
                                invoice.amountDue,
                                invoice.currency,
                              )}
                            </p>
                          </td>
                          <td className="py-3 px-2">
                            {getInvoiceStatusBadge(invoice.status)}
                          </td>
                          <td className="py-3 px-2 text-right">
                            {invoice.hostedInvoiceUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="font-mono text-xs"
                                asChild
                              >
                                <a
                                  href={invoice.hostedInvoiceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  View
                                </a>
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

