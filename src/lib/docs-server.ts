import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "./logger";

/**
 * Serve static files from docs/dist
 */
export const serveDocsFile = async (
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
): Promise<boolean> => {
  try {
    // Security: prevent path traversal
    if (filePath.includes("..")) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return true;
    }

    // Map root /docs to /docs/index.html
    let targetPath = filePath;
    if (targetPath === "/docs" || targetPath === "/docs/") {
      targetPath = "/docs/index.html";
    }

    // Remove /docs prefix and get file path
    const docsPath = targetPath.replace(/^\/docs\/?/, "");
    const fullPath = join(process.cwd(), "docs", "dist", docsPath || "index.html");

    // Check if path is a directory
    try {
      const stats = await stat(fullPath);
      if (stats.isDirectory()) {
        // If it's a directory, try to serve index.html from it
        return serveDocsFile(req, res, `${filePath}/index.html`);
      }
    } catch {
      // Path doesn't exist, continue to try reading as file
    }

    // Read file
    const content = await readFile(fullPath);

    // Determine content type
    const ext = fullPath.split(".").pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      ico: "image/x-icon",
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
      txt: "text/plain",
    };
    const contentType = contentTypes[ext || ""] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
    return true;
  } catch (error) {
    // File not found or error reading
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Try adding .html extension for clean URLs
      if (!filePath.endsWith(".html") && !filePath.includes(".")) {
        return serveDocsFile(req, res, `${filePath}.html`);
      }
      return false; // Let Next.js handle 404
    }

    // EISDIR error means we tried to read a directory
    if ((error as NodeJS.ErrnoException).code === "EISDIR") {
      return serveDocsFile(req, res, `${filePath}/index.html`);
    }

    logger.error({ err: error, path: filePath }, "Error serving docs file");
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
    return true;
  }
};

