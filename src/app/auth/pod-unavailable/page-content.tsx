"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function PodUnavailable() {
  const searchParams = useSearchParams();
  const podSlug = searchParams.get("pod");
  const status = searchParams.get("status");

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <Link
            href="/"
            className="flex items-center justify-center space-x-2 mb-12"
          >
            <Image
              src="/logo.png"
              alt="Pinacle Logo"
              className="h-10 w-10"
              width={40}
              height={40}
            />
            <span className="font-bold font-mono text-2xl text-white">
              pinacle
            </span>
          </Link>
          <h1 className="text-3xl font-bold font-mono text-white mb-3">
            Pod unavailable
          </h1>
          <p className="text-gray-400">This pod is not currently running</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono font-bold">Start pod</CardTitle>
            {podSlug && (
              <CardDescription className="font-mono mb-4">
                Pod: <span className="font-bold text-gray-900">{podSlug}</span>
                {status && (
                  <>
                    {" "}
                    • Status:{" "}
                    <span className="font-bold text-yellow-600 capitalize">
                      {status}
                    </span>
                  </>
                )}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              The pod needs to be started before you can access it. Go to your
              dashboard to start the pod, then try accessing it again.
            </p>

            <Link href="/dashboard" className="block">
              <Button variant="accent" className="w-full font-mono">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go to dashboard
              </Button>
            </Link>

            <Button
              onClick={handleRefresh}
              variant="outline"
              className="w-full font-mono"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try again
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-gray-500 font-mono">
                  tip
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-600 text-center">
              Pods can take a few seconds to start. Wait a moment and refresh.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
