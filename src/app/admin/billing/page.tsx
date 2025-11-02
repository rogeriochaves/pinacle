"use client";

import Link from "next/link";
import { AlertCircle, CreditCard, DollarSign, Eye, Loader2, Search, Server, Users } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../lib/trpc/client";

export default function AdminBillingPage() {
  const { update: updateSession } = useSession();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "past_due" | "canceled" | "no_subscription">("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);

  const { data: searchResults, isLoading: isSearching } =
    api.admin.searchUsersWithBilling.useQuery({
      search: searchQuery,
      status: statusFilter,
      limit: 50,
    });

  const { data: userDetails, isLoading: isLoadingDetails, refetch: refetchUserDetails } =
    api.admin.getUserBillingDetails.useQuery(
      { userId: selectedUserId! },
      { enabled: !!selectedUserId },
    );

  const activateSubscription = api.admin.manuallyActivateSubscription.useMutation({
    onSuccess: () => {
      void refetchUserDetails();
      alert("✅ Subscription activated and pods resumed!");
    },
  });

  const extendGracePeriod = api.admin.extendGracePeriod.useMutation({
    onSuccess: (data) => {
      void refetchUserDetails();
      alert(`✅ Grace period extended! New start: ${data.newGracePeriodStart}`);
    },
  });

  const forceSyncUsage = api.admin.forceSyncUsageToStripe.useMutation({
    onSuccess: (data) => {
      void refetchUserDetails();
      alert(`✅ Synced ${data.synced}/${data.total} usage records to Stripe`);
    },
  });

  const { data: billingMetrics } = api.admin.getBillingMetrics.useQuery();

  const startImpersonation = api.admin.startImpersonation.useMutation({
    onSuccess: async (data) => {
      setIsImpersonating(true);
      // Update NextAuth session to start impersonation
      await updateSession({
        impersonating: true,
        impersonatingUserId: data.targetUser.id,
      });
      // Redirect to user's dashboard
      router.push("/dashboard");
      router.refresh();
    },
    onError: (error) => {
      alert(`Failed to start impersonation: ${error.message}`);
      setIsImpersonating(false);
    },
  });

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (date: Date | null | undefined) => {
    if (!date) return "N/A";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      past_due: "bg-yellow-100 text-yellow-800",
      canceled: "bg-red-100 text-red-800",
      paused: "bg-blue-100 text-blue-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <CreditCard className="w-8 h-8 text-slate-700" />
            <div>
              <h1 className="text-2xl font-mono font-bold text-slate-900">
                Admin Billing
              </h1>
              <p className="text-sm font-mono text-slate-600">
                User search, subscription management, and support tools
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Navigation */}
        <div className="mb-6 flex gap-4">
          <Link
            href="/admin"
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium text-sm hover:bg-slate-50 transition-colors"
          >
            <Server className="w-4 h-4" />
            Servers
          </Link>
          <Link
            href="/admin/billing"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            Billing & Users
          </Link>
        </div>

        {/* Billing Metrics */}
        {billingMetrics && (
          <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {billingMetrics.subscriptionsByStatus.map((stat) => (
              <div key={stat.status} className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      stat.status === "active"
                        ? "bg-green-500"
                        : stat.status === "past_due"
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                  />
                  <p className="text-xs font-mono text-slate-600 uppercase">
                    {stat.status}
                  </p>
                </div>
                <p className="text-2xl font-bold font-mono text-slate-900">
                  {stat.count}
                </p>
              </div>
            ))}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <p className="text-xs font-mono text-slate-600 uppercase">
                  Grace Period
                </p>
              </div>
              <p className="text-2xl font-bold font-mono text-slate-900">
                {billingMetrics.gracePeriodCount}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <p className="text-xs font-mono text-slate-600 uppercase">
                  Failed (7d)
                </p>
              </div>
              <p className="text-2xl font-bold font-mono text-slate-900">
                {billingMetrics.failedPayments}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-mono text-slate-600 uppercase">
                  Usage Records
                </p>
              </div>
              <p className="text-2xl font-bold font-mono text-slate-900">
                {billingMetrics.monthlyUsageRecords}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Search & User List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h2 className="font-mono font-bold text-lg mb-4">Search Users</h2>

              {/* Search Input */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Email, name, customer ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Status Filter */}
              <div className="mb-4">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Users</option>
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="canceled">Canceled</option>
                  <option value="no_subscription">No Subscription</option>
                </select>
              </div>

              {/* User List */}
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {isSearching ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  </div>
                ) : searchResults?.length === 0 ? (
                  <p className="text-center py-8 text-slate-500 font-mono text-sm">
                    No users found
                  </p>
                ) : (
                  searchResults?.map((result) => (
                    <button
                      key={result.user.id}
                      onClick={() => setSelectedUserId(result.user.id)}
                      className={`w-full text-left p-3 rounded-lg border font-mono text-sm transition-colors ${
                        selectedUserId === result.user.id
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-bold text-slate-900 truncate">
                          {result.user.name || "No Name"}
                        </p>
                        {result.stripeCustomer && (
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${getStatusColor(
                              result.stripeCustomer.status,
                            )}`}
                          >
                            {result.stripeCustomer.status}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 truncate mb-1">
                        {result.user.email}
                      </p>
                      <div className="flex gap-2 text-xs text-slate-500">
                        <span>{result.podCount} pods</span>
                        <span>•</span>
                        <span>{result.snapshotCount} snapshots</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right: User Details */}
          <div className="lg:col-span-2">
            {!selectedUserId ? (
              <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 font-mono text-sm">
                  Select a user to view billing details
                </p>
              </div>
            ) : isLoadingDetails ? (
              <div className="bg-white rounded-lg border border-slate-200 p-12 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : !userDetails ? (
              <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
                <AlertCircle className="w-16 h-16 text-red-300 mx-auto mb-4" />
                <p className="text-slate-600 font-mono text-sm">
                  Failed to load user details
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* User Info */}
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-mono font-bold text-lg">User Info</h2>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Start impersonating ${userDetails.user.email}?\n\nYou will be logged in as this user and see exactly what they see. This action is logged for security.`,
                          )
                        ) {
                          startImpersonation.mutate({ userId: userDetails.user.id });
                        }
                      }}
                      disabled={startImpersonation.isPending || isImpersonating}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-mono font-bold text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {startImpersonation.isPending || isImpersonating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Starting...
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          View as User
                        </>
                      )}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-mono text-slate-600 mb-1">Name</p>
                      <p className="font-mono text-sm font-bold">
                        {userDetails.user.name || "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-slate-600 mb-1">Email</p>
                      <p className="font-mono text-sm">{userDetails.user.email}</p>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-slate-600 mb-1">User ID</p>
                      <p className="font-mono text-xs text-slate-700">
                        {userDetails.user.id}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-mono text-slate-600 mb-1">Created</p>
                      <p className="font-mono text-sm">
                        {formatDate(userDetails.user.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Subscription */}
                {userDetails.stripeCustomer ? (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-mono font-bold text-lg">Subscription</h2>
                      <span
                        className={`px-3 py-1 rounded text-xs font-mono font-bold ${getStatusColor(
                          userDetails.stripeCustomer.status,
                        )}`}
                      >
                        {userDetails.stripeCustomer.status}
                      </span>
                    </div>

                    {userDetails.stripeCustomer.gracePeriodStartedAt && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                        <div className="flex items-start gap-2 mb-3">
                          <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="font-mono font-bold text-sm text-yellow-900">
                              Grace Period Active
                            </p>
                            <p className="text-xs text-yellow-800 font-mono mt-1">
                              Started: {formatDate(userDetails.stripeCustomer.gracePeriodStartedAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const reason = prompt("Reason for activation:");
                              if (reason) {
                                activateSubscription.mutate({
                                  userId: selectedUserId!,
                                  reason,
                                });
                              }
                            }}
                            disabled={activateSubscription.isPending}
                            className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-mono hover:bg-green-700 disabled:opacity-50"
                          >
                            {activateSubscription.isPending ? "..." : "Clear & Resume"}
                          </button>
                          <button
                            onClick={() => {
                              const hours = prompt("Extend by how many hours? (1-168):");
                              const reason = prompt("Reason for extension:");
                              if (hours && reason) {
                                extendGracePeriod.mutate({
                                  userId: selectedUserId!,
                                  extensionHours: parseInt(hours, 10),
                                  reason,
                                });
                              }
                            }}
                            disabled={extendGracePeriod.isPending}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-mono hover:bg-blue-700 disabled:opacity-50"
                          >
                            {extendGracePeriod.isPending ? "..." : "Extend Grace Period"}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-mono text-slate-600 mb-1">
                          Customer ID
                        </p>
                        <p className="font-mono text-xs text-slate-700">
                          {userDetails.stripeCustomer.stripeCustomerId}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-mono text-slate-600 mb-1">Currency</p>
                        <p className="font-mono text-sm font-bold">
                          {userDetails.stripeCustomer.currency.toUpperCase()}
                        </p>
                      </div>
                      {userDetails.subscription && (
                        <>
                          <div>
                            <p className="text-xs font-mono text-slate-600 mb-1">
                              Period Start
                            </p>
                            <p className="font-mono text-sm">
                              {formatDate(userDetails.subscription.currentPeriodStart)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-mono text-slate-600 mb-1">
                              Period End
                            </p>
                            <p className="font-mono text-sm">
                              {formatDate(userDetails.subscription.currentPeriodEnd)}
                            </p>
                          </div>
                          {userDetails.subscription.cancelAtPeriodEnd && (
                            <div className="col-span-2">
                              <p className="text-xs font-mono text-red-600 mb-1">
                                ⚠️ Subscription will cancel at period end
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <p className="text-slate-600 font-mono text-sm">
                      No subscription
                    </p>
                  </div>
                )}

                {/* Current Usage */}
                {userDetails.currentUsage && userDetails.currentUsage.length > 0 && (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="font-mono font-bold text-lg">
                        Current Period Usage
                      </h2>
                      <button
                        onClick={() => {
                          if (confirm("Force sync all unreported usage to Stripe?")) {
                            forceSyncUsage.mutate({ userId: selectedUserId! });
                          }
                        }}
                        disabled={forceSyncUsage.isPending}
                        className="px-3 py-1.5 bg-purple-600 text-white rounded text-xs font-mono hover:bg-purple-700 disabled:opacity-50"
                      >
                        {forceSyncUsage.isPending ? "Syncing..." : "Force Sync"}
                      </button>
                    </div>
                    <div className="space-y-3">
                      {userDetails.currentUsage.map((usage, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-200"
                        >
                          <div>
                            <p className="font-mono font-bold text-sm">
                              {usage.tierId}
                            </p>
                            <p className="font-mono text-xs text-slate-600">
                              {usage.recordType} • {usage.recordCount} records
                            </p>
                          </div>
                          <p className="font-mono font-bold text-lg">
                            {usage.totalQuantity.toFixed(2)}
                            {usage.recordType === "runtime" ? " hrs" : " MB-hrs"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pods */}
                {userDetails.pods.length > 0 && (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <h2 className="font-mono font-bold text-lg mb-4">
                      Pods ({userDetails.pods.length})
                    </h2>
                    <div className="space-y-2">
                      {userDetails.pods.map((pod) => (
                        <div
                          key={pod.id}
                          className="p-3 bg-slate-50 rounded border border-slate-200"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-mono font-bold text-sm">{pod.name}</p>
                            <span className="text-xs font-mono text-slate-600">
                              {pod.status}
                            </span>
                          </div>
                          <p className="font-mono text-xs text-slate-600">
                            {formatDate(pod.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Snapshots */}
                {userDetails.snapshots.length > 0 && (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <h2 className="font-mono font-bold text-lg mb-4">
                      Snapshots ({userDetails.snapshots.length})
                    </h2>
                    <div className="space-y-2">
                      {userDetails.snapshots.slice(0, 5).map((snapshot) => (
                        <div
                          key={snapshot.id}
                          className="p-3 bg-slate-50 rounded border border-slate-200"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-mono font-bold text-sm">
                              {snapshot.name}
                            </p>
                            <span className="text-xs font-mono text-slate-600">
                              {(snapshot.sizeBytes / 1024 / 1024).toFixed(1)} MB
                            </span>
                          </div>
                          <p className="font-mono text-xs text-slate-600">
                            {snapshot.status} • {formatDate(snapshot.createdAt)}
                          </p>
                        </div>
                      ))}
                      {userDetails.snapshots.length > 5 && (
                        <p className="text-xs font-mono text-slate-500 text-center pt-2">
                          +{userDetails.snapshots.length - 5} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Recent Invoices */}
                {userDetails.recentInvoices.length > 0 && (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <h2 className="font-mono font-bold text-lg mb-4">
                      Recent Invoices
                    </h2>
                    <div className="space-y-2">
                      {userDetails.recentInvoices.map((invoice) => (
                        <div
                          key={invoice.id}
                          className="p-3 bg-slate-50 rounded border border-slate-200"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-mono font-bold text-sm">
                                {formatCurrency(invoice.amountDue, invoice.currency)}
                              </p>
                              <p className="font-mono text-xs text-slate-600">
                                {formatDate(invoice.createdAt)}
                              </p>
                            </div>
                            <span
                              className={`text-xs font-mono px-2 py-1 rounded ${
                                invoice.status === "paid"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {invoice.status}
                            </span>
                          </div>
                          {invoice.hostedInvoiceUrl && (
                            <a
                              href={invoice.hostedInvoiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-blue-600 hover:underline mt-1 inline-block"
                            >
                              View in Stripe →
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Webhook Events */}
                {userDetails.recentWebhooks.length > 0 && (
                  <div className="bg-white rounded-lg border border-slate-200 p-6">
                    <h2 className="font-mono font-bold text-lg mb-4">
                      Recent Webhook Events ({userDetails.recentWebhooks.length})
                    </h2>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {userDetails.recentWebhooks.map((event) => (
                        <div
                          key={event.id}
                          className="p-2 bg-slate-50 rounded text-xs font-mono"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-slate-900">{event.eventType}</span>
                            <span className="text-slate-600">
                              {formatDate(event.createdAt)}
                            </span>
                          </div>
                          {event.processingError && (
                            <p className="text-red-600 mt-1 text-xs">
                              Error: {event.processingError}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

