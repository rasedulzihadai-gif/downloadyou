"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Format = {
  formatId: string;
  ext: string;
  resolution: string | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  abr: number | null;
  vbr: number | null;
  tbr: number | null;
  filesize: number | null;
  filesizeApprox: number | null;
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
  formats: Format[];
};

type DownloadRecord = {
  id: number;
  videoId: string;
  videoTitle: string;
  videoAuthor: string | null;
  videoThumbnail: string | null;
  formatLabel: string;
  formatExt: string;
  createdAt: string;
};

type Category = "all" | "video" | "audio";

const EXT_BADGES: Record<string, string> = {
  mp4: "badge-blue",
  webm: "badge-purple",
  mkv: "badge-yellow",
  m4a: "badge-green",
  mp3: "badge-green",
  opus: "badge-green",
};

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatViews(views: number): string {
  if (!views) return "—";
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K views`;
  return `${views} views`;
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return "";
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  return `${y}-${m}-${d}`;
}

function classifyFormat(f: Format): "video" | "audio" {
  const hasVideo = f.vcodec && f.vcodec !== "none";
  const hasAudio = f.acodec && f.acodec !== "none";
  if (hasVideo && !hasAudio) return "video";
  if (!hasVideo && hasAudio) return "audio";
  // Both or neither → treat as video
  return "video";
}

function formatLabel(f: Format): string {
  const res = f.resolution ?? (classifyFormat(f) === "audio" ? "Audio" : "—");
  if (classifyFormat(f) === "audio") {
    const abr = f.abr ? `${Math.round(f.abr)}kbps` : "";
    return `${res}${abr ? " · " + abr : ""}`;
  }
  const fps = f.fps && f.fps >= 50 ? `${Math.round(f.fps)}fps` : "";
  const parts = [res, fps].filter(Boolean);
  return parts.join(" · ");
}

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [selectedFormatId, setSelectedFormatId] = useState<string | null>(null);
  const [downloadType, setDownloadType] = useState<"specific" | "best-video" | "best-audio">(
    "best-video",
  );
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [history, setHistory] = useState<DownloadRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      if (data.ok) setHistory(data.items);
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleFetch = async () => {
    setError(null);
    setInfo(null);
    setSelectedFormatId(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please paste a YouTube URL first");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to fetch video information");
        return;
      }
      setInfo(data.info);
      // Auto-select the best format by default
      const bestCombined = data.info.formats.find(
        (f: Format) =>
          f.vcodec &&
          f.vcodec !== "none" &&
          f.acodec &&
          f.acodec !== "none",
      );
      if (bestCombined) {
        setSelectedFormatId(bestCombined.formatId);
        setDownloadType("specific");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      /* ignore */
    }
  };

  const handleDownload = async () => {
    if (!info) return;
    setError(null);
    setDownloading(true);
    setDownloadProgress("Preparing your download…");

    let body: any = { url: url.trim(), title: info.title, videoId: info.id, author: info.author, thumbnail: info.thumbnail, duration: info.duration };

    if (downloadType === "best-audio") {
      body.type = "audio";
      body.ext = "mp3";
    } else if (downloadType === "best-video") {
      body.type = "video";
      body.ext = "mp4";
    } else if (selectedFormatId) {
      const f = info.formats.find((x) => x.formatId === selectedFormatId);
      if (!f) {
        setError("Selected format not found");
        setDownloading(false);
        return;
      }
      body.formatId = f.formatId;
      body.ext = f.ext;
    }

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        let msg = "Download failed";
        try {
          const data = JSON.parse(text);
          msg = data.error ?? msg;
        } catch {
          msg = text || msg;
        }
        setError(msg);
        setDownloading(false);
        setDownloadProgress(null);
        return;
      }

      // Get filename from headers
      const disposition = res.headers.get("Content-Disposition") ?? "";
      let filename = `${info.title}.${body.ext ?? "mp4"}`;
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/);
      const plainMatch = disposition.match(/filename="?([^"]+)"?/);
      if (utf8Match) {
        filename = decodeURIComponent(utf8Match[1]);
      } else if (plainMatch) {
        filename = plainMatch[1];
      }

      // Stream the response to a Blob and trigger download
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);

      setDownloadProgress("Download complete ✓");
      // Refresh history
      setTimeout(() => loadHistory(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
      setDownloadProgress(null);
    } finally {
      setTimeout(() => {
        setDownloading(false);
        setDownloadProgress(null);
      }, 1500);
    }
  };

  const categories = useMemo<Record<Category, number>>(() => {
    const counts: Record<Category, number> = { all: 0, video: 0, audio: 0 };
    if (!info) return counts;
    counts.all = info.formats.length;
    info.formats.forEach((f) => {
      const c = classifyFormat(f);
      counts[c]++;
    });
    return counts;
  }, [info]);

  const filteredFormats = useMemo(() => {
    if (!info) return [];
    const list = info.formats.filter((f) => {
      if (category === "all") return true;
      return classifyFormat(f) === category;
    });
    return list.sort((a, b) => {
      const ra = parseInt(a.resolution ?? "0") || 0;
      const rb = parseInt(b.resolution ?? "0") || 0;
      if (rb !== ra) return rb - ra;
      const ta = a.tbr ?? a.vbr ?? a.abr ?? 0;
      const tb = b.tbr ?? b.vbr ?? b.abr ?? 0;
      return tb - ta;
    });
  }, [info, category]);

  return (
    <main className="min-h-screen px-4 py-8 md:py-16">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <header className="mb-10 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-zinc-400">
            <span className="inline-block size-2 rounded-full bg-red-500 pulse" />
            Powered by yt-dlp — supports every YouTube format
          </div>
          <h1 className="text-5xl font-bold tracking-tight md:text-7xl">
            <span className="gradient-text">Download</span>
            <span className="text-white">You</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-zinc-400 md:text-lg">
            Paste any YouTube link and grab it in MP4, WebM, MP3, M4A, and more — from 144p
            up to 4K. Fast, free, no signup.
          </p>
        </header>

        {/* URL input */}
        <section className="glass-strong rounded-3xl p-4 shadow-2xl md:p-6">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) handleFetch();
                }}
                placeholder="https://www.youtube.com/watch?v=..."
                className="input pr-32 md:pr-36"
                spellCheck={false}
              />
              <button
                onClick={handlePaste}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-400 hover:text-white"
                type="button"
              >
                📋 Paste
              </button>
            </div>
            <button
              onClick={handleFetch}
              disabled={loading}
              className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Fetching…
                </>
              ) : (
                <>🔍 Get Video</>
              )}
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <span className="text-base">⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </section>

        {/* Video info & formats */}
        {info && (
          <section className="glass-strong mt-6 rounded-3xl p-5 md:p-7">
            <div className="flex flex-col gap-5 md:flex-row md:items-start">
              <a
                href={`https://www.youtube.com/watch?v=${info.id}`}
                target="_blank"
                rel="noreferrer"
                className="block flex-shrink-0 overflow-hidden rounded-2xl border border-white/10"
              >
                <img
                  src={info.thumbnail}
                  alt={info.title}
                  className="h-44 w-full object-cover md:h-32 md:w-56"
                />
              </a>
              <div className="min-w-0 flex-1">
                <h2 className="line-clamp-2 text-xl font-semibold leading-tight md:text-2xl">
                  {info.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                  <span className="badge">
                    <span>👤</span> {info.author}
                  </span>
                  <span className="badge">
                    <span>⏱️</span> {formatDuration(info.duration)}
                  </span>
                  <span className="badge">
                    <span>👁️</span> {formatViews(info.viewCount)}
                  </span>
                  {info.uploadDate && (
                    <span className="badge">
                      <span>📅</span> {formatDate(info.uploadDate)}
                    </span>
                  )}
                  <span className="badge badge-accent">
                    {info.formats.length} formats
                  </span>
                </div>
              </div>
            </div>

            {/* Quick download mode */}
            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
              <button
                onClick={() => {
                  setDownloadType("best-video");
                  setSelectedFormatId(null);
                }}
                className={`format-row text-left ${downloadType === "best-video" ? "selected" : ""}`}
              >
                <div>
                  <div className="font-semibold">🎬 Best Video</div>
                  <div className="text-xs text-zinc-400">
                    Highest quality MP4 (video + audio)
                  </div>
                </div>
                <span className="badge badge-blue">MP4</span>
              </button>
              <button
                onClick={() => {
                  setDownloadType("best-audio");
                  setSelectedFormatId(null);
                }}
                className={`format-row text-left ${downloadType === "best-audio" ? "selected" : ""}`}
              >
                <div>
                  <div className="font-semibold">🎵 Audio Only</div>
                  <div className="text-xs text-zinc-400">Extract MP3 at best quality</div>
                </div>
                <span className="badge badge-green">MP3</span>
              </button>
              <button
                onClick={() => setDownloadType("specific")}
                className={`format-row text-left ${downloadType === "specific" ? "selected" : ""}`}
              >
                <div>
                  <div className="font-semibold">⚙️ Custom Format</div>
                  <div className="text-xs text-zinc-400">Pick any specific format below</div>
                </div>
                <span className="badge badge-purple">Custom</span>
              </button>
            </div>

            {/* Filter tabs */}
            <div className="mt-6 flex items-center gap-2 overflow-x-auto scroll-hide border-b border-white/5 pb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Filter:
              </span>
              <button
                onClick={() => setCategory("all")}
                className={`tab ${category === "all" ? "active" : ""}`}
              >
                All ({categories.all})
              </button>
              <button
                onClick={() => setCategory("video")}
                className={`tab ${category === "video" ? "active" : ""}`}
              >
                🎬 Video ({categories.video})
              </button>
              <button
                onClick={() => setCategory("audio")}
                className={`tab ${category === "audio" ? "active" : ""}`}
              >
                🎵 Audio ({categories.audio})
              </button>
            </div>

            {/* Format list */}
            <div className="mt-4 max-h-[440px] overflow-y-auto pr-1">
              {filteredFormats.length === 0 ? (
                <div className="py-8 text-center text-sm text-zinc-500">
                  No formats in this category
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredFormats.map((f) => {
                    const isAudio = classifyFormat(f) === "audio";
                    const size = f.filesize ?? f.filesizeApprox;
                    return (
                      <button
                        key={f.formatId}
                        onClick={() => {
                          setDownloadType("specific");
                          setSelectedFormatId(f.formatId);
                        }}
                        className={`format-row text-left ${
                          selectedFormatId === f.formatId ? "selected" : ""
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-base">
                            {isAudio ? "🎵" : "🎬"}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 font-medium">
                              <span>{formatLabel(f)}</span>
                              <span className={`badge ${EXT_BADGES[f.ext] ?? ""}`}>
                                {f.ext.toUpperCase()}
                              </span>
                              {f.vcodec && f.vcodec !== "none" && !isAudio && (
                                <span className="hidden text-xs text-zinc-500 md:inline">
                                  {f.vcodec.split(".")[0]}
                                </span>
                              )}
                              {f.acodec && f.acodec !== "none" && isAudio && (
                                <span className="hidden text-xs text-zinc-500 md:inline">
                                  {f.acodec.split(".")[0]}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-zinc-500">
                              {f.formatNote && <span>{f.formatNote}</span>}
                              {f.protocol && (
                                <>
                                  {f.formatNote && " · "}
                                  <span>{f.protocol}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end gap-1">
                          <span className="text-sm font-medium text-zinc-300">
                            {formatFileSize(size)}
                          </span>
                          {f.tbr && (
                            <span className="text-xs text-zinc-500">
                              {Math.round(f.tbr)}k
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Download action */}
            <div className="mt-6 flex flex-col gap-3 border-t border-white/5 pt-5 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-zinc-400">
                {downloadType === "specific" && selectedFormatId
                  ? `Selected: ${
                      info.formats.find((f) => f.formatId === selectedFormatId)?.ext.toUpperCase() ?? ""
                    } · ${
                      formatLabel(
                        info.formats.find((f) => f.formatId === selectedFormatId) as Format,
                      )
                    }`
                  : downloadType === "best-audio"
                    ? "Best audio quality (MP3)"
                    : "Best video quality (MP4)"}
              </div>
              <button
                onClick={handleDownload}
                disabled={downloading || (downloadType === "specific" && !selectedFormatId)}
                className="btn-primary flex items-center justify-center gap-2"
              >
                {downloading ? (
                  <>
                    <span className="spinner" />
                    {downloadProgress ?? "Downloading…"}
                  </>
                ) : (
                  <>⬇️ Download Now</>
                )}
              </button>
            </div>
          </section>
        )}

        {/* History */}
        {history.length > 0 && (
          <section className="glass mt-8 rounded-3xl p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">📥 Recent Downloads</h3>
              <button
                onClick={async () => {
                  await fetch("/api/history", { method: "DELETE" });
                  loadHistory();
                }}
                className="text-xs text-zinc-500 hover:text-red-400"
              >
                Clear history
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {history.slice(0, 8).map((h) => (
                <div
                  key={h.id}
                  className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3"
                >
                  {h.videoThumbnail && (
                    <img
                      src={h.videoThumbnail}
                      alt={h.videoTitle}
                      className="size-16 flex-shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" title={h.videoTitle}>
                      {h.videoTitle}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      <span className={`badge ${EXT_BADGES[h.formatExt] ?? ""} text-[10px] py-0.5`}>
                        {h.formatExt.toUpperCase()}
                      </span>
                      <span>·</span>
                      <span>{new Date(h.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Feature grid */}
        {!info && (
          <section className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                icon: "🎬",
                title: "Every format",
                desc: "MP4, WebM, MKV, MP3, M4A, Opus. From 144p up to full 4K.",
              },
              {
                icon: "⚡",
                title: "Lightning fast",
                desc: "Streamed straight from YouTube's servers through yt-dlp.",
              },
              {
                icon: "🔒",
                title: "Private & safe",
                desc: "No accounts. No tracking. Your downloads stay yours.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="glass rounded-2xl p-5"
              >
                <div className="mb-2 text-3xl">{f.icon}</div>
                <div className="font-semibold">{f.title}</div>
                <div className="mt-1 text-sm text-zinc-400">{f.desc}</div>
              </div>
            ))}
          </section>
        )}

        <footer className="mt-16 text-center text-xs text-zinc-600">
          DownloadYou · Built with Next.js + yt-dlp · For personal use only — respect
          copyright laws.
        </footer>
      </div>
    </main>
  );
}
