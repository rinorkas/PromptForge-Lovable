import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Link as LinkIcon,
  Upload,
  Pencil,
  Eraser,
  Undo2,
  Redo2,
  RotateCcw,
  Sparkles,
  Move,
  Paintbrush,
  Wand2,
  Download,
  ChevronUp,
  Plus,
  MinusCircle,
  PlusCircle,
  RotateCw,
  Grid2x2,
  Layers,
  Eye,
  EyeOff,
  Check,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type ToolMode = "paint" | "move" | "select";
type PaintMode = "erase" | "restore";
type EditorTab = "edit" | "retexture";

type VersionEntry = {
  id: string;
  dataUrl: string;
  thumbUrl: string;
  label: string;
};

type LayerEntry = {
  id: string;
  name: string;
  dataUrl: string;
  thumbUrl: string;
  visible: boolean;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function createThumb(dataUrl: string, size = 200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ratio = img.naturalHeight / img.naturalWidth;
      canvas.width = size;
      canvas.height = size * ratio;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = dataUrl;
  });
}

export default function EditPage() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const enterEditorRef = useRef<(dataUrl: string) => Promise<void>>(async () => {});

  const [editorTab, setEditorTab] = useState<EditorTab>("edit");
  const [toolMode, setToolMode] = useState<ToolMode>("paint");
  const [paintMode, setPaintMode] = useState<PaintMode>("erase");
  const [brushSize, setBrushSize] = useState(78);
  const [editPrompt, setEditPrompt] = useState("");
  const [imageScale, setImageScale] = useState(100);
  const [moveAspect, setMoveAspect] = useState<string>("1:1");
  const [selectMode, setSelectMode] = useState<"include" | "exclude">("include");
  const [hasSmartSelection, setHasSmartSelection] = useState(false);

  const [layers, setLayers] = useState<LayerEntry[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [showAddLayerMenu, setShowAddLayerMenu] = useState(false);
  const [layerUrlInput, setLayerUrlInput] = useState("");
  const [layerUrlLoading, setLayerUrlLoading] = useState(false);
  const layerFileInputRef = useRef<HTMLInputElement>(null);
  const layerCounter = useRef(0);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const selectionMaskRef = useRef<Uint8Array | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const naturalSize = useRef({ w: 0, h: 0 });
  const [undoStack, setUndoStack] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);

  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const versionCounter = useRef(0);

  useEffect(() => {
    if (!imageDataUrl) return;
    setImgLoaded(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      naturalSize.current = { w: img.naturalWidth, h: img.naturalHeight };
      setImgLoaded(true);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  useEffect(() => {
    if (!imgLoaded || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const maxW = container.clientWidth;
    const maxH = container.clientHeight || 600;
    const ratio = naturalSize.current.h / naturalSize.current.w;
    let displayW = Math.min(maxW, 900);
    let displayH = displayW * ratio;
    if (displayH > maxH) {
      displayH = maxH;
      displayW = displayH / ratio;
    }
    canvas.width = displayW;
    canvas.height = displayH;
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, displayW, displayH);
    const selCanvas = selectionCanvasRef.current;
    if (selCanvas) {
      selCanvas.width = displayW;
      selCanvas.height = displayH;
      selCanvas.style.width = `${displayW}px`;
      selCanvas.style.height = `${displayH}px`;
      const selCtx = selCanvas.getContext("2d");
      if (selCtx) selCtx.clearRect(0, 0, displayW, displayH);
    }
    selectionMaskRef.current = null;
    setHasSmartSelection(false);
  }, [imgLoaded]);

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setUndoStack(prev => [...prev.slice(-30), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || undoStack.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const prev = [...undoStack];
    const last = prev.pop()!;
    ctx.putImageData(last, 0, 0);
    setUndoStack(prev);
    setRedoStack(r => [...r, currentState]);
  }, [undoStack]);

  const redo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || redoStack.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const next = [...redoStack];
    const top = next.pop()!;
    ctx.putImageData(top, 0, 0);
    setRedoStack(next);
    setUndoStack(u => [...u, currentState]);
  }, [redoStack]);

  const resetCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    saveSnapshot();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [saveSnapshot]);

  const renderSelectionOverlay = useCallback(() => {
    const selCanvas = selectionCanvasRef.current;
    const mask = selectionMaskRef.current;
    if (!selCanvas || !mask) return;
    const ctx = selCanvas.getContext("2d");
    if (!ctx) return;
    const w = selCanvas.width;
    const h = selCanvas.height;
    ctx.clearRect(0, 0, w, h);
    const stripeCanvas = document.createElement("canvas");
    stripeCanvas.width = 8;
    stripeCanvas.height = 8;
    const sCtx = stripeCanvas.getContext("2d")!;
    sCtx.fillStyle = "rgba(80, 200, 80, 0.45)";
    sCtx.fillRect(0, 0, 8, 8);
    sCtx.strokeStyle = "rgba(40, 140, 40, 0.6)";
    sCtx.lineWidth = 2;
    sCtx.beginPath();
    sCtx.moveTo(-1, 9);
    sCtx.lineTo(9, -1);
    sCtx.moveTo(-1, 1);
    sCtx.lineTo(1, -1);
    sCtx.moveTo(7, 9);
    sCtx.lineTo(9, 7);
    sCtx.stroke();
    const pattern = ctx.createPattern(stripeCanvas, "repeat")!;
    const imgData = ctx.createImageData(w, h);
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) {
        imgData.data[i * 4 + 3] = 255;
      }
    }
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tCtx = tempCanvas.getContext("2d")!;
    tCtx.putImageData(imgData, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
  }, []);

  const floodFillSelect = useCallback((clickX: number, clickY: number) => {
    if (!imgRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const w = canvas.width;
    const h = canvas.height;
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = w;
    tmpCanvas.height = h;
    const tmpCtx = tmpCanvas.getContext("2d")!;
    tmpCtx.drawImage(imgRef.current, 0, 0, w, h);
    const imgData = tmpCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const x0 = Math.round(clickX);
    const y0 = Math.round(clickY);
    if (x0 < 0 || x0 >= w || y0 < 0 || y0 >= h) return;

    const idx = (y0 * w + x0) * 4;
    const seedR = data[idx], seedG = data[idx + 1], seedB = data[idx + 2];
    const tolerance = 32;

    const visited = new Uint8Array(w * h);
    const stack = [x0 + y0 * w];
    visited[y0 * w + x0] = 1;

    while (stack.length > 0) {
      const pos = stack.pop()!;
      const px = pos % w;
      const py = (pos - px) / w;
      const pi = pos * 4;
      const dr = Math.abs(data[pi] - seedR);
      const dg = Math.abs(data[pi + 1] - seedG);
      const db = Math.abs(data[pi + 2] - seedB);
      if (dr + dg + db > tolerance * 3) continue;
      visited[pos] = 2;
      const neighbors = [
        px > 0 ? pos - 1 : -1,
        px < w - 1 ? pos + 1 : -1,
        py > 0 ? pos - w : -1,
        py < h - 1 ? pos + w : -1,
      ];
      for (const n of neighbors) {
        if (n >= 0 && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }

    if (!selectionMaskRef.current) {
      selectionMaskRef.current = new Uint8Array(w * h);
    }
    const mask = selectionMaskRef.current;
    if (selectMode === "include") {
      for (let i = 0; i < visited.length; i++) {
        if (visited[i] === 2) mask[i] = 1;
      }
    } else {
      for (let i = 0; i < visited.length; i++) {
        if (visited[i] === 2) mask[i] = 0;
      }
    }
    setHasSmartSelection(mask.some(v => v === 1));
    renderSelectionOverlay();
  }, [selectMode, renderSelectionOverlay]);

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

  const draw = useCallback((x: number, y: number) => {
    if (toolMode !== "paint") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    if (paintMode === "erase") {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(255, 50, 50, 0.5)";
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,1)";
    }
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }, [toolMode, paintMode, brushSize]);

  const onPointerDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (toolMode === "select") {
      const { x, y } = getPos(e);
      floodFillSelect(x, y);
      return;
    }
    if (toolMode !== "paint") return;
    saveSnapshot(); setDrawing(true);
    const { x, y } = getPos(e); draw(x, y);
  }, [toolMode, saveSnapshot, getPos, draw, floodFillSelect]);
  const onPointerMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || toolMode !== "paint") return;
    const { x, y } = getPos(e); draw(x, y);
  }, [drawing, toolMode, getPos, draw]);
  const onPointerUp = useCallback(() => setDrawing(false), []);
  const onTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (toolMode !== "paint") return;
    e.preventDefault(); saveSnapshot(); setDrawing(true);
    const { x, y } = getPos(e); draw(x, y);
  }, [toolMode, saveSnapshot, getPos, draw]);
  const onTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    if (toolMode !== "paint") return;
    e.preventDefault(); if (!drawing) return;
    const { x, y } = getPos(e); draw(x, y);
  }, [toolMode, drawing, getPos, draw]);
  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); setDrawing(false);
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

  const loadFromUrl = async () => {
    if (!urlInput.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/fetch-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch image");
      }
      const data = await res.json();
      enterEditor(data.dataUrl);
    } catch (err: any) {
      toast({ title: "Failed to load image", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadFromFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select an image under 15 MB.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      enterEditor(dataUrl);
    } catch {
      toast({ title: "Failed to read file", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const enterEditor = useCallback(async (dataUrl: string) => {
    setImageDataUrl(dataUrl);
    const thumb = await createThumb(dataUrl);
    versionCounter.current = 1;
    const entry: VersionEntry = {
      id: `v-${versionCounter.current}`,
      dataUrl,
      thumbUrl: thumb,
      label: "Original",
    };
    setVersions([entry]);
    setActiveVersionId(entry.id);
    setUndoStack([]);
    setRedoStack([]);
    setEditPrompt("");
    layerCounter.current = 1;
    const layer: LayerEntry = {
      id: `layer-1`,
      name: "Layer 1",
      dataUrl,
      thumbUrl: thumb,
      visible: true,
    };
    setLayers([layer]);
    setActiveLayerId(layer.id);
  }, []);

  enterEditorRef.current = enterEditor;

  const addLayerFromDataUrl = useCallback(async (dataUrl: string) => {
    if (!imageDataUrl) {
      enterEditorRef.current(dataUrl);
      return;
    }
    layerCounter.current += 1;
    const thumb = await createThumb(dataUrl);
    const layer: LayerEntry = {
      id: `layer-${layerCounter.current}`,
      name: `Layer ${layerCounter.current}`,
      dataUrl,
      thumbUrl: thumb,
      visible: true,
    };
    setLayers(prev => [layer, ...prev]);
    setActiveLayerId(layer.id);
  }, [imageDataUrl]);

  const addLayerFromUrl = useCallback(async () => {
    if (!layerUrlInput.trim()) return;
    setLayerUrlLoading(true);
    try {
      const res = await fetch("/api/fetch-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: layerUrlInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch image");
      }
      const data = await res.json();
      await addLayerFromDataUrl(data.dataUrl);
      setLayerUrlInput("");
      setShowAddLayerMenu(false);
    } catch (err: any) {
      toast({ title: "Failed to load image", description: err.message, variant: "destructive" });
    } finally {
      setLayerUrlLoading(false);
    }
  }, [layerUrlInput, addLayerFromDataUrl, toast]);

  const addLayerFromFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select an image under 15 MB.", variant: "destructive" });
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      await addLayerFromDataUrl(dataUrl);
      setShowAddLayerMenu(false);
    } catch {
      toast({ title: "Failed to read file", variant: "destructive" });
    }
    e.target.value = "";
  }, [addLayerFromDataUrl, toast]);

  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l));
  }, []);

  const removeLayer = useCallback((layerId: string) => {
    setLayers(prev => {
      const next = prev.filter(l => l.id !== layerId);
      if (activeLayerId === layerId && next.length > 0) {
        setActiveLayerId(next[0].id);
      }
      return next;
    });
  }, [activeLayerId]);

  useEffect(() => {
    if (!showAddLayerMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddLayerMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAddLayerMenu]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (mod && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const imageId = params.get("imageId");
    if (!imageId) return;
    setLoading(true);
    fetch(`/api/images/${imageId}/data`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load image");
        const blob = await res.blob();
        return fileToDataUrl(new File([blob], "image.png", { type: blob.type }));
      })
      .then((dataUrl) => enterEditorRef.current(dataUrl))
      .catch((err) => {
        toast({ title: "Failed to load image", description: err.message, variant: "destructive" });
      })
      .finally(() => {
        setLoading(false);
        window.history.replaceState({}, "", "/edit");
      });
  }, []);

  const handleSubmitEdit = async () => {
    if (!imageDataUrl || !editPrompt.trim()) return;
    const maskData = exportMask();
    if (!maskData) return;
    setBusy(true);
    try {
      const res = await fetch("/api/edit-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: editPrompt, mask: maskData, image: imageDataUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Edit failed");
      }
      const data = await res.json();
      const imgUrl = data.images?.[0]?.url;
      if (imgUrl) {
        const resp = await fetch(imgUrl, { credentials: "include" });
        const blob = await resp.blob();
        const newDataUrl = await fileToDataUrl(new File([blob], "result.png", { type: "image/png" }));
        const thumb = await createThumb(newDataUrl);
        versionCounter.current += 1;
        const entry: VersionEntry = {
          id: `v-${versionCounter.current}`,
          dataUrl: newDataUrl,
          thumbUrl: thumb,
          label: `Edit ${versions.length}`,
        };
        setVersions(prev => [...prev, entry]);
        setActiveVersionId(entry.id);
        setImageDataUrl(newDataUrl);
        setUndoStack([]);
        setRedoStack([]);
      }
      toast({ title: "Edit complete" });
    } catch (err: any) {
      toast({ title: "Edit failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const selectVersion = async (v: VersionEntry) => {
    setImageDataUrl(v.dataUrl);
    setActiveVersionId(v.id);
    setUndoStack([]);
    setRedoStack([]);
    const thumb = await createThumb(v.dataUrl);
    layerCounter.current = 1;
    const layer: LayerEntry = {
      id: `layer-1`,
      name: "Layer 1",
      dataUrl: v.dataUrl,
      thumbUrl: thumb,
      visible: true,
    };
    setLayers([layer]);
    setActiveLayerId(layer.id);
  };

  const startNew = () => {
    setImageDataUrl(null);
    setImgLoaded(false);
    setVersions([]);
    setActiveVersionId(null);
    setUrlInput("");
    setEditPrompt("");
    setUndoStack([]);
    setRedoStack([]);
    setLayers([]);
    setActiveLayerId(null);
    layerCounter.current = 0;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const downloadCurrent = () => {
    if (!imageDataUrl) return;
    const a = document.createElement("a");
    a.href = imageDataUrl;
    a.download = "edited-image.png";
    a.click();
  };

  return (
    <div className="flex h-screen overflow-hidden" data-testid="editor-workspace">
      {/* ─── Left Panel ─── */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border/40 bg-background/60 backdrop-blur-md" data-testid="editor-left-panel">
        {/* Edit / Retexture tabs */}
        <div className="p-3">
          <div className="flex rounded-xl bg-muted/40 p-1">
            <button
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                editorTab === "edit" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setEditorTab("edit")}
              data-testid="tab-edit"
            >
              Edit
            </button>
            <button
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                editorTab === "retexture" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setEditorTab("retexture")}
              data-testid="tab-retexture"
            >
              Retexture
            </button>
          </div>
        </div>

        {/* Undo / Redo / Reset / AI */}
        <div className="flex items-center justify-center gap-1 px-3 pb-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={undo} disabled={!imageDataUrl || undoStack.length === 0} data-testid="button-undo">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={redo} disabled={!imageDataUrl || redoStack.length === 0} data-testid="button-redo">
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={resetCanvas} disabled={!imageDataUrl || undoStack.length === 0} data-testid="button-reset">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" disabled={!imageDataUrl} data-testid="button-ai-assist">
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>

        <Separator className="opacity-40" />

        {/* Tool modes: Move / Paint / Select */}
        <div className="p-3">
          <div className="grid grid-cols-3 gap-1">
            {([
              { mode: "move" as ToolMode, icon: Move, label: "Move / Resize" },
              { mode: "paint" as ToolMode, icon: Paintbrush, label: "Paint" },
              { mode: "select" as ToolMode, icon: Wand2, label: "Smart Select" },
            ]).map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs transition-all",
                  toolMode === mode ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                onClick={() => setToolMode(mode)}
                data-testid={`tool-${mode}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Move / Resize controls (only when Move active) */}
        {toolMode === "move" && (
          <div className="px-3 pb-3">
            <div className="rounded-xl border border-border/30 bg-muted/20 p-3">
              <div className="mb-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Image Scale</span>
                  <span className="text-xs text-muted-foreground" data-testid="text-image-scale">{imageScale}%</span>
                </div>
                <Slider
                  value={[imageScale]}
                  onValueChange={([v]) => setImageScale(v)}
                  min={0}
                  max={100}
                  step={1}
                  disabled={!imageDataUrl}
                  className={cn("w-full", !imageDataUrl && "opacity-40 pointer-events-none")}
                  data-testid="slider-image-scale"
                />
              </div>
              <div>
                <span className="mb-2 block text-xs font-medium text-foreground">Aspect Ratio</span>
                <div className="grid grid-cols-3 gap-1">
                  {(["1:1", "3:4", "2:3", "9:16", "1:2", "4:3", "3:2", "16:9", "2:1"]).map((value) => (
                    <button
                      key={value}
                      disabled={!imageDataUrl}
                      className={cn(
                        "rounded-lg px-2 py-1.5 text-xs font-medium transition-all",
                        !imageDataUrl ? "opacity-40 cursor-not-allowed text-muted-foreground" :
                        moveAspect === value ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                      onClick={() => imageDataUrl && setMoveAspect(value)}
                      data-testid={`aspect-${value}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Erase / Restore toggle (only when Paint active) */}
        {toolMode === "paint" && (
          <>
            <div className="px-3 pb-2">
              <div className="flex rounded-xl bg-muted/40 p-1">
                <button
                  disabled={!imageDataUrl}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    !imageDataUrl ? "opacity-40 cursor-not-allowed" :
                    paintMode === "erase" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setPaintMode("erase")}
                  data-testid="paint-erase"
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Erase
                </button>
                <button
                  disabled={!imageDataUrl}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    !imageDataUrl ? "opacity-40 cursor-not-allowed" :
                    paintMode === "restore" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setPaintMode("restore")}
                  data-testid="paint-restore"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Restore
                </button>
              </div>
            </div>

            {/* Brush Size */}
            <div className="px-3 pb-3">
              <div className="rounded-xl border border-border/30 bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Brush Size</span>
                  <span className="text-xs text-muted-foreground" data-testid="text-brush-size">{brushSize}px</span>
                </div>
                <Slider
                  value={[brushSize]}
                  onValueChange={([v]) => setBrushSize(v)}
                  min={5}
                  max={200}
                  step={1}
                  disabled={!imageDataUrl}
                  className={cn("w-full", !imageDataUrl && "opacity-40 pointer-events-none")}
                  data-testid="slider-brush-size"
                />
              </div>
            </div>
          </>
        )}

        {/* Smart Select controls (only when Select active) */}
        {toolMode === "select" && (
          <div className="px-3 pb-3">
            <div className="rounded-xl border border-border/30 bg-muted/20 p-3">
              <div className="mb-3 flex rounded-xl bg-muted/40 p-1">
                <button
                  disabled={!imageDataUrl}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    !imageDataUrl ? "opacity-40 cursor-not-allowed" :
                    selectMode === "include" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setSelectMode("include")}
                  data-testid="select-include"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Include
                </button>
                <button
                  disabled={!imageDataUrl || !hasSmartSelection}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    (!imageDataUrl || !hasSmartSelection) ? "opacity-40 cursor-not-allowed" :
                    selectMode === "exclude" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => setSelectMode("exclude")}
                  data-testid="select-exclude"
                >
                  <MinusCircle className="h-3.5 w-3.5" />
                  Exclude
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  disabled={!imageDataUrl || !hasSmartSelection}
                  className={cn(
                    "flex items-center justify-between rounded-lg border border-border/30 px-3 py-2 text-xs font-medium transition-all",
                    (!imageDataUrl || !hasSmartSelection) ? "opacity-40 cursor-not-allowed text-muted-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                  data-testid="button-erase-selection"
                  onClick={() => {
                    selectionMaskRef.current = null;
                    setHasSmartSelection(false);
                    const selCanvas = selectionCanvasRef.current;
                    if (selCanvas) {
                      const ctx = selCanvas.getContext("2d");
                      if (ctx) ctx.clearRect(0, 0, selCanvas.width, selCanvas.height);
                    }
                  }}
                >
                  Erase Selection
                </button>
                <div className="flex items-center gap-2">
                  <button
                    disabled={!imageDataUrl || !hasSmartSelection}
                    className={cn(
                      "flex flex-1 items-center justify-between rounded-lg border border-border/30 px-3 py-2 text-xs font-medium transition-all",
                      (!imageDataUrl || !hasSmartSelection) ? "opacity-40 cursor-not-allowed text-muted-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                    data-testid="button-erase-background"
                  >
                    Erase Background
                  </button>
                  <button
                    disabled={!imageDataUrl || !hasSmartSelection}
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/30 transition-all",
                      (!imageDataUrl || !hasSmartSelection) ? "opacity-40 cursor-not-allowed text-muted-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                    data-testid="button-swap-selection"
                    onClick={() => {
                      const mask = selectionMaskRef.current;
                      if (!mask) return;
                      for (let i = 0; i < mask.length; i++) {
                        mask[i] = mask[i] ? 0 : 1;
                      }
                      setHasSmartSelection(mask.some(v => v === 1));
                      renderSelectionOverlay();
                    }}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Spacer */}
        <div className="flex-1" />

        {/* Layers panel */}
        <Separator className="opacity-40" />
        <div className="p-3">
          <div className="rounded-xl border border-border/30 bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between relative">
              <span className="text-sm font-medium text-foreground">Layers</span>
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowAddLayerMenu(prev => !prev)}
                data-testid="button-add-layer"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
              <input
                ref={layerFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={addLayerFromFile}
                data-testid="input-layer-file"
              />
              {showAddLayerMenu && (
                <div ref={addMenuRef} className="absolute right-0 top-6 z-50 w-56 rounded-xl border border-border/40 bg-background/95 backdrop-blur-md shadow-xl overflow-hidden" data-testid="add-layer-menu">
                  <div className="p-2">
                    <button
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground hover:bg-muted/40 transition-colors"
                      onClick={() => { layerFileInputRef.current?.click(); setShowAddLayerMenu(false); }}
                      data-testid="button-add-layer-file"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Add from file
                    </button>
                  </div>
                  <Separator className="opacity-30" />
                  <div className="p-2">
                    <p className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">From URL</p>
                    <div className="flex gap-1.5 px-1">
                      <Input
                        value={layerUrlInput}
                        onChange={(e) => setLayerUrlInput(e.target.value)}
                        placeholder="https://..."
                        className="h-7 rounded-md bg-muted/30 text-[11px]"
                        onKeyDown={(e) => { if (e.key === "Enter") addLayerFromUrl(); }}
                        data-testid="input-layer-url"
                      />
                      <Button
                        size="sm"
                        className="h-7 w-7 shrink-0 rounded-md p-0"
                        onClick={addLayerFromUrl}
                        disabled={!layerUrlInput.trim() || layerUrlLoading}
                        data-testid="button-load-layer-url"
                      >
                        {layerUrlLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LinkIcon className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5 max-h-[200px] overflow-y-auto">
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-all group",
                    activeLayerId === layer.id
                      ? "border-primary/40 bg-muted/30"
                      : "border-transparent hover:bg-muted/20"
                  )}
                  onClick={() => setActiveLayerId(layer.id)}
                  data-testid={`layer-item-${layer.id}`}
                >
                  <div className="relative h-10 w-10 shrink-0 rounded-md overflow-hidden bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOCIgaGVpZ2h0PSI4IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNjY2MiLz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjY2NjIi8+PC9zdmc+')]">
                    <img
                      src={layer.thumbUrl}
                      alt={layer.name}
                      className={cn("h-10 w-10 object-cover", !layer.visible && "opacity-40")}
                    />
                  </div>
                  <span className={cn("flex-1 text-xs", layer.visible ? "text-foreground" : "text-muted-foreground")}>{layer.name}</span>
                  <button
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLayerVisibility(layer.id);
                    }}
                    data-testid={`layer-visibility-${layer.id}`}
                  >
                    {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </button>
                  {layers.length > 1 && (
                    <button
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLayer(layer.id);
                      }}
                      data-testid={`layer-remove-${layer.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all",
                      activeLayerId === layer.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/40 text-muted-foreground hover:border-foreground/40"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveLayerId(layer.id);
                    }}
                    data-testid={`layer-select-${layer.id}`}
                  >
                    {activeLayerId === layer.id && <Check className="h-3 w-3" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Center Canvas ─── */}
      <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-neutral-900/50" data-testid="editor-canvas-area">
        {imgLoaded && imageDataUrl ? (
          <div ref={containerRef} className="relative flex items-center justify-center" style={{ width: "100%", height: "100%" }}>
            <div
              className="relative rounded-lg"
              style={{
                backgroundImage: "url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjgiIGhlaWdodD0iOCIgZmlsbD0iIzJhMmEyYSIvPjxyZWN0IHg9IjgiIHk9IjAiIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMxYTFhMWEiLz48cmVjdCB4PSIwIiB5PSI4IiB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjMWExYTFhIi8+PHJlY3QgeD0iOCIgeT0iOCIgd2lkdGg9IjgiIGhlaWdodD0iOCIgZmlsbD0iIzJhMmEyYSIvPjwvc3ZnPg==')",
                backgroundSize: "16px 16px",
              }}
            >
              <img
                src={imageDataUrl}
                alt="Source"
                className="block h-auto max-h-[calc(100vh-40px)] w-auto max-w-full select-none rounded-lg invisible"
                style={{ maxWidth: canvasRef.current?.width || "100%" }}
                draggable={false}
                aria-hidden="true"
              />
              {[...layers].reverse().map((layer, idx) => {
                if (!layer.visible) return null;
                return (
                  <img
                    key={layer.id}
                    src={layer.dataUrl}
                    alt={layer.name}
                    className="absolute select-none rounded-lg max-w-full max-h-full"
                    style={{
                      zIndex: idx + 1,
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                    }}
                    draggable={false}
                    data-testid={idx === 0 ? "edit-source-image" : `layer-img-${layer.id}`}
                  />
                );
              })}
              <canvas
                ref={selectionCanvasRef}
                className="absolute inset-0 rounded-lg pointer-events-none"
                style={{ zIndex: layers.length + 10 }}
                data-testid="edit-selection-canvas"
              />
              <canvas
                ref={canvasRef}
                className={cn(
                  "absolute inset-0 rounded-lg",
                  toolMode === "paint" ? "cursor-crosshair" : toolMode === "select" ? "cursor-crosshair" : toolMode === "move" ? "cursor-grab" : "cursor-default"
                )}
                style={{ touchAction: "none", zIndex: layers.length + 11 }}
                onMouseDown={onPointerDown}
                onMouseMove={onPointerMove}
                onMouseUp={onPointerUp}
                onMouseLeave={onPointerUp}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                data-testid="edit-mask-canvas"
              />
            </div>
          </div>
        ) : (
          <div ref={containerRef} className="flex flex-col items-center justify-center gap-6 p-8" style={{ width: "100%", height: "100%" }}>
            {loading ? (
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading image...</span>
              </div>
            ) : (
              <>
                <Card className="w-full max-w-md rounded-2xl border-border/30 bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-6 transition-all hover:border-primary/40" data-testid="card-edit-url">
                  <div className="flex items-center gap-4">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10">
                      <LinkIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="pf-display text-sm font-semibold" data-testid="text-edit-from-url">Edit from URL</h3>
                      <div className="mt-2 flex gap-2">
                        <Input
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          placeholder="https://example.com/image.png"
                          className="h-8 rounded-lg bg-background/40 text-xs"
                          onKeyDown={(e) => { if (e.key === "Enter") loadFromUrl(); }}
                          data-testid="input-edit-url"
                        />
                        <Button size="sm" className="h-8 shrink-0 rounded-lg px-3" onClick={loadFromUrl} disabled={!urlInput.trim() || loading} data-testid="button-load-url">
                          <LinkIcon className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
                <Card
                  className="w-full max-w-md cursor-pointer rounded-2xl border-border/30 bg-gradient-to-br from-orange-500/5 to-orange-500/10 p-6 transition-all hover:border-primary/40"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="card-edit-upload"
                >
                  <div className="flex items-center gap-4">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10">
                      <Upload className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="pf-display text-sm font-semibold" data-testid="text-edit-upload">Edit Uploaded Image</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">PNG, JPG, WebP up to 15 MB</p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={loadFromFile}
                    data-testid="input-edit-file"
                  />
                </Card>
              </>
            )}
          </div>
        )}
      </main>

      {/* ─── Right Panel ─── */}
      <aside className="flex w-[200px] shrink-0 flex-col border-l border-border/40 bg-background/60 backdrop-blur-md" data-testid="editor-right-panel">
        {/* View All / New */}
        <div className="flex items-center justify-between p-3">
          <button className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors" data-testid="button-view-all">
            <Grid2x2 className="h-3.5 w-3.5" />
            View All
          </button>
          <button className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors" onClick={startNew} data-testid="button-new-image">
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        <Separator className="opacity-40" />

        {/* Version thumbnails */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-2 gap-2">
            {versions.map((v) => (
              <button
                key={v.id}
                className={cn(
                  "overflow-hidden rounded-lg border-2 transition-all hover:border-primary/60",
                  activeVersionId === v.id ? "border-primary shadow-md shadow-primary/20" : "border-border/30"
                )}
                onClick={() => selectVersion(v)}
                data-testid={`version-thumb-${v.id}`}
              >
                <img src={v.thumbUrl} alt={v.label} className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Export Edit section */}
        <Separator className="opacity-40" />
        <div className="p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Export Edit</p>
          <div className="grid gap-1.5">
            <button
              className={cn(
                "flex items-center gap-2 rounded-xl bg-muted/30 px-3 py-2 text-xs transition-colors",
                !imageDataUrl ? "opacity-40 cursor-not-allowed text-muted-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
              disabled={!imageDataUrl || versions.length < 2}
              data-testid="button-upscale-gallery"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              Upscale to Gallery
            </button>
            <button
              className={cn(
                "flex items-center gap-2 rounded-xl bg-muted/30 px-3 py-2 text-xs transition-colors",
                !imageDataUrl ? "opacity-40 cursor-not-allowed text-muted-foreground" : "text-foreground hover:bg-muted/50"
              )}
              onClick={downloadCurrent}
              disabled={!imageDataUrl}
              data-testid="button-download"
            >
              <Download className="h-3.5 w-3.5" />
              Download Image
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
