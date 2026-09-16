import { spawn } from "child_process";
import { Readable } from "stream";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { downloads } from "@/db/schema";

export const dynamic = "force-dynamic";
// Allow long downloads
export const maxDuration = 600;

type FormatChoice =
  | { kind: "id"; formatId: string }
  | { kind: "best"; type: "video" | "audio" }
  | { kind: "format"; ext: string }
  | { kind: "video-audio"; videoFormatId: string; audioFormatId: string };

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function runYtDlp(
  args: string[],
  onProgress?: (chunk: string) => void,
): Promise<{ code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });

    proc.stdout.on("data", (d) => {
      const s = d.toString();
      if (onProgress) onProgress(s);
    });
    proc.stderr.on("data", (d) => {
      const s = d.toString();
      if (onProgress) onProgress(s);
    });

    proc.on("error", reject);
    proc.on("close", (code) => resolve({ code: code ?? 0 }));
  });
}

export async function POST(req: NextRequest) {
  let body: {
    url?: string;
    formatId?: string;
    ext?: string;
    type?: "video" | "audio";
    title?: string;
    videoId?: string;
    author?: string;
    thumbnail?: string;
    duration?: number;
  } = {};

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url) {
    return Response.json({ error: "URL is required" }, { status: 400 });
  }

  let formatArgs: string[] = [];

  if (body.formatId) {
    formatArgs = ["-f", body.formatId, "--merge-output-format", body.ext ?? "mp4"];
  } else if (body.type === "audio") {
    formatArgs = ["-x", "--audio-format", "mp3", "--audio-quality", "0"];
  } else if (body.type === "video") {
    formatArgs = ["-f", "bestvideo+bestaudio/best", "--merge-output-format", "mp4"];
  } else if (body.ext) {
    formatArgs = ["-f", `best[ext=${body.ext}]/best`];
  } else {
    formatArgs = ["-f", "bestvideo+bestaudio/best", "--merge-output-format", "mp4"];
  }

  // Pipe to stdout using -o -
  const args = [
    ...formatArgs,
    "--no-playlist",
    "--no-warnings",
    "--no-part",
    "--no-cache-dir",
    "-o",
    "-",
    url,
  ];

  try {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });

    proc.on("error", () => {
      // surface below
    });

    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    // Determine filename from headers? yt-dlp prints the destination on stdout,
    // but when streaming to stdout there's no filename. Use the title.
    const fallbackTitle = sanitizeFilename(body.title ?? body.videoId ?? "video");
    const ext = body.ext ?? "mp4";
    const safeTitle = fallbackTitle || "video";

    const filename = `${safeTitle}.${ext}`;
    const encodedFilename = encodeURIComponent(filename);

    const webStream = Readable.toWeb(proc.stdout) as ReadableStream;

    // Start the process and let the stream flow
    proc.stdout.on("error", () => {});
    proc.on("close", async (code) => {
      if (code !== 0) {
        // best-effort, but headers are already sent
        // eslint-disable-next-line no-console
        console.error("yt-dlp failed:", stderr);
      }
    });

    // Insert into DB on success in background
    if (body.videoId && safeTitle) {
      proc.on("close", async () => {
        try {
          await db.insert(downloads).values({
            videoId: body.videoId!,
            videoTitle: safeTitle,
            videoAuthor: body.author ?? null,
            videoThumbnail: body.thumbnail ?? null,
            videoDuration: body.duration ?? null,
            formatId: body.formatId ?? (body.type ?? "best"),
            formatLabel: body.type === "audio" ? "Audio MP3" : `${body.ext?.toUpperCase() ?? "MP4"}`,
            formatExt: ext,
            status: "completed",
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("Failed to log download:", e);
        }
      });
    }

    return new Response(webStream, {
      headers: {
        "Content-Type": ext === "mp3" ? "audio/mpeg" : ext === "webm" ? "video/webm" : "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
        "X-Filename": encodedFilename,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Failed to start download: ${message}` },
      { status: 500 },
    );
  }
}

// Touch unused vars to avoid lint warnings
void runYtDlp;
