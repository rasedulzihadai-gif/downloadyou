import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const downloads = pgTable("downloads", {
  id: serial("id").primaryKey(),
  videoId: text("video_id").notNull(),
  videoTitle: text("video_title").notNull(),
  videoAuthor: text("video_author"),
  videoThumbnail: text("video_thumbnail"),
  videoDuration: integer("video_duration"),
  formatId: text("format_id").notNull(),
  formatLabel: text("format_label").notNull(),
  formatExt: text("format_ext").notNull(),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Download = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;
