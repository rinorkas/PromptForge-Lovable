import { db } from "./db";
import { eq, desc, and, sql, ilike, count } from "drizzle-orm";
import {
  jobs, images, imageLikes, collections, collectionItems, presets, moodboards, moodboardRefs,
  type Job, type InsertJob,
  type ImageRecord, type InsertImage,
  type Collection, type InsertCollection,
  type CollectionItem,
  type Preset, type InsertPreset,
  type Moodboard, type InsertMoodboard,
  type MoodboardRef,
  type ImageLike,
} from "@shared/schema";
import { users } from "@shared/models/auth";

export interface IStorage {
  createJob(job: InsertJob): Promise<Job>;
  getJob(id: number): Promise<Job | undefined>;
  updateJobStatus(id: number, status: string): Promise<Job | undefined>;
  getJobsByUser(userId: string, limit?: number): Promise<Job[]>;

  createImage(image: InsertImage): Promise<ImageRecord>;
  getImagesByJob(jobId: number): Promise<ImageRecord[]>;
  getImage(id: number): Promise<ImageRecord | undefined>;
  setImagePublic(id: number, isPublic: boolean): Promise<ImageRecord | undefined>;
  getPublicImages(sort: string, search: string, limit: number, offset: number): Promise<{ image: ImageRecord; job: Job; likeCount: number; userName: string }[]>;
  getUserImages(userId: string, search: string, limit: number, offset: number): Promise<{ image: ImageRecord; job: Job }[]>;

  likeImage(imageId: number, userId: string): Promise<ImageLike>;
  unlikeImage(imageId: number, userId: string): Promise<void>;
  getImageLikes(imageId: number): Promise<number>;
  hasUserLiked(imageId: number, userId: string): Promise<boolean>;
  getUserLikedImageIds(userId: string, imageIds: number[]): Promise<number[]>;
  getUserLikedImages(userId: string, limit: number, offset: number): Promise<{ image: ImageRecord; job: Job }[]>;

  createCollection(col: InsertCollection): Promise<Collection>;
  getCollectionsByUser(userId: string): Promise<Collection[]>;
  getCollection(id: number): Promise<Collection | undefined>;
  deleteCollection(id: number): Promise<void>;
  addToCollection(collectionId: number, imageId: number): Promise<CollectionItem>;
  removeFromCollection(collectionId: number, imageId: number): Promise<void>;
  getCollectionItems(collectionId: number): Promise<{ item: CollectionItem; image: ImageRecord; job: Job }[]>;

  createPreset(preset: InsertPreset): Promise<Preset>;
  getPresetsByUser(userId: string): Promise<Preset[]>;
  getPreset(id: number): Promise<Preset | undefined>;
  updatePreset(id: number, data: Partial<InsertPreset>): Promise<Preset | undefined>;
  deletePreset(id: number): Promise<void>;

  createMoodboard(mb: InsertMoodboard): Promise<Moodboard>;
  getMoodboardsByUser(userId: string): Promise<Moodboard[]>;
  getMoodboard(id: number): Promise<Moodboard | undefined>;
  deleteMoodboard(id: number): Promise<void>;
  addMoodboardRef(moodboardId: number, url: string): Promise<MoodboardRef>;
  removeMoodboardRef(id: number): Promise<void>;
  getMoodboardRefs(moodboardId: number): Promise<MoodboardRef[]>;

}

export class DatabaseStorage implements IStorage {
  async createJob(job: InsertJob): Promise<Job> {
    const [created] = await db.insert(jobs).values(job).returning();
    return created;
  }

  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job;
  }

  async updateJobStatus(id: number, status: string): Promise<Job | undefined> {
    const [updated] = await db.update(jobs).set({ status }).where(eq(jobs.id, id)).returning();
    return updated;
  }

  async getJobsByUser(userId: string, limit = 20): Promise<Job[]> {
    return db.select().from(jobs).where(eq(jobs.userId, userId)).orderBy(desc(jobs.createdAt)).limit(limit);
  }

  async createImage(image: InsertImage): Promise<ImageRecord> {
    const [created] = await db.insert(images).values(image).returning();
    return created;
  }

  async getImagesByJob(jobId: number): Promise<ImageRecord[]> {
    return db.select().from(images).where(eq(images.jobId, jobId));
  }

  async getImage(id: number): Promise<ImageRecord | undefined> {
    const [img] = await db.select().from(images).where(eq(images.id, id));
    return img;
  }

  async setImagePublic(id: number, isPublic: boolean): Promise<ImageRecord | undefined> {
    const [updated] = await db.update(images).set({ isPublic }).where(eq(images.id, id)).returning();
    return updated;
  }

  async getPublicImages(sort: string, search: string, limit: number, offset: number) {
    const baseConditions = [eq(images.isPublic, true), eq(jobs.status, "done")];
    if (search) {
      baseConditions.push(ilike(jobs.prompt, `%${search}%`));
    }

    const rows = await db
      .select({
        image: images,
        job: jobs,
        likeCount: sql<number>`COALESCE((SELECT COUNT(*) FROM image_likes WHERE image_likes.image_id = ${images.id}), 0)`.as("like_count"),
        userName: sql<string>`COALESCE(${users.firstName}, 'Anonymous')`.as("user_name"),
      })
      .from(images)
      .innerJoin(jobs, eq(images.jobId, jobs.id))
      .leftJoin(users, eq(jobs.userId, users.id))
      .where(and(...baseConditions))
      .orderBy(
        sort === "top" ? desc(sql`like_count`) :
        sort === "hot" ? desc(sql`like_count`) :
        desc(images.createdAt)
      )
      .limit(limit)
      .offset(offset);

    return rows.map(r => ({
      image: r.image,
      job: r.job,
      likeCount: Number(r.likeCount),
      userName: r.userName || "Anonymous",
    }));
  }

  async getUserImages(userId: string, search: string, limit: number, offset: number) {
    const conditions = [eq(jobs.userId, userId), eq(jobs.status, "done")];
    if (search) {
      conditions.push(ilike(jobs.prompt, `%${search}%`));
    }

    return db
      .select({ image: images, job: jobs })
      .from(images)
      .innerJoin(jobs, eq(images.jobId, jobs.id))
      .where(and(...conditions))
      .orderBy(desc(images.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async likeImage(imageId: number, userId: string): Promise<ImageLike> {
    const [like] = await db.insert(imageLikes).values({ imageId, userId }).onConflictDoNothing().returning();
    if (!like) {
      const [existing] = await db.select().from(imageLikes).where(and(eq(imageLikes.imageId, imageId), eq(imageLikes.userId, userId)));
      return existing;
    }
    return like;
  }

  async unlikeImage(imageId: number, userId: string): Promise<void> {
    await db.delete(imageLikes).where(and(eq(imageLikes.imageId, imageId), eq(imageLikes.userId, userId)));
  }

  async getImageLikes(imageId: number): Promise<number> {
    const [result] = await db.select({ c: count() }).from(imageLikes).where(eq(imageLikes.imageId, imageId));
    return result?.c ?? 0;
  }

  async hasUserLiked(imageId: number, userId: string): Promise<boolean> {
    const [row] = await db.select().from(imageLikes).where(and(eq(imageLikes.imageId, imageId), eq(imageLikes.userId, userId)));
    return !!row;
  }

  async getUserLikedImageIds(userId: string, imageIds: number[]): Promise<number[]> {
    if (imageIds.length === 0) return [];
    const pgArray = `{${imageIds.join(",")}}`;
    const rows = await db.select({ imageId: imageLikes.imageId }).from(imageLikes).where(
      and(eq(imageLikes.userId, userId), sql`${imageLikes.imageId} = ANY(${pgArray}::int[])`)
    );
    return rows.map(r => r.imageId);
  }

  async getUserLikedImages(userId: string, limit: number, offset: number) {
    return db
      .select({ image: images, job: jobs })
      .from(imageLikes)
      .innerJoin(images, eq(imageLikes.imageId, images.id))
      .innerJoin(jobs, eq(images.jobId, jobs.id))
      .where(eq(imageLikes.userId, userId))
      .orderBy(desc(imageLikes.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async createCollection(col: InsertCollection): Promise<Collection> {
    const [created] = await db.insert(collections).values(col).returning();
    return created;
  }

  async getCollectionsByUser(userId: string): Promise<Collection[]> {
    return db.select().from(collections).where(eq(collections.userId, userId)).orderBy(desc(collections.createdAt));
  }

  async getCollection(id: number): Promise<Collection | undefined> {
    const [col] = await db.select().from(collections).where(eq(collections.id, id));
    return col;
  }

  async deleteCollection(id: number): Promise<void> {
    await db.delete(collections).where(eq(collections.id, id));
  }

  async addToCollection(collectionId: number, imageId: number): Promise<CollectionItem> {
    const [item] = await db.insert(collectionItems).values({ collectionId, imageId }).onConflictDoNothing().returning();
    if (!item) {
      const [existing] = await db.select().from(collectionItems).where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.imageId, imageId)));
      return existing;
    }
    return item;
  }

  async removeFromCollection(collectionId: number, imageId: number): Promise<void> {
    await db.delete(collectionItems).where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.imageId, imageId)));
  }

  async getCollectionItems(collectionId: number) {
    return db
      .select({ item: collectionItems, image: images, job: jobs })
      .from(collectionItems)
      .innerJoin(images, eq(collectionItems.imageId, images.id))
      .innerJoin(jobs, eq(images.jobId, jobs.id))
      .where(eq(collectionItems.collectionId, collectionId))
      .orderBy(desc(collectionItems.createdAt));
  }

  async createPreset(preset: InsertPreset): Promise<Preset> {
    const [created] = await db.insert(presets).values(preset).returning();
    return created;
  }

  async getPresetsByUser(userId: string): Promise<Preset[]> {
    return db.select().from(presets).where(eq(presets.userId, userId)).orderBy(desc(presets.createdAt));
  }

  async getPreset(id: number): Promise<Preset | undefined> {
    const [preset] = await db.select().from(presets).where(eq(presets.id, id));
    return preset;
  }

  async updatePreset(id: number, data: Partial<InsertPreset>): Promise<Preset | undefined> {
    const [updated] = await db.update(presets).set(data).where(eq(presets.id, id)).returning();
    return updated;
  }

  async deletePreset(id: number): Promise<void> {
    await db.delete(presets).where(eq(presets.id, id));
  }

  async createMoodboard(mb: InsertMoodboard): Promise<Moodboard> {
    const [created] = await db.insert(moodboards).values(mb).returning();
    return created;
  }

  async getMoodboardsByUser(userId: string): Promise<Moodboard[]> {
    return db.select().from(moodboards).where(eq(moodboards.userId, userId)).orderBy(desc(moodboards.createdAt));
  }

  async getMoodboard(id: number): Promise<Moodboard | undefined> {
    const [mb] = await db.select().from(moodboards).where(eq(moodboards.id, id));
    return mb;
  }

  async deleteMoodboard(id: number): Promise<void> {
    await db.delete(moodboards).where(eq(moodboards.id, id));
  }

  async addMoodboardRef(moodboardId: number, url: string): Promise<MoodboardRef> {
    const [ref] = await db.insert(moodboardRefs).values({ moodboardId, url }).returning();
    return ref;
  }

  async removeMoodboardRef(id: number): Promise<void> {
    await db.delete(moodboardRefs).where(eq(moodboardRefs.id, id));
  }

  async getMoodboardRefs(moodboardId: number): Promise<MoodboardRef[]> {
    return db.select().from(moodboardRefs).where(eq(moodboardRefs.moodboardId, moodboardId)).orderBy(desc(moodboardRefs.createdAt));
  }

}

export const storage = new DatabaseStorage();
