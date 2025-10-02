import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import {
  githubInstallations,
  userGithubInstallations,
} from "../../../../lib/db/schema";
import { getGitHubApp } from "../../../../lib/github-app";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.redirect(new URL("/auth/signin", request.url));
    }

    const searchParams = request.nextUrl.searchParams;
    const installationId = searchParams.get("installation_id");
    const _setupAction = searchParams.get("setup_action");
    const state = searchParams.get("state");

    if (!installationId) {
      return NextResponse.redirect(
        new URL("/setup/project?error=missing_installation", request.url),
      );
    }

    const userId = (session.user as any).id;

    try {
      // Get installation details from GitHub
      const app = getGitHubApp();
      const { data: installation } = await app.octokit.request(
        "GET /app/installations/{installation_id}",
        {
          installation_id: parseInt(installationId, 10),
        },
      );

      // Store installation in database
      const [storedInstallation] = await db
        .insert(githubInstallations)
        .values({
          installationId: installation.id,
          accountId: installation.account!.id,
          accountLogin: (installation.account as any).login,
          accountType: (installation.account as any).type,
          permissions: JSON.stringify(installation.permissions),
          repositorySelection: installation.repository_selection,
        })
        .onConflictDoUpdate({
          target: githubInstallations.installationId,
          set: {
            accountId: installation.account!.id,
            accountLogin: (installation.account as any).login,
            accountType: (installation.account as any).type,
            permissions: JSON.stringify(installation.permissions),
            repositorySelection: installation.repository_selection,
            updatedAt: new Date(),
          },
        })
        .returning();

      // Link user to installation
      await db
        .insert(userGithubInstallations)
        .values({
          userId,
          installationId: storedInstallation.id,
          role: "admin", // User who installed the app is admin
        })
        .onConflictDoNothing();

      // Redirect back to the setup flow
      const baseRedirectUrl = state
        ? decodeURIComponent(state)
        : "/setup/project";
      const separator = baseRedirectUrl.includes("?") ? "&" : "?";
      const finalRedirectUrl = `${baseRedirectUrl}${separator}success=installation_complete`;
      return NextResponse.redirect(new URL(finalRedirectUrl, request.url));
    } catch (error) {
      console.error("Failed to process GitHub App installation:", error);
      return NextResponse.redirect(
        new URL("/setup/project?error=installation_failed", request.url),
      );
    }
  } catch (error) {
    console.error("GitHub App callback error:", error);
    return NextResponse.redirect(
      new URL("/setup/project?error=callback_failed", request.url),
    );
  }
}
