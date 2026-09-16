import { spawn } from "child_process";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type YtDlpFormat = {
  formatId: string;
  ext: string;
  resolution: string | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  abr: number | null;
  vbr: number | null;
  filesize: number | null;
  filesizeApprox: number | null;
  tbr: number | null;
  formatNote: string | null;
  protocol: string | null;
};

type VideoInfo = {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
  duration: number;
  description: string;
  viewCount: number;
  uploadDate: string;
  formats: YtDlpFormat[];
};

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1);
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const pathParts = u.pathname.split("/");
      const idx = pathParts.findIndex((p) => p === "shorts" || p === "embed");
      if (idx >= 0 && pathParts[idx + 1]) return pathParts[idx + 1];
    }
  } catch {
    return null;
  }
  return null;
}

async function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });
  });
}

export async function POST(req: NextRequest) {
  let body: { url?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url) {
    return Response.json({ error: "URL is required" }, { status: 400 });
  }

  if (!/^https?:\/\//i.test(url)) {
    return Response.json({ error: "Please provide a valid URL" }, { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return Response.json(
      { error: "Could not extract YouTube video ID from URL" },
      { status: 400 },
    );
  }

  try {
    const { stdout, code } = await runYtDlp([
      "--dump-json",
      "--no-warnings",
      "--no-playlist",
      "--skip-download",
      url,
    ]);

    if (code !== 0 || !stdout.trim()) {
      return Response.json(
        { error: "Failed to fetch video information. The video may be private or unavailable." },
        { status: 400 },
      );
    }

    const data = JSON.parse(stdout.trim().split("\n").pop() ?? "{}");

    const rawFormats: any[] = Array.isArray(data.formats) ? data.formats : [];

    const formats: YtDlpFormat[] = rawFormats
      .filter((f) => {
        // keep formats with a usable ext (skip storyboards / mhtml)
        if (!f.ext || f.ext === "mhtml" || f.protocol === "mhtml") return false;
        // keep video+audio combined or video-only or audio-only
        return true;
      })
      .map((f) => ({
        formatId: f.format_id,
        ext: f.ext,
        resolution:
          f.resolution && f.resolution !== "audio only"
            ? f.resolution
            : f.height
              ? `${f.height}p`
              : null,
        fps: typeof f.fps === "number" ? f.fps : null,
        vcodec: f.vcodec ?? null,
        acodec: f.acodec ?? null,
        abr: typeof f.abr === "number" ? f.abr : null,
        vbr: typeof f.vbr === "number" ? f.vbr : null,
        tbr: typeof f.tbr === "number" ? f.tbr : null,
        filesize:
          typeof f.filesize === "number" && f.filesize > 0 ? f.filesize : null,
        filesizeApprox:
          typeof f.filesize_approx === "number" && f.filesize_approx > 0
            ? f.filesize_approx
            : null,
        formatNote: f.format_note ?? null,
        protocol: f.protocol ?? null,
      }))
      .sort((a, b) => {
        // combined formats first, then highest resolution
        const aCombined = a.vcodec && a.vcodec !== "none" && a.acodec && a.acodec !== "none";
        const bCombined = b.vcodec && b.vcodec !== "none" && b.acodec && b.acodec !== "none";
        if (aCombined !== bCombined) return aCombined ? -1 : 1;
        const ta = a.tbr ?? a.vbr ?? a.abr ?? 0;
        const tb = b.tbr ?? b.vbr ?? b.abr ?? 0;
        return tb - ta;
      });

    const info: VideoInfo = {
      id: data.id ?? videoId,
      title: data.title ?? "Untitled video",
      author: data.uploader ?? data.channel ?? "Unknown",
      thumbnail:
        data.thumbnail ??
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: typeof data.duration === "number" ? data.duration : 0,
      description: data.description ?? "",
      viewCount: typeof data.view_count === "number" ? data.view_count : 0,
      uploadDate: data.upload_date ?? "",
      formats,
    };

    return Response.json({ ok: true, info });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: `Failed to fetch video info: ${message}` },
      { status: 500 },
    );
  }
}
