import { useCallback, useEffect } from "react";
import {
  X,
  Download,
  Share2,
  Heart,
  Sparkles,
  Wand2,
  Pencil,
  Copy,
  ArrowUpRight,
  RotateCcw,
  Loader2,
  ImageIcon,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ImageDetailPanelProps = {
  image: {
    id: number;
    url: string;
    createdAt: string;
  };
  job: {
    id: number;
    prompt: string;
    negativePrompt?: string;
    aspectRatio?: string;
    stylize?: number;
    weirdness?: number;
    variety?: number;
    seed?: number;
    status?: string;
  };
  onClose: () => void;
  onVary?: (imageId: number, strength: "subtle" | "strong") => void;
  onUpscale?: (imageId: number, mode: "subtle" | "creative") => void;
  onRerun?: (jobId: number) => void;
  onEdit?: (imageId: number) => void;
  onUsePrompt?: (prompt: string) => void;
  onUseImage?: (imageId: number, imageUrl: string) => void;
  onUseStyle?: (imageId: number, imageUrl: string) => void;
  onDownload?: (imageUrl: string) => void;
  onShare?: (imageId: number) => void;
  busy?: boolean;
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

function getGenerationType(status?: string): string {
  if (!status) return "Generation";
  const s = status.toLowerCase();
  if (s.includes("vary") || s.includes("variation")) return "Variation";
  if (s.includes("upscale")) return "Upscale";
  if (s.includes("edit")) return "Edit";
  return "Generation";
}

export default function ImageDetailPanel({
  image,
  job,
  onClose,
  onVary,
  onUpscale,
  onRerun,
  onEdit,
  onUsePrompt,
  onUseImage,
  onUseStyle,
  onDownload,
  onShare,
  busy,
}: ImageDetailPanelProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleDownload = useCallback(async () => {
    if (onDownload) {
      onDownload(image.url);
      return;
    }
    try {
      const res = await fetch(image.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `image-${image.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(image.url, "_blank");
    }
  }, [image.url, image.id, onDownload]);

  const handleUsePrompt = useCallback(() => {
    const clean = job.prompt
      .replace(/\s*\(subtle upscale 2×\)\s*/g, "")
      .replace(/\s*\(creative upscale 2×\)\s*/g, "")
      .replace(/\s*\(upscaled, ultra-detailed[^)]*\)\s*/g, "")
      .replace(/\s*\(variation\)\s*/g, "")
      .replace(/^Edit:\s*/, "")
      .trim();
    if (onUsePrompt) {
      onUsePrompt(clean);
    } else {
      navigator.clipboard.writeText(clean).catch(() => {});
    }
  }, [job.prompt, onUsePrompt]);

  const genType = getGenerationType(job.status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      data-testid="detail-panel-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-muted/40 p-2 text-white/80 transition hover:bg-muted/60"
        data-testid="button-detail-close"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="relative flex h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden rounded-3xl md:flex-row">
        <div className="flex flex-1 items-center justify-center bg-black/40 p-4 md:w-[60%] md:flex-none">
          <img
            src={image.url}
            alt={job.prompt}
            className="max-h-full max-w-full rounded-2xl object-contain"
            data-testid="img-detail-preview"
          />
        </div>

        <div className="pf-card pf-noise flex flex-col gap-5 overflow-y-auto p-6 md:w-[40%]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="pf-display text-sm font-semibold">{genType}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(image.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleDownload}
                className="rounded-full p-2 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                data-testid="button-detail-download"
                disabled={busy}
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={() => onShare?.(image.id)}
                className="rounded-full p-2 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                data-testid="button-detail-share"
                disabled={busy}
              >
                <Share2 className="h-4 w-4" />
              </button>
              <button
                className="rounded-full p-2 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                data-testid="button-detail-like"
              >
                <Heart className="h-4 w-4" />
              </button>
            </div>
          </div>

          <p
            className="text-sm leading-relaxed text-muted-foreground"
            data-testid="text-detail-prompt"
          >
            {job.prompt}
          </p>

          {job.negativePrompt && (
            <div>
              <span className="text-xs font-medium text-muted-foreground/70">Negative:</span>
              <p className="mt-1 text-xs text-muted-foreground/60">{job.negativePrompt}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {job.aspectRatio && (
              <span className="rounded-full bg-muted/30 px-2.5 py-1">{job.aspectRatio}</span>
            )}
            {job.stylize !== undefined && job.stylize !== null && (
              <span className="rounded-full bg-muted/30 px-2.5 py-1">Stylize {job.stylize}</span>
            )}
            {job.weirdness !== undefined && job.weirdness !== null && (
              <span className="rounded-full bg-muted/30 px-2.5 py-1">Weirdness {job.weirdness}</span>
            )}
            {job.variety !== undefined && job.variety !== null && (
              <span className="rounded-full bg-muted/30 px-2.5 py-1">Variety {job.variety}</span>
            )}
            {job.seed !== undefined && job.seed !== null && (
              <span className="rounded-full bg-muted/30 px-2.5 py-1">Seed {job.seed}</span>
            )}
          </div>

          <div>
            <h3 className="pf-display mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Creation Actions
            </h3>

            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs text-muted-foreground">Vary</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => onVary?.(image.id, "subtle")}
                    disabled={busy || !onVary}
                    className={cn(
                      "rounded-full bg-muted/40 px-4 py-2 text-sm transition hover:bg-muted/60 disabled:opacity-50",
                    )}
                    data-testid="button-detail-vary-subtle"
                  >
                    {busy ? <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 inline h-3.5 w-3.5" />}
                    Subtle
                  </button>
                  <button
                    onClick={() => onVary?.(image.id, "strong")}
                    disabled={busy || !onVary}
                    className="rounded-full bg-muted/40 px-4 py-2 text-sm transition hover:bg-muted/60 disabled:opacity-50"
                    data-testid="button-detail-vary-strong"
                  >
                    {busy ? <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 inline h-3.5 w-3.5" />}
                    Strong
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs text-muted-foreground">Upscale</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => onUpscale?.(image.id, "subtle")}
                    disabled={busy || !onUpscale}
                    className="rounded-full bg-muted/40 px-4 py-2 text-sm transition hover:bg-muted/60 disabled:opacity-50"
                    data-testid="button-detail-upscale-subtle"
                  >
                    {busy ? <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="mr-1.5 inline h-3.5 w-3.5" />}
                    Subtle (2×)
                  </button>
                  <button
                    onClick={() => onUpscale?.(image.id, "creative")}
                    disabled={busy || !onUpscale}
                    className="rounded-full bg-muted/40 px-4 py-2 text-sm transition hover:bg-muted/60 disabled:opacity-50"
                    data-testid="button-detail-upscale-creative"
                  >
                    {busy ? <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 inline h-3.5 w-3.5" />}
                    Creative (2×)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs text-muted-foreground">More</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => onRerun?.(job.id)}
                    disabled={busy || !onRerun}
                    className="rounded-full bg-muted/40 px-4 py-2 text-sm transition hover:bg-muted/60 disabled:opacity-50"
                    data-testid="button-detail-rerun"
                  >
                    {busy ? <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 inline h-3.5 w-3.5" />}
                    Rerun
                  </button>
                  <button
                    onClick={() => onEdit?.(image.id)}
                    disabled={busy || !onEdit}
                    className="rounded-full bg-muted/40 px-4 py-2 text-sm transition hover:bg-muted/60 disabled:opacity-50"
                    data-testid="button-detail-edit"
                  >
                    {busy ? <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" /> : <Pencil className="mr-1.5 inline h-3.5 w-3.5" />}
                    Edit
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs text-muted-foreground">Use</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleUsePrompt}
                    disabled={busy}
                    className="rounded-full bg-muted/40 px-4 py-2 text-sm transition hover:bg-muted/60 disabled:opacity-50"
                    data-testid="button-detail-use-prompt"
                  >
                    <Copy className="mr-1.5 inline h-3.5 w-3.5" />
                    Prompt
                  </button>
                  <button
                    onClick={() => onUseImage?.(image.id, image.url)}
                    disabled={busy || !onUseImage}
                    className="rounded-full bg-muted/40 px-4 py-2 text-sm transition hover:bg-muted/60 disabled:opacity-50"
                    data-testid="button-detail-use-image"
                  >
                    <ImageIcon className="mr-1.5 inline h-3.5 w-3.5" />
                    Image
                  </button>
                  <button
                    onClick={() => onUseStyle?.(image.id, image.url)}
                    disabled={busy || !onUseStyle}
                    className="rounded-full bg-muted/40 px-4 py-2 text-sm transition hover:bg-muted/60 disabled:opacity-50"
                    data-testid="button-detail-use-style"
                  >
                    <Palette className="mr-1.5 inline h-3.5 w-3.5" />
                    Style
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
