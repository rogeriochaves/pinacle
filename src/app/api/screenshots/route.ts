import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { podScreenshots, pods } from "@/lib/db/schema";
import { getScreenshotStorage } from "@/lib/screenshots/screenshot-storage";

export const POST = async (request: Request) => {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { podId, port, path, imageDataUrl } = body;

    if (!podId || !port || !imageDataUrl) {
      return NextResponse.json(
        { error: "Missing required fields: podId, port, imageDataUrl" },
        { status: 400 },
      );
    }

    // Verify pod exists and user has access
    const pod = await db.query.pods.findFirst({
      where: eq(pods.id, podId),
    });

    if (!pod) {
      return NextResponse.json({ error: "Pod not found" }, { status: 404 });
    }

    if (pod.ownerId !== session.user.id) {
      return NextResponse.json(
        { error: "You don't have access to this pod" },
        { status: 403 },
      );
    }

    // Convert data URL to buffer
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Reject images that are too small (likely failed/corrupted captures)
    const MIN_VALID_IMAGE_SIZE = 1024; // 1KB minimum
    if (imageBuffer.length < MIN_VALID_IMAGE_SIZE) {
      return NextResponse.json(
        {
          error: "Invalid screenshot: image too small",
          details: `Image size ${imageBuffer.length} bytes is below minimum ${MIN_VALID_IMAGE_SIZE} bytes`,
        },
        { status: 400 },
      );
    }

    // Generate screenshot ID
    const screenshotId = `${podId}-${Date.now()}`;

    // Get all existing screenshots for this pod to clean them up
    const existingScreenshots = await db
      .select()
      .from(podScreenshots)
      .where(eq(podScreenshots.podId, podId));

    // Upload new screenshot to S3
    const storage = getScreenshotStorage();
    const { url, sizeBytes } = await storage.upload(screenshotId, imageBuffer);

    // Save new screenshot metadata to database
    const [screenshot] = await db
      .insert(podScreenshots)
      .values({
        podId,
        url,
        port: Number.parseInt(port, 10),
        path: path || "/",
        sizeBytes,
      })
      .returning();

    // Clean up old screenshots (delete from S3 first, then from DB)
    if (existingScreenshots.length > 0) {
      console.log(
        `[Screenshots API] Cleaning up ${existingScreenshots.length} old screenshots`,
      );

      // Delete old screenshots from S3
      for (const oldScreenshot of existingScreenshots) {
        try {
          // Extract screenshot ID from URL
          // URL format: http://endpoint/bucket/screenshots/pod-123-456.png
          const urlParts = oldScreenshot.url.split("/");
          const filename = urlParts[urlParts.length - 1]; // pod-123-456.png
          const oldScreenshotId = filename.replace(".png", ""); // pod-123-456

          await storage.deleteScreenshot(oldScreenshotId);
          console.log(
            `[Screenshots API] Deleted old screenshot from S3: ${oldScreenshotId}`,
          );
        } catch (error) {
          console.error(
            "[Screenshots API] Failed to delete old screenshot from S3:",
            error,
          );
          // Continue with other deletions even if one fails
        }
      }

      // Delete old screenshots from database
      try {
        const oldIds = existingScreenshots.map((s) => s.id);
        if (oldIds.length > 0) {
          await db
            .delete(podScreenshots)
            .where(inArray(podScreenshots.id, oldIds));
          console.log(
            `[Screenshots API] Deleted ${oldIds.length} old screenshot records from DB`,
          );
        }
      } catch (error) {
        console.error(
          "[Screenshots API] Failed to delete old screenshots from DB:",
          error,
        );
        // Don't fail the request if cleanup fails
      }
    }

    return NextResponse.json({
      success: true,
      screenshot,
    });
  } catch (error) {
    console.error("[Screenshots API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to save screenshot",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
