import { sql } from "drizzle-orm";
import { pgTable, text, serial, integer, timestamp, varchar, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/chat";
export * from "./models/auth";

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt").default(""),
  aspectRatio: text("aspect_ratio").notNull().default("1:1"),
  stylize: integer("stylize").notNull().default(65),
  weirdness: integer("weirdness").notNull().default(0),
  variety: integer("variety").notNull().default(0),
  seed: integer("seed").notNull(),
  status: text("status").notNull().default("queued"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const images = pgTable("images", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  index: integer("index").notNull(),
  url: text("url").notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const imageLikes = pgTable("image_likes", {
  id: serial("id").primaryKey(),
  imageId: integer("image_id").notNull().references(() => images.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("image_likes_unique").on(table.imageId, table.userId),
]);

export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description").default(""),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const collectionItems = pgTable("collection_items", {
  id: serial("id").primaryKey(),
  collectionId: integer("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  imageId: integer("image_id").notNull().references(() => images.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
  uniqueIndex("collection_items_unique").on(table.collectionId, table.imageId),
]);

export const presets = pgTable("presets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  promptTemplate: text("prompt_template").default(""),
  negativePrompt: text("negative_prompt").default(""),
  aspectRatio: text("aspect_ratio").default("1:1"),
  stylize: integer("stylize").default(65),
  weirdness: integer("weirdness").default(0),
  variety: integer("variety").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const moodboards = pgTable("moodboards", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description").default(""),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const moodboardRefs = pgTable("moodboard_refs", {
  id: serial("id").primaryKey(),
  moodboardId: integer("moodboard_id").notNull().references(() => moodboards.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});


export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  status: true,
  createdAt: true,
});

export const insertImageSchema = createInsertSchema(images).omit({
  id: true,
  createdAt: true,
});

export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true,
  createdAt: true,
});

export const insertPresetSchema = createInsertSchema(presets).omit({
  id: true,
  createdAt: true,
});

export const insertMoodboardSchema = createInsertSchema(moodboards).omit({
  id: true,
  createdAt: true,
});


export type Job = typeof jobs.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type ImageRecord = typeof images.$inferSelect;
export type InsertImage = z.infer<typeof insertImageSchema>;
export type Collection = typeof collections.$inferSelect;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type CollectionItem = typeof collectionItems.$inferSelect;
export type Preset = typeof presets.$inferSelect;
export type InsertPreset = z.infer<typeof insertPresetSchema>;
export type Moodboard = typeof moodboards.$inferSelect;
export type InsertMoodboard = z.infer<typeof insertMoodboardSchema>;
export type MoodboardRef = typeof moodboardRefs.$inferSelect;

export type ImageLike = typeof imageLikes.$inferSelect;
