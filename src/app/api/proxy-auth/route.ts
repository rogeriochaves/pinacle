/**
 * Proxy authentication endpoint
 *
 * Flow:
 * 1. User clicks tab in workbench → GET /api/proxy-auth?pod=slug&port=8726
 * 2. Validate NextAuth session
 * 3. Check user has access to pod
 * 4. Generate scoped JWT token
 * 5. Redirect to subdomain with token: http://localhost-8726-pod-slug.localhost:3000/pinacle-proxy-callback?token=xxx
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildProxyCallbackUrl, generateProxyToken } from "@/lib/proxy-token";
import { checkSessionPodAccess } from "@/lib/proxy-utils";

export const GET = async (req: NextRequest): Promise<NextResponse> => {
  try {
    // 1. Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const podSlug = searchParams.get("pod");
    const portStr = searchParams.get("port");

    if (!podSlug || !portStr) {
      return NextResponse.json(
        { error: "Missing pod or port parameter" },
        { status: 400 },
      );
    }

    const targetPort = Number.parseInt(portStr, 10);
    if (Number.isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
      return NextResponse.json(
        { error: "Invalid port number" },
        { status: 400 },
      );
    }

    // 2. Validate NextAuth session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      // Not authenticated - redirect to sign-in page with context
      const returnUrl = searchParams.get("return_url");
      const signInUrl = new URL("/auth/signin-required", req.url);
      signInUrl.searchParams.set("pod", podSlug);
      if (returnUrl) {
        signInUrl.searchParams.set("return_url", returnUrl);
      }
      return NextResponse.redirect(signInUrl);
    }

    // 3. Check user has access to pod
    const accessCheck = await checkSessionPodAccess(session, podSlug);
    if (!accessCheck.hasAccess) {
      // No access - redirect to no-access page
      const noAccessUrl = new URL("/auth/no-access", req.url);
      noAccessUrl.searchParams.set("pod", podSlug);
      return NextResponse.redirect(noAccessUrl);
    }

    const pod = accessCheck.pod!;

    // Verify pod is running
    if (pod.status !== "running") {
      // Pod not running - redirect to unavailable page
      const unavailableUrl = new URL("/auth/pod-unavailable", req.url);
      unavailableUrl.searchParams.set("pod", podSlug);
      unavailableUrl.searchParams.set("status", pod.status);
      return NextResponse.redirect(unavailableUrl);
    }

    // 4. Generate scoped JWT token
    const token = generateProxyToken(
      session.user.id,
      pod.id,
      pod.slug,
      targetPort,
    );

    // 5. Detect if this is an iframe embed request
    // Check Sec-Fetch-Dest header (iframe) or explicit embed parameter
    const secFetchDest = req.headers.get("sec-fetch-dest");
    const embedParam = searchParams.get("embed");
    const isEmbed = secFetchDest === "iframe" || embedParam === "true";
    const returnUrl = searchParams.get("return_url") || undefined;

    // 6. Build redirect URL with token (and embed flag if applicable)
    const redirectUrl = buildProxyCallbackUrl({
      podSlug: pod.slug,
      port: targetPort,
      token,
      embed: isEmbed,
      returnUrl,
    });

    console.log(
      `[ProxyAuth] Redirecting user ${session.user.id} to pod ${pod.slug}:${targetPort} (embed: ${isEmbed}, returnUrl: ${returnUrl})`,
    );

    // Redirect to subdomain with token
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("[ProxyAuth] Error:", error);
    return NextResponse.json(
      {
        error: "Internal proxy authentication error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
