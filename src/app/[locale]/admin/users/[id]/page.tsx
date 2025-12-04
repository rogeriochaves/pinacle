"use client";

import { ArrowLeft, CreditCard, ExternalLink, Tag } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { podRecordToPinacleConfig } from "@/lib/pod-orchestration/pinacle-config";
import { api } from "@/lib/trpc/client";

const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
};

const formatDate = (timestamp: number) => {
  return new Date(timestamp * 1000).toLocaleString();
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "complete":
    case "paid":
    case "succeeded":
    case "active":
      return "bg-green-100 text-green-800";
    case "open":
    case "pending":
    case "processing":
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
      return "bg-yellow-100 text-yellow-800";
    case "canceled":
    case "expired":
    case "failed":
    case "void":
    case "uncollectible":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export default function UserDetailPage() {
  const params = useParams();
  const userId = params?.id as string;

  const { data, isLoading } = api.admin.getUserDetails.useQuery({ userId });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">User not found</h1>
          <Link
            href="/admin/users"
            className="mt-4 inline-flex items-center text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to users
          </Link>
        </div>
      </div>
    );
  }

  const {
    user,
    teams,
    pods,
    githubInstallations,
    stripeCustomer,
    stripeEvents,
    stripeSubscriptions,
  } = data;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/admin/users"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to users
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          {user.name || "User Details"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{user.email}</p>
      </div>

      {/* User Info Card */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          User Information
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-gray-500">User ID</div>
            <div className="mt-1 font-mono text-sm text-gray-900">
              {user.id}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Email</div>
            <div className="mt-1 text-sm text-gray-900">{user.email}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Name</div>
            <div className="mt-1 text-sm text-gray-900">
              {user.name || "Not set"}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">
              GitHub Username
            </div>
            <div className="mt-1 text-sm text-gray-900">
              {user.githubUsername ? (
                <a
                  href={`https://github.com/${user.githubUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-blue-600 hover:text-blue-700"
                >
                  @{user.githubUsername}
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              ) : (
                "Not connected"
              )}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">Joined</div>
            <div className="mt-1 text-sm text-gray-900">
              {new Date(user.createdAt).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-500">
              Last Updated
            </div>
            <div className="mt-1 text-sm text-gray-900">
              {new Date(user.updatedAt).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* UTM Parameters */}
      {(user.utmSource ||
        user.utmMedium ||
        user.utmCampaign ||
        user.utmTerm ||
        user.utmContent) && (
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Sign Up Attribution (UTM)
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {user.utmSource && (
              <div>
                <div className="text-xs font-medium text-gray-500">Source</div>
                <div className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded">
                  {user.utmSource}
                </div>
              </div>
            )}
            {user.utmMedium && (
              <div>
                <div className="text-xs font-medium text-gray-500">Medium</div>
                <div className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded">
                  {user.utmMedium}
                </div>
              </div>
            )}
            {user.utmCampaign && (
              <div>
                <div className="text-xs font-medium text-gray-500">
                  Campaign
                </div>
                <div className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded">
                  {user.utmCampaign}
                </div>
              </div>
            )}
            {user.utmTerm && (
              <div>
                <div className="text-xs font-medium text-gray-500">Term</div>
                <div className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded">
                  {user.utmTerm}
                </div>
              </div>
            )}
            {user.utmContent && (
              <div>
                <div className="text-xs font-medium text-gray-500">Content</div>
                <div className="mt-1 text-sm text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded">
                  {user.utmContent}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stripe Activity */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Stripe Activity
            </h2>
          </div>
          {stripeCustomer && (
            <p className="mt-1 text-sm text-gray-500">
              Customer ID:{" "}
              <a
                href={`https://dashboard.stripe.com/customers/${stripeCustomer.stripeCustomerId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-blue-600 hover:text-blue-700"
              >
                {stripeCustomer.stripeCustomerId}
                <ExternalLink className="ml-1 inline h-3 w-3" />
              </a>
            </p>
          )}
        </div>

        {!stripeCustomer ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No Stripe customer record
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {/* Current Subscriptions */}
            {stripeSubscriptions && stripeSubscriptions.length > 0 && (
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Active Subscriptions
                </h3>
                <div className="space-y-2">
                  {stripeSubscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <a
                            href={`https://dashboard.stripe.com/subscriptions/${sub.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-blue-600 hover:text-blue-700"
                          >
                            {sub.id}
                            <ExternalLink className="ml-1 inline h-3 w-3" />
                          </a>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(sub.status)}`}
                          >
                            {sub.status}
                          </span>
                          {sub.cancelAtPeriodEnd && (
                            <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                              cancels at period end
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Period: {formatDate(sub.currentPeriodStart)} →{" "}
                          {formatDate(sub.currentPeriodEnd)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Events Timeline */}
            <div className="p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Events Timeline (last 30 days)
              </h3>
              {!stripeEvents ? (
                <div className="text-sm text-gray-500">
                  Failed to load events
                </div>
              ) : stripeEvents.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No events found for this customer
                </div>
              ) : (
                <div className="space-y-2">
                  {stripeEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 bg-gray-50 p-3 rounded-lg"
                    >
                      <div
                        className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          event.type.includes("succeeded") ||
                          event.type.includes("complete") ||
                          event.type.includes("created") ||
                          event.type.includes("paid")
                            ? "bg-green-500"
                            : event.type.includes("failed") ||
                                event.type.includes("canceled") ||
                                event.type.includes("deleted")
                              ? "bg-red-500"
                              : event.type.includes("pending") ||
                                  event.type.includes("processing") ||
                                  event.type.includes("updated")
                                ? "bg-yellow-500"
                                : "bg-gray-400"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-900">
                            {event.type.replace(/\./g, " → ")}
                          </span>
                          {event.data.status && (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(event.data.status)}`}
                            >
                              {event.data.status}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          {event.data.amount !== null &&
                            event.data.currency && (
                              <span className="font-medium text-gray-700">
                                {formatCurrency(
                                  event.data.amount,
                                  event.data.currency,
                                )}
                              </span>
                            )}
                          {event.data.objectId && (
                            <span className="font-mono truncate max-w-[200px]">
                              {event.data.objectId}
                            </span>
                          )}
                        </div>
                        {event.data.description && (
                          <div className="text-xs text-gray-500 mt-1">
                            {event.data.description}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 flex-shrink-0">
                        {formatDate(event.created)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* GitHub Installations */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">
            GitHub App Installations
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {githubInstallations.length} installation
            {githubInstallations.length !== 1 ? "s" : ""}
          </p>
        </div>
        {githubInstallations.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No GitHub App installations
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {githubInstallations.map(({ installation, role }) => (
              <div key={installation.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://github.com/${installation.accountLogin}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {installation.accountLogin}
                      </a>
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                        {installation.accountType}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Role: {role} • Selection:{" "}
                      {installation.repositorySelection}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    ID: {installation.installationId}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Teams */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">Teams</h2>
          <p className="mt-1 text-sm text-gray-500">
            {teams.length} team{teams.length !== 1 ? "s" : ""}
          </p>
        </div>
        {teams.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            Not a member of any teams
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {teams.map(({ team, membership }) => (
              <Link
                key={team.id}
                href={`/admin/teams/${team.id}`}
                className="block p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 hover:text-blue-600">
                        {team.name}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {membership.role}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {team.description || "No description"}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {membership.joinedAt
                      ? `Joined ${new Date(membership.joinedAt).toLocaleDateString()}`
                      : "Invitation pending"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Pods */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-900">Pods</h2>
          <p className="mt-1 text-sm text-gray-500">
            {pods.length} pod{pods.length !== 1 ? "s" : ""} owned by this user
          </p>
        </div>
        {pods.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No pods created yet
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {pods.map(({ pod, team }) => (
              <Link
                key={pod.id}
                href={`/admin/pods/${pod.id}`}
                className="block p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 hover:text-blue-600">
                        {pod.name}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          pod.status === "running"
                            ? "bg-green-100 text-green-800"
                            : pod.status === "stopped"
                              ? "bg-gray-100 text-gray-800"
                              : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {pod.status}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                        {
                          podRecordToPinacleConfig({
                            config: pod.config,
                            name: pod.name,
                          }).tier
                        }
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                      <span>Team: {team?.name || "Unknown"}</span>
                      {pod.githubRepo && (
                        <>
                          <span>•</span>
                          <a
                            href={`https://github.com/${pod.githubRepo}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600"
                          >
                            {pod.githubRepo}
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <div>
                      Created {new Date(pod.createdAt).toLocaleDateString()}
                    </div>
                    {pod.publicUrl && (
                      <a
                        href={pod.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center text-blue-600 hover:text-blue-700"
                      >
                        Open <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
