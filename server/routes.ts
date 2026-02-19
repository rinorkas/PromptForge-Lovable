import type { Express, Request, Response } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { openai } from "./replit_integrations/image/client";
import { toFile } from "openai";
import { isAuthenticated } from "./replit_integrations/auth";
import { z } from "zod";

function stripImageUrl(img: any) {
  return { ...img, url: `/api/images/${img.id}/data` };
}

const generateSchema = z.object({
  prompt: z.string().min(1).max(2000),
  negativePrompt: z.string().max(1000).optional().default(""),
  aspectRatio: z.enum(["1:1", "3:4", "4:3"]).optional().default("1:1"),
  stylize: z.number().int().min(0).max(100).optional().default(65),
  weirdness: z.number().int().min(0).max(100).optional().default(0),
  variety: z.number().int().min(0).max(100).optional().default(0),
  seed: z.number().int().optional(),
  presetId: z.number().int().optional(),
  moodboardId: z.number().int().optional(),
  referenceImageId: z.number().int().optional(),
  styleModifier: z.string().max(2000).optional(),
});

function aspectToSize(aspect: string): "1024x1024" | "1024x1536" | "1536x1024" {
  switch (aspect) {
    case "3:4": return "1024x1536";
    case "4:3": return "1536x1024";
    default: return "1024x1024";
  }
}

function buildFullPrompt(prompt: string, negative: string, stylize: number, weirdness: number = 0, variety: number = 0): string {
  let full = prompt;
  if (stylize > 70) {
    full += ". Highly artistic, stylized, vivid colors, dramatic lighting";
  } else if (stylize > 40) {
    full += ". Balanced style, moderate artistic interpretation";
  }
  if (weirdness > 75) {
    full += ". Surreal, dreamlike, abstract distortion, impossible geometry, otherworldly atmosphere, unexpected juxtapositions, avant-garde";
  } else if (weirdness > 50) {
    full += ". Surreal undertones, slightly dreamlike quality, creative unexpected elements, unconventional composition";
  } else if (weirdness > 25) {
    full += ". Slightly unconventional, subtle creative interpretation, hint of whimsy";
  }
  if (variety > 75) {
    full += ". Highly diverse interpretation, experimental approach, bold creative choices, unexpected perspective, unique artistic vision";
  } else if (variety > 50) {
    full += ". Creative interpretation, diverse artistic choices, varied composition, fresh perspective";
  } else if (variety > 25) {
    full += ". Some creative variation, slightly different perspective";
  }
  if (negative) {
    full += `. Avoid: ${negative}`;
  }
  return full;
}

function getUserId(req: Request): string {
  return (req as any).user?.claims?.sub;
}

async function generateOneImage(
  fullPrompt: string,
  size: "1024x1024" | "1024x1536" | "1536x1024",
  jobId: number,
  index: number,
): Promise<{ image?: any; error?: string }> {
  const maxRetries = 2;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[gen] Job ${jobId} image ${index} attempt ${attempt + 1}, prompt: "${fullPrompt.slice(0, 120)}..."`);
      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt: fullPrompt,
        n: 1,
        size,
      });
      const b64 = response.data?.[0]?.b64_json ?? "";
      const dataUrl = `data:image/png;base64,${b64}`;
      const img = await storage.createImage({ jobId, index, url: dataUrl });
      return { image: img };
    } catch (err: any) {
      const code = err?.code || err?.error?.code || "";
      console.error(`Image generation ${index} attempt ${attempt + 1} failed (${code}):`, err?.message || err);
      if (code === "moderation_blocked") {
        return { error: "moderation_blocked" };
      }
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  return { error: "generation_failed" };
}

async function applyEnhancements(userId: string, prompt: string, negative: string, aspect: string, stylize: number, weirdness: number, variety: number, body: any) {
  let finalPrompt = prompt;
  let finalNegative = negative;
  let finalAspect = aspect;
  let finalStylize = stylize;
  let finalWeirdness = weirdness;
  let finalVariety = variety;

  if (body.presetId) {
    const preset = await storage.getPreset(body.presetId);
    if (preset && preset.userId === userId) {
      if (preset.promptTemplate) {
        finalPrompt = preset.promptTemplate.includes("{prompt}")
          ? preset.promptTemplate.replace("{prompt}", prompt)
          : `${prompt}. ${preset.promptTemplate}`;
      }
      if (preset.negativePrompt) finalNegative = preset.negativePrompt;
      if (preset.aspectRatio) finalAspect = preset.aspectRatio;
      if (preset.stylize !== null) finalStylize = preset.stylize!;
      if (preset.weirdness !== null && preset.weirdness !== undefined) finalWeirdness = preset.weirdness;
      if (preset.variety !== null && preset.variety !== undefined) finalVariety = preset.variety;
    }
  }

  if (body.moodboardId) {
    const mb = await storage.getMoodboard(body.moodboardId);
    if (mb && mb.userId === userId) {
      const refs = await storage.getMoodboardRefs(mb.id);
      if (mb.description) {
        finalPrompt += `. Style inspired by: ${mb.description}`;
      }
      if (refs.length > 0) {
        try {
          const refSample = refs.slice(0, 3);
          const analysisMessages: any[] = [
            {
              role: "user",
              content: [
                { type: "text", text: "Analyze the artistic style of these reference images. Describe the style in 2-3 short sentences focusing on: color palette, mood, composition, technique, and aesthetic. Be concise." },
                ...refSample.map((r: any) => ({
                  type: "image_url" as const,
                  image_url: { url: r.url },
                })),
              ],
            },
          ];
          const analysis = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: analysisMessages,
            max_tokens: 200,
          });
          const styleDescription = analysis.choices?.[0]?.message?.content;
          if (styleDescription) {
            finalPrompt += `. Apply this artistic style: ${styleDescription}`;
          }
        } catch (err) {
          console.error("Moodboard ref analysis failed, continuing without:", err);
        }
      }
    }
  }

  return { finalPrompt, finalNegative, finalAspect, finalStylize, finalWeirdness, finalVariety };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Jobs / Generation ──

  app.post("/api/jobs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const parsed = generateSchema.parse(req.body);
      const seed = parsed.seed ?? Math.floor(Math.random() * 1000000000);

      let { finalPrompt, finalNegative, finalAspect, finalStylize, finalWeirdness, finalVariety } = await applyEnhancements(
        userId, parsed.prompt, parsed.negativePrompt || "", parsed.aspectRatio, parsed.stylize, parsed.weirdness, parsed.variety, parsed
      );

      if (parsed.styleModifier) {
        finalPrompt += `. Style: ${parsed.styleModifier}`;
      }

      const job = await storage.createJob({
        userId,
        prompt: parsed.prompt,
        negativePrompt: parsed.negativePrompt,
        aspectRatio: finalAspect,
        stylize: finalStylize,
        weirdness: finalWeirdness,
        variety: finalVariety,
        seed,
      });

      await storage.updateJobStatus(job.id, "processing");

      const size = aspectToSize(finalAspect);
      const fullPrompt = buildFullPrompt(finalPrompt, finalNegative, finalStylize, finalWeirdness, finalVariety);

      let results;
      if (parsed.referenceImageId) {
        const refImage = await storage.getImage(parsed.referenceImageId);
        if (refImage) {
          const imgMatch = refImage.url.match(/^data:([^;]+);base64,(.+)$/);
          if (imgMatch) {
            const imgBuffer = Buffer.from(imgMatch[2], "base64");
            const imageFile = await toFile(imgBuffer, "reference.png", { type: "image/png" });
            const genWithRef = async (index: number): Promise<{ image?: any; error?: string }> => {
              try {
                const response = await openai.images.edit({
                  model: "gpt-image-1",
                  image: imageFile,
                  prompt: fullPrompt,
                  n: 1,
                  size: size as any,
                });
                const b64 = response.data?.[0]?.b64_json ?? "";
                const dataUrl = `data:image/png;base64,${b64}`;
                const img = await storage.createImage({ jobId: job.id, index, url: dataUrl });
                return { image: img };
              } catch (err: any) {
                const code = err?.code || err?.error?.code || "";
                console.error(`Reference image generation ${index} failed (${code}):`, err?.message || err);
                if (code === "moderation_blocked") return { error: "moderation_blocked" };
                return { error: "generation_failed" };
              }
            };
            results = await Promise.all([genWithRef(1), genWithRef(2)]);
          } else {
            results = await Promise.all([
              generateOneImage(fullPrompt, size, job.id, 1),
              generateOneImage(fullPrompt, size, job.id, 2),
            ]);
          }
        } else {
          results = await Promise.all([
            generateOneImage(fullPrompt, size, job.id, 1),
            generateOneImage(fullPrompt, size, job.id, 2),
          ]);
        }
      } else {
        results = await Promise.all([
          generateOneImage(fullPrompt, size, job.id, 1),
          generateOneImage(fullPrompt, size, job.id, 2),
        ]);
      }

      const successCount = results.filter((r: any) => r?.image).length;
      const moderationBlocked = results.some((r: any) => r?.error === "moderation_blocked");

      if (successCount === 0) {
        await storage.updateJobStatus(job.id, "failed");
        if (moderationBlocked) {
          res.status(400).json({ error: "Your prompt was blocked by the content safety filter. Try rephrasing your prompt." });
        } else {
          res.status(500).json({ error: "All image generations failed. Please try again." });
        }
        return;
      }

      await storage.updateJobStatus(job.id, "done");

      const imgs = await storage.getImagesByJob(job.id);
      const updatedJob = await storage.getJob(job.id);

      res.json({ job: updatedJob, images: imgs.map(stripImageUrl) });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid request", details: err.errors });
        return;
      }
      console.error("Job creation error:", err);
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/jobs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id as string, 10);
      const job = await storage.getJob(id);
      if (!job || job.userId !== userId) { res.status(404).json({ error: "Job not found" }); return; }
      const imgs = await storage.getImagesByJob(id);
      res.json({ job, images: imgs.map(stripImageUrl) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/jobs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const allJobs = await storage.getJobsByUser(userId, limit);

      const results = await Promise.all(
        allJobs.map(async (j) => {
          const imgs = await storage.getImagesByJob(j.id);
          return { job: j, images: imgs.map(stripImageUrl) };
        })
      );

      res.json(results);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/jobs/:id/reroll", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id as string, 10);
      const original = await storage.getJob(id);
      if (!original || original.userId !== userId) { res.status(404).json({ error: "Job not found" }); return; }

      const newSeed = (original.seed + Math.floor(Math.random() * 99991) + 17) % 1000000000;

      const job = await storage.createJob({
        userId,
        prompt: original.prompt,
        negativePrompt: original.negativePrompt,
        aspectRatio: original.aspectRatio,
        stylize: original.stylize,
        weirdness: original.weirdness,
        variety: original.variety,
        seed: newSeed,
      });

      await storage.updateJobStatus(job.id, "processing");

      const size = aspectToSize(original.aspectRatio);
      const fullPrompt = buildFullPrompt(original.prompt, original.negativePrompt || "", original.stylize, original.weirdness, original.variety);

      const results = await Promise.all(
        [1, 2].map((index) => generateOneImage(fullPrompt, size, job.id, index))
      );

      const successCount = results.filter((r) => r?.image).length;
      const moderationBlocked = results.some((r) => r?.error === "moderation_blocked");
      if (successCount === 0) {
        await storage.updateJobStatus(job.id, "failed");
        if (moderationBlocked) {
          res.status(400).json({ error: "Your prompt was blocked by the content safety filter. Try rephrasing your prompt." });
        } else {
          res.status(500).json({ error: "Reroll failed. Please try again." });
        }
        return;
      }
      await storage.updateJobStatus(job.id, "done");

      const imgs = await storage.getImagesByJob(job.id);
      const updatedJob = await storage.getJob(job.id);
      res.json({ job: updatedJob, images: imgs.map(stripImageUrl) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/images/:imageId/vary", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const imageId = parseInt(req.params.imageId as string, 10);
      const { strength = "subtle" } = req.body;
      const srcImage = await storage.getImage(imageId);
      if (!srcImage) { res.status(404).json({ error: "Image not found" }); return; }

      const srcJob = await storage.getJob(srcImage.jobId);
      if (!srcJob || srcJob.userId !== userId) { res.status(404).json({ error: "Original job not found" }); return; }

      const styleDelta = strength === "subtle" ? -5 : 10;
      const newStylize = Math.max(10, Math.min(95, srcJob.stylize + styleDelta));
      const newSeed = (srcJob.seed + (strength === "subtle" ? 11 : 37) + Math.floor(Math.random() * 999)) % 1000000000;

      const variationSuffix = strength === "subtle"
        ? ". Create a subtle variation of this image, keeping the same subject, composition, and overall look with only minor differences in details"
        : ". Create a strong variation of this image, keeping the same subject but with noticeably different composition, lighting, or style";

      const job = await storage.createJob({
        userId,
        prompt: `${srcJob.prompt} (variation)`,
        negativePrompt: srcJob.negativePrompt,
        aspectRatio: srcJob.aspectRatio,
        stylize: newStylize,
        weirdness: srcJob.weirdness,
        variety: srcJob.variety,
        seed: newSeed,
      });

      await storage.updateJobStatus(job.id, "processing");

      const size = aspectToSize(srcJob.aspectRatio);
      const fullPrompt = buildFullPrompt(srcJob.prompt + variationSuffix, srcJob.negativePrompt || "", newStylize, srcJob.weirdness, srcJob.variety);

      const srcMatch = srcImage.url.match(/^data:([^;]+);base64,(.+)$/);
      if (!srcMatch) {
        await storage.updateJobStatus(job.id, "failed");
        res.status(500).json({ error: "Could not read source image data" });
        return;
      }
      const srcBuffer = Buffer.from(srcMatch[2], "base64");

      const results = await Promise.all(
        [1, 2].map(async (index) => {
          const maxRetries = 2;
          for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
              console.log(`[vary] Job ${job.id} image ${index} attempt ${attempt + 1}`);
              const imageFile = await toFile(srcBuffer, "source.png", { type: "image/png" });
              const response = await openai.images.edit({
                model: "gpt-image-1",
                image: imageFile,
                prompt: fullPrompt,
                n: 1,
                size: size as any,
              });
              const b64 = response.data?.[0]?.b64_json ?? "";
              if (!b64) {
                console.error(`Vary ${index} attempt ${attempt + 1}: empty b64 response`);
                if (attempt < maxRetries - 1) {
                  await new Promise(r => setTimeout(r, 2000));
                  continue;
                }
                return { error: "failed" };
              }
              const dataUrl = `data:image/png;base64,${b64}`;
              const img = await storage.createImage({ jobId: job.id, index, url: dataUrl });
              return { image: img };
            } catch (err: any) {
              const code = err?.code || err?.error?.code || "";
              console.error(`Vary ${index} attempt ${attempt + 1} failed (${code}):`, err?.message || err);
              if (code === "moderation_blocked") {
                return { error: "moderation_blocked" };
              }
              if (attempt < maxRetries - 1) {
                await new Promise(r => setTimeout(r, 2000));
              }
            }
          }
          return { error: "failed" };
        })
      );

      const successCount = results.filter((r) => r?.image).length;
      const moderationBlocked = results.some((r) => r?.error === "moderation_blocked");
      if (successCount === 0) {
        await storage.updateJobStatus(job.id, "failed");
        if (moderationBlocked) {
          res.status(400).json({ error: "Your prompt was blocked by the content safety filter. Try rephrasing your prompt." });
        } else {
          res.status(500).json({ error: "Variation failed. Please try again." });
        }
        return;
      }
      await storage.updateJobStatus(job.id, "done");

      const imgs = await storage.getImagesByJob(job.id);
      const updatedJob = await storage.getJob(job.id);
      res.json({ job: updatedJob, images: imgs.map(stripImageUrl) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/images/:imageId/upscale", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const imageId = parseInt(req.params.imageId as string, 10);
      const mode = (req.body?.mode === "creative") ? "creative" : "subtle";
      const srcImage = await storage.getImage(imageId);
      if (!srcImage) { res.status(404).json({ error: "Image not found" }); return; }

      const srcJob = await storage.getJob(srcImage.jobId);
      if (!srcJob || srcJob.userId !== userId) { res.status(404).json({ error: "Original job not found" }); return; }

      const newSeed = (srcJob.seed + 97 * srcImage.index) % 1000000000;

      const modeLabel = mode === "creative" ? "creative upscale" : "subtle upscale";
      const job = await storage.createJob({
        userId,
        prompt: `${srcJob.prompt} (${modeLabel} 2×)`,
        negativePrompt: srcJob.negativePrompt,
        aspectRatio: srcJob.aspectRatio,
        stylize: srcJob.stylize,
        weirdness: srcJob.weirdness,
        variety: srcJob.variety,
        seed: newSeed,
      });

      await storage.updateJobStatus(job.id, "processing");

      const srcMatch = srcImage.url.match(/^data:([^;]+);base64,(.+)$/);
      if (!srcMatch) {
        await storage.updateJobStatus(job.id, "failed");
        res.status(500).json({ error: "Could not read source image data" });
        return;
      }
      const srcBuffer = Buffer.from(srcMatch[2], "base64");

      const sharp = (await import("sharp")).default;
      const metadata = await sharp(srcBuffer).metadata();
      const origW = metadata.width || 1024;
      const origH = metadata.height || 1024;
      const MAX_DIM = 4096;
      const cappedW = Math.min(origW * 2, MAX_DIM);
      const cappedH = Math.min(origH * 2, MAX_DIM);

      if (mode === "subtle") {
        console.log(`[upscale-subtle] Job ${job.id}: resizing ${origW}×${origH} → ${cappedW}×${cappedH}`);
        const upscaledBuffer = await sharp(srcBuffer)
          .resize(cappedW, cappedH, { kernel: sharp.kernel.lanczos3 })
          .webp({ quality: 90 })
          .toBuffer();

        const dataUrl = `data:image/webp;base64,${upscaledBuffer.toString("base64")}`;
        await storage.createImage({ jobId: job.id, index: 1, url: dataUrl });
        await storage.updateJobStatus(job.id, "done");
      } else {
        const editSize = aspectToSize(srcJob.aspectRatio) as any;
        console.log(`[upscale-creative] Job ${job.id}: AI-enhanced upscale ${origW}×${origH} → ${cappedW}×${cappedH} (AI size: ${editSize})`);

        const fullPrompt = "Reproduce this exact image with enhanced fine details, sharper textures, and refined edges. Keep all content, composition, colors, lighting, and subjects exactly the same. Do not add, remove, or change any elements.";

        let result: { image?: any; error?: string } = { error: "failed" };
        const maxRetries = 2;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const imageFile = await toFile(srcBuffer, "source.png", { type: "image/png" });
            const response = await openai.images.edit({
              model: "gpt-image-1",
              image: imageFile,
              prompt: fullPrompt,
              n: 1,
              size: editSize,
            });
            const b64 = response.data?.[0]?.b64_json ?? "";
            if (!b64) {
              if (attempt < maxRetries - 1) { await new Promise(r => setTimeout(r, 2000)); continue; }
              break;
            }
            const aiBuffer = Buffer.from(b64, "base64");
            const upscaledBuffer = await sharp(aiBuffer)
              .resize(cappedW, cappedH, { kernel: sharp.kernel.lanczos3 })
              .webp({ quality: 90 })
              .toBuffer();
            const dataUrl = `data:image/webp;base64,${upscaledBuffer.toString("base64")}`;
            const img = await storage.createImage({ jobId: job.id, index: 1, url: dataUrl });
            result = { image: img };
            break;
          } catch (err: any) {
            const code = err?.code || err?.error?.code || "";
            console.error(`Upscale-creative attempt ${attempt + 1} failed (${code}):`, err?.message || err);
            if (code === "moderation_blocked") { result = { error: "moderation_blocked" }; break; }
            if (attempt < maxRetries - 1) { await new Promise(r => setTimeout(r, 2000)); }
          }
        }

        if (!result?.image) {
          await storage.updateJobStatus(job.id, "failed");
          if (result?.error === "moderation_blocked") {
            res.status(400).json({ error: "Your prompt was blocked by the content safety filter." });
          } else {
            res.status(500).json({ error: "Creative upscale failed. Please try again." });
          }
          return;
        }
        await storage.updateJobStatus(job.id, "done");
      }

      const imgs = await storage.getImagesByJob(job.id);
      const updatedJob = await storage.getJob(job.id);
      res.json({ job: updatedJob, images: imgs.map(stripImageUrl) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  // ── Edit (inpainting) ──

  app.post("/api/images/:imageId/edit", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const imageId = parseInt(req.params.imageId as string, 10);
      const { prompt, mask } = req.body;
      if (!prompt || !mask) { res.status(400).json({ error: "Prompt and mask are required" }); return; }

      const srcImage = await storage.getImage(imageId);
      if (!srcImage) { res.status(404).json({ error: "Image not found" }); return; }

      const srcJob = await storage.getJob(srcImage.jobId);
      if (!srcJob || srcJob.userId !== userId) { res.status(404).json({ error: "Original job not found" }); return; }

      const imgMatch = srcImage.url.match(/^data:([^;]+);base64,(.+)$/);
      if (!imgMatch) { res.status(500).json({ error: "Invalid source image data" }); return; }
      const imgBuffer = Buffer.from(imgMatch[2], "base64");

      const maskMatch = mask.match(/^data:([^;]+);base64,(.+)$/);
      if (!maskMatch) { res.status(400).json({ error: "Invalid mask data" }); return; }
      const maskBuffer = Buffer.from(maskMatch[2], "base64");

      const newSeed = (srcJob.seed + 73 + Math.floor(Math.random() * 999)) % 1000000000;

      const job = await storage.createJob({
        userId,
        prompt: `Edit: ${prompt}`,
        negativePrompt: srcJob.negativePrompt,
        aspectRatio: srcJob.aspectRatio,
        stylize: srcJob.stylize,
        seed: newSeed,
      });

      await storage.updateJobStatus(job.id, "processing");

      try {
        const imageFile = await toFile(imgBuffer, "image.png", { type: "image/png" });
        const maskFile = await toFile(maskBuffer, "mask.png", { type: "image/png" });

        const response = await openai.images.edit({
          model: "gpt-image-1",
          image: imageFile,
          mask: maskFile,
          prompt,
          n: 1,
          size: aspectToSize(srcJob.aspectRatio) as any,
        });

        const b64 = response.data?.[0]?.b64_json ?? "";
        if (!b64) {
          await storage.updateJobStatus(job.id, "failed");
          res.status(500).json({ error: "Edit generation returned no image" });
          return;
        }

        const dataUrl = `data:image/png;base64,${b64}`;
        await storage.createImage({ jobId: job.id, index: 1, url: dataUrl });
        await storage.updateJobStatus(job.id, "done");

        const imgs = await storage.getImagesByJob(job.id);
        const updatedJob = await storage.getJob(job.id);
        res.json({ job: updatedJob, images: imgs.map(stripImageUrl) });
      } catch (genErr: any) {
        console.error("Edit generation failed:", genErr);
        await storage.updateJobStatus(job.id, "failed");
        res.status(500).json({ error: genErr.message || "Edit generation failed" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  // ── Style Analysis ──

  app.post("/api/images/:imageId/analyze-style", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const imageId = parseInt(req.params.imageId as string, 10);

      const image = await storage.getImage(imageId);
      if (!image) { res.status(404).json({ error: "Image not found" }); return; }

      const job = await storage.getJob(image.jobId);
      if (!job || job.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }

      const analysis = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze the artistic style of this image. Provide a concise style description (2-3 sentences) focusing on: color palette, mood, composition, technique, medium, and aesthetic. Format it as a style prompt that could be appended to an image generation prompt to replicate this style." },
              { type: "image_url", image_url: { url: image.url } },
            ],
          },
        ],
        max_tokens: 200,
      });

      const styleDescription = analysis.choices?.[0]?.message?.content || "";
      res.json({ style: styleDescription });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  // ── Proxy fetch for external image URLs (avoids CORS) ──

  app.post("/api/fetch-image", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "URL is required" });
        return;
      }
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        res.status(400).json({ error: "Only HTTP/HTTPS URLs are supported" });
        return;
      }
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) {
        res.status(400).json({ error: `Failed to fetch image: ${resp.status}` });
        return;
      }
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        res.status(400).json({ error: "URL does not point to an image" });
        return;
      }
      const arrayBuf = await resp.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      if (buf.length > 15 * 1024 * 1024) {
        res.status(400).json({ error: "Image is too large (max 15 MB)" });
        return;
      }
      const b64 = buf.toString("base64");
      const dataUrl = `data:${contentType.split(";")[0]};base64,${b64}`;
      res.json({ dataUrl });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to fetch image";
      res.status(400).json({ error: msg });
    }
  });

  // ── Direct Edit (from URL or uploaded image data) ──

  const editDirectSchema = z.object({
    prompt: z.string().min(1).max(2000),
    mask: z.string().min(1),
    image: z.string().min(1),
    aspectRatio: z.enum(["1:1", "3:4", "4:3"]).optional().default("1:1"),
  });

  app.post("/api/edit-direct", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

      const parsed = editDirectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
        return;
      }
      const { prompt, mask, image, aspectRatio } = parsed.data;

      const imgMatch = image.match(/^data:([^;]+);base64,(.+)$/);
      if (!imgMatch) { res.status(400).json({ error: "Invalid image data format" }); return; }
      const imgBuffer = Buffer.from(imgMatch[2], "base64");

      const maskMatch = mask.match(/^data:([^;]+);base64,(.+)$/);
      if (!maskMatch) { res.status(400).json({ error: "Invalid mask data format" }); return; }
      const maskBuffer = Buffer.from(maskMatch[2], "base64");

      const seed = Math.floor(Date.now() % 1000000000);
      const finalAspect = aspectRatio || "1:1";

      const job = await storage.createJob({
        userId,
        prompt: `Edit: ${prompt}`,
        negativePrompt: "",
        aspectRatio: finalAspect,
        stylize: 50,
        seed,
      });

      await storage.updateJobStatus(job.id, "processing");

      try {
        const imageFile = await toFile(imgBuffer, "image.png", { type: "image/png" });
        const maskFile = await toFile(maskBuffer, "mask.png", { type: "image/png" });

        const response = await openai.images.edit({
          model: "gpt-image-1",
          image: imageFile,
          mask: maskFile,
          prompt,
          n: 1,
          size: aspectToSize(finalAspect) as any,
        });

        const b64 = response.data?.[0]?.b64_json ?? "";
        if (!b64) {
          await storage.updateJobStatus(job.id, "failed");
          res.status(500).json({ error: "Edit generation returned no image" });
          return;
        }

        const dataUrl = `data:image/png;base64,${b64}`;
        await storage.createImage({ jobId: job.id, index: 1, url: dataUrl });
        await storage.updateJobStatus(job.id, "done");

        const imgs = await storage.getImagesByJob(job.id);
        const updatedJob = await storage.getJob(job.id);
        res.json({ job: updatedJob, images: imgs.map(stripImageUrl) });
      } catch (genErr: any) {
        console.error("Direct edit generation failed:", genErr);
        await storage.updateJobStatus(job.id, "failed");
        res.status(500).json({ error: genErr.message || "Edit generation failed" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  // ── Explore (public gallery) ──

  app.get("/api/explore", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const sort = (req.query.sort as string) || "new";
      const search = (req.query.search as string) || "";
      const limit = Math.min(parseInt(req.query.limit as string) || 30, 60);
      const offset = parseInt(req.query.offset as string) || 0;

      const items = await storage.getPublicImages(sort, search, limit, offset);
      const imageIds = items.map(i => i.image.id);
      const likedIds = await storage.getUserLikedImageIds(userId, imageIds);

      const result = items.map(item => ({
        ...item,
        image: stripImageUrl(item.image),
        liked: likedIds.includes(item.image.id),
      }));

      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/images/:imageId/data", async (req: Request, res: Response) => {
    try {
      const imageId = parseInt(req.params.imageId as string, 10);
      const img = await storage.getImage(imageId);
      if (!img) { res.status(404).json({ error: "Image not found" }); return; }

      const match = img.url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) { res.status(500).json({ error: "Invalid image data" }); return; }

      const mimeType = match[1];
      const buffer = Buffer.from(match[2], "base64");
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.send(buffer);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/images/:imageId/share", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const imageId = parseInt(req.params.imageId as string, 10);
      const srcImage = await storage.getImage(imageId);
      if (!srcImage) { res.status(404).json({ error: "Image not found" }); return; }

      const srcJob = await storage.getJob(srcImage.jobId);
      if (!srcJob || srcJob.userId !== userId) { res.status(403).json({ error: "Not authorized" }); return; }

      const updated = await storage.setImagePublic(imageId, !srcImage.isPublic);
      res.json(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/images/:imageId/like", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const imageId = parseInt(req.params.imageId as string, 10);
      const liked = await storage.hasUserLiked(imageId, userId);
      if (liked) {
        await storage.unlikeImage(imageId, userId);
        res.json({ liked: false, likeCount: await storage.getImageLikes(imageId) });
      } else {
        await storage.likeImage(imageId, userId);
        res.json({ liked: true, likeCount: await storage.getImageLikes(imageId) });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  // ── Organize (collections) ──

  app.get("/api/my-images", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const search = (req.query.search as string) || "";
      const limit = Math.min(parseInt(req.query.limit as string) || 40, 80);
      const offset = parseInt(req.query.offset as string) || 0;

      const items = await storage.getUserImages(userId, search, limit, offset);
      res.json(items.map(item => ({ ...item, image: stripImageUrl(item.image) })));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/my-liked-images", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const limit = Math.min(parseInt(req.query.limit as string) || 40, 80);
      const offset = parseInt(req.query.offset as string) || 0;

      const items = await storage.getUserLikedImages(userId, limit, offset);
      res.json(items.map(item => ({ ...item, image: stripImageUrl(item.image) })));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/collections", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const cols = await storage.getCollectionsByUser(userId);
      res.json(cols);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/collections", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { name, description } = req.body;
      if (!name) { res.status(400).json({ error: "Name required" }); return; }
      const col = await storage.createCollection({ userId, name, description: description || "" });
      res.json(col);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.delete("/api/collections/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id as string, 10);
      const col = await storage.getCollection(id);
      if (!col || col.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }
      await storage.deleteCollection(id);
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/collections/:id/items", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id as string, 10);
      const col = await storage.getCollection(id);
      if (!col || col.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }
      const items = await storage.getCollectionItems(id);
      res.json(items.map(item => ({ ...item, image: stripImageUrl(item.image) })));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/collections/:id/items", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id as string, 10);
      const { imageId } = req.body;
      const col = await storage.getCollection(id);
      if (!col || col.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }
      const item = await storage.addToCollection(id, imageId);
      res.json(item);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.delete("/api/collections/:collectionId/items/:imageId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const collectionId = parseInt(req.params.collectionId as string, 10);
      const imageId = parseInt(req.params.imageId as string, 10);
      const col = await storage.getCollection(collectionId);
      if (!col || col.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }
      await storage.removeFromCollection(collectionId, imageId);
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  // ── Presets ──

  app.get("/api/presets", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      res.json(await storage.getPresetsByUser(userId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/presets", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { name, promptTemplate, negativePrompt, aspectRatio, stylize, weirdness, variety } = req.body;
      if (!name) { res.status(400).json({ error: "Name required" }); return; }
      const preset = await storage.createPreset({
        userId, name,
        promptTemplate: promptTemplate || "",
        negativePrompt: negativePrompt || "",
        aspectRatio: aspectRatio || "1:1",
        stylize: stylize ?? 65,
        weirdness: weirdness ?? 0,
        variety: variety ?? 0,
      });
      res.json(preset);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.put("/api/presets/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id as string, 10);
      const preset = await storage.getPreset(id);
      if (!preset || preset.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }
      const updated = await storage.updatePreset(id, req.body);
      res.json(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.delete("/api/presets/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id as string, 10);
      const preset = await storage.getPreset(id);
      if (!preset || preset.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }
      await storage.deletePreset(id);
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  // ── Moodboards ──

  app.get("/api/moodboards", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const mbs = await storage.getMoodboardsByUser(userId);
      const withRefs = await Promise.all(mbs.map(async (mb) => {
        const refs = await storage.getMoodboardRefs(mb.id);
        return { ...mb, refs };
      }));
      res.json(withRefs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/moodboards", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { name, description } = req.body;
      if (!name) { res.status(400).json({ error: "Name required" }); return; }
      const mb = await storage.createMoodboard({ userId, name, description: description || "" });
      res.json({ ...mb, refs: [] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.delete("/api/moodboards/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id as string, 10);
      const mb = await storage.getMoodboard(id);
      if (!mb || mb.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }
      await storage.deleteMoodboard(id);
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/moodboards/:id/refs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id as string, 10);
      const mb = await storage.getMoodboard(id);
      if (!mb || mb.userId !== userId) { res.status(404).json({ error: "Not found" }); return; }
      const { url } = req.body;
      if (!url) { res.status(400).json({ error: "URL required" }); return; }
      const ref = await storage.addMoodboardRef(id, url);
      res.json(ref);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  app.delete("/api/moodboard-refs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      await storage.removeMoodboardRef(id);
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      res.status(500).json({ error: msg });
    }
  });

  return httpServer;
}
