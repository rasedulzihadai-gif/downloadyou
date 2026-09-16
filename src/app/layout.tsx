import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "DownloadYou — YouTube Video Downloader",
  description:
    "Download YouTube videos in any format — MP4, WebM, MP3 and more. Fast, free, and supports every quality from 144p to 4K.",
  keywords: [
    "YouTube downloader",
    "video downloader",
    "MP4",
    "MP3",
    "WebM",
    "4K",
    "1080p",
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
