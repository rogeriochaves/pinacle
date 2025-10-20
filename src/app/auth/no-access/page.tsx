"use client";

import { ArrowLeft } from "lucide-react";
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

export default function NoAccess() {
  const searchParams = useSearchParams();
  const podSlug = searchParams.get("pod");

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
            Access denied
          </h1>
          <p className="text-gray-400">
            You don't have permission to access this pod
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono font-bold">Private pod</CardTitle>
            {podSlug && (
              <CardDescription className="font-mono mb-4">
                Pod: <span className="font-bold text-gray-900">{podSlug}</span>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              This pod is private. Please ask the pod owner to grant you access.
            </p>

            <Link href="/dashboard" className="block">
              <Button variant="accent" className="w-full font-mono">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to dashboard
              </Button>
            </Link>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-gray-500 font-mono">
                  or
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-600 text-center">
              Need help?{" "}
              <Link
                href="/docs"
                className="font-medium text-orange-600 hover:text-orange-700 underline"
              >
                Read our documentation
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
