"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { api } from "@/lib/trpc/client";
import { Card, CardContent } from "../ui/card";

const formatRelativeTime = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  }
  return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
};

export const JumpRightBack = () => {
  const { data: podsWithScreenshots, isLoading } =
    api.pods.getRunningPodsWithScreenshots.useQuery();

  // Don't show the section if no pods with screenshots
  if (
    !isLoading &&
    (!podsWithScreenshots || podsWithScreenshots.length === 0)
  ) {
    return null;
  }

  return (
    <section className="bg-white py-12 sm:py-12 border-b border-gray-200">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h2 className="text-xl font-bold font-mono tracking-tight text-foreground sm:text-2xl">
            Jump right back
          </h2>
          <p className="mt-2 text-md leading-8 text-muted-foreground font-mono">
            Continue working on your running projects
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {podsWithScreenshots?.map((pod) => (
              <Link key={pod.id} href={`/dashboard?pod=${pod.id}`}>
                <Card className="group hover:shadow-lg transition-shadow">
                  <CardContent>
                    {/* Screenshot */}
                    {pod.screenshot && (
                      <div className="relative w-full aspect-video bg-slate-100 rounded-lg overflow-hidden mb-4 border border-gray-200">
                        <Image
                          src={pod.screenshot.url}
                          alt={`${pod.name} screenshot`}
                          fill
                          className="object-cover object-top-left"
                        />
                        {/* Overlay on hover */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="text-white font-mono text-sm">
                            Open in Workbench
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="font-mono font-bold pb-2">
                      {pod.name}
                    </div>
                    <div className="text-sm text-muted-foreground font-mono">
                      Edited {formatRelativeTime(new Date(pod.screenshot.createdAt))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
