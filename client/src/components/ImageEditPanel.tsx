import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Download,
  Heart,
  Undo2,
  Redo2,
  RotateCw,
  Crop,
  Eraser,
  Plus,
  Loader2,
  Sparkles,
  Wand2,
  ExternalLink,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type ImageEditPanelProps = {
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
    seed?: number;
    status?: string;
  };
  onClose: () => void;
  onSubmitEdit: (imageId: number, mask: string, editPrompt: string) => void;
  onVary?: (imageId: number, strength: "subtle" | "strong") => void;
  onOpenInEditTab?: (imageId: number) => void;
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

export default function ImageEditPanel({
  image,
  job,
  onClose,
  onSubmitEdit,
  onVary,
  onOpenInEditTab,
  busy,
}: ImageEditPanelProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [tool, setTool] = useState<"erase" | "restore">("erase");
  const [imgLoaded, setImgLoaded] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [scale, setScale] = useState([100]);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const naturalSize = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      naturalSize.current = { w: img.naturalWidth, h: img.naturalHeight };
      setImgLoaded(true);
    };
    img.src = image.url;
  }, [image.url]);

  useEffect(() => {
    if (!imgLoaded || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const maxW = container.clientWidth;
    const maxH = container.clientHeight;
    const imgRatio = naturalSize.current.w / naturalSize.current.h;
    let displayW = Math.min(maxW, naturalSize.current.w);
    let displayH = displayW / imgRatio;
    if (displayH > maxH) {
      displayH = maxH;
      displayW = displayH * imgRatio;
    }
    canvas.width = displayW;
    canvas.height = displayH;
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, displayW, displayH);
    }
  }, [imgLoaded]);

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => [...prev.slice(-20), snap]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || history.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const currentSnap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const prev = [...history];
    const last = prev.pop();
    if (last) {
      ctx.putImageData(last, 0, 0);
      setHistory(prev);
      setRedoStack(s => [...s, currentSnap]);
    }
  }, [history]);

  const redo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || redoStack.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const currentSnap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const stack = [...redoStack];
    const next = stack.pop();
    if (next) {
      ctx.putImageData(next, 0, 0);
      setRedoStack(stack);
      setHistory(prev => [...prev, currentSnap]);
    }
  }, [redoStack]);

  const getPos = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const drawStroke = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    if (tool === "erase") {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(255, 50, 50, 0.5)";
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,1)";
    }
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }, [tool, brushSize]);

  const onPointerDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    saveSnapshot();
    setDrawing(true);
    setHasInteracted(true);
    const { x, y } = getPos(e);
    drawStroke(x, y);
  }, [saveSnapshot, getPos, drawStroke]);

  const onPointerMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const { x, y } = getPos(e);
    drawStroke(x, y);
  }, [drawing, getPos, drawStroke]);

  const onPointerUp = useCallback(() => {
    setDrawing(false);
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    saveSnapshot();
    setDrawing(true);
    setHasInteracted(true);
    const { x, y } = getPos(e);
    drawStroke(x, y);
  }, [saveSnapshot, getPos, drawStroke]);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!drawing) return;
    const { x, y } = getPos(e);
    drawStroke(x, y);
  }, [drawing, getPos, drawStroke]);

  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setDrawing(false);
  }, []);

  const exportMask = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = naturalSize.current.w;
    maskCanvas.height = naturalSize.current.h;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return null;

    maskCtx.fillStyle = "black";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    const scaleX = naturalSize.current.w / canvas.width;
    const scaleY = naturalSize.current.h / canvas.height;
    const displayData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

    for (let dy = 0; dy < canvas.height; dy++) {
      for (let dx = 0; dx < canvas.width; dx++) {
        const si = (dy * canvas.width + dx) * 4;
        const alpha = displayData.data[si + 3];
        if (alpha > 10) {
          const tx = Math.floor(dx * scaleX);
          const ty = Math.floor(dy * scaleY);
          const bw = Math.max(1, Math.ceil(scaleX));
          const bh = Math.max(1, Math.ceil(scaleY));
          for (let by = 0; by < bh; by++) {
            for (let bx = 0; bx < bw; bx++) {
              const fx = Math.min(tx + bx, maskCanvas.width - 1);
              const fy = Math.min(ty + by, maskCanvas.height - 1);
              const di = (fy * maskCanvas.width + fx) * 4;
              maskData.data[di + 3] = 0;
            }
          }
        }
      }
    }

    maskCtx.putImageData(maskData, 0, 0);
    return maskCanvas.toDataURL("image/png");
  }, []);

  const handleSubmit = useCallback(() => {
    const maskData = exportMask();
    if (!maskData) return;
    onSubmitEdit(image.id, maskData, job.prompt);
  }, [exportMask, onSubmitEdit, image.id, job.prompt]);

  const handleDownload = useCallback(async () => {
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
  }, [image.url, image.id]);

  const scalePct = scale[0] / 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      data-testid="edit-panel-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-muted/40 p-2 text-white/80 transition hover:bg-muted/60"
        data-testid="button-edit-panel-close"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="relative flex h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden rounded-3xl md:flex-row">
        <div
          ref={containerRef}
          className="flex flex-1 items-center justify-center bg-black/40 p-4 md:w-[60%] md:flex-none overflow-hidden"
        >
          {imgLoaded ? (
            <div
              className="relative inline-block"
              style={{ transform: `scale(${scalePct})`, transformOrigin: "center center" }}
            >
              <img
                src={image.url}
                alt={job.prompt}
                className="block max-h-[80vh] max-w-full rounded-2xl object-contain"
                style={{ width: canvasRef.current?.width || "auto" }}
                data-testid="edit-panel-source-image"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 cursor-crosshair rounded-2xl"
                style={{ touchAction: "none" }}
                onMouseDown={onPointerDown}
                onMouseMove={onPointerMove}
                onMouseUp={onPointerUp}
                onMouseLeave={onPointerUp}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                data-testid="edit-panel-mask-canvas"
              />
            </div>
          ) : (
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="pf-card pf-noise flex flex-col gap-5 overflow-y-auto p-6 md:w-[40%]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="pf-display text-sm font-semibold">Edit</span>
              <span className="text-xs text-muted-foreground">{timeAgo(image.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleDownload}
                className="rounded-full p-2 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                data-testid="button-edit-panel-download"
                disabled={busy}
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                className="rounded-full p-2 text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
                data-testid="button-edit-panel-like"
              >
                <Heart className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={undo}
              disabled={history.length === 0 || busy}
              className="rounded-lg bg-muted/30 p-2.5 text-muted-foreground transition hover:bg-muted/50 disabled:opacity-40"
              data-testid="button-edit-panel-undo"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0 || busy}
              className="rounded-lg bg-muted/30 p-2.5 text-muted-foreground transition hover:bg-muted/50 disabled:opacity-40"
              data-testid="button-edit-panel-redo"
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              className="rounded-lg bg-muted/30 p-2.5 text-muted-foreground transition hover:bg-muted/50 disabled:opacity-40"
              disabled
              data-testid="button-edit-panel-rotate"
            >
              <RotateCw className="h-4 w-4" />
            </button>
            <button
              className="rounded-lg bg-muted/30 p-2.5 text-muted-foreground transition hover:bg-muted/50 disabled:opacity-40"
              disabled
              data-testid="button-edit-panel-crop"
            >
              <Crop className="h-4 w-4" />
            </button>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Aspect Ratio</span>
              <span className="text-xs text-muted-foreground">{job.aspectRatio || "1:1"}</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {["1:1", "3:4", "2:3", "9:16", "1:2", "4:3", "3:2", "16:9", "2:1"].map((ratio) => (
                <button
                  key={ratio}
                  className={cn(
                    "rounded-lg px-2 py-1.5 text-xs transition",
                    ratio === (job.aspectRatio || "1:1")
                      ? "bg-foreground text-background font-medium"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                  )}
                  data-testid={`button-edit-panel-ratio-${ratio}`}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Scale</span>
            </div>
            <Slider
              value={scale}
              onValueChange={(v) => { setScale(v); setHasInteracted(true); }}
              min={0}
              max={100}
              step={1}
              className="w-full"
              data-testid="slider-edit-panel-scale"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/20 p-1">
              <button
                onClick={() => { setTool("erase"); setHasInteracted(true); }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm transition",
                  tool === "erase"
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:bg-muted/40"
                )}
                data-testid="button-edit-panel-erase"
              >
                <Eraser className="h-4 w-4" />
                Erase
              </button>
              <button
                onClick={() => { setTool("restore"); setHasInteracted(true); }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm transition",
                  tool === "restore"
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:bg-muted/40"
                )}
                data-testid="button-edit-panel-restore"
              >
                <Plus className="h-4 w-4" />
                Restore
              </button>
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/40 transition disabled:opacity-40"
                disabled
                data-testid="button-edit-panel-smart"
              >
                <Sparkles className="h-4 w-4" />
                Smart Select
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Brush Size</span>
              <span className="text-xs text-muted-foreground">{brushSize}px</span>
            </div>
            <Slider
              value={[brushSize]}
              onValueChange={([v]) => { setBrushSize(v); setHasInteracted(true); }}
              min={5}
              max={150}
              step={1}
              className="w-full"
              data-testid="slider-edit-panel-brush"
            />
          </div>

          <Button
            className="w-full rounded-xl"
            onClick={handleSubmit}
            disabled={busy || !hasInteracted}
            data-testid="button-edit-panel-apply"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Editing...
              </>
            ) : (
              <>
                <Pencil className="mr-2 h-4 w-4" />
                Apply Edit
              </>
            )}
          </Button>

          <div className="border-t border-border/40 pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="pf-display text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Editor Actions
              </h3>
              <button
                onClick={onClose}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
                data-testid="button-edit-panel-actions-close"
              >
                <X className="h-3 w-3" />
                Close
              </button>
            </div>

            <div className="grid gap-3">
              <div className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-xs text-muted-foreground">Edit</span>
                <button
                  onClick={() => onOpenInEditTab?.(image.id)}
                  disabled={busy || !onOpenInEditTab}
                  className="flex items-center gap-1.5 rounded-full bg-muted/40 px-4 py-2 text-sm transition hover:bg-muted/60 disabled:opacity-50"
                  data-testid="button-edit-panel-open-tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in Edit Tab
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-xs text-muted-foreground">Vary</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => onVary?.(image.id, "subtle")}
                    disabled={busy || !onVary}
                    className="flex items-center gap-1.5 rounded-full bg-muted/40 px-4 py-2 text-sm transition hover:bg-muted/60 disabled:opacity-50"
                    data-testid="button-edit-panel-vary-subtle"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Subtle
                  </button>
                  <button
                    onClick={() => onVary?.(image.id, "strong")}
                    disabled={busy || !onVary}
                    className="flex items-center gap-1.5 rounded-full bg-muted/40 px-4 py-2 text-sm transition hover:bg-muted/60 disabled:opacity-50"
                    data-testid="button-edit-panel-vary-strong"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                    Strong
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
