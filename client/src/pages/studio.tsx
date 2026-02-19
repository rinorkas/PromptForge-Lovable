import { useEffect, useMemo, useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  Sparkles,
  Stars,
  Wand2,
  Palette,
  X,
  Clock,
  ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import ImageDetailPanel from "@/components/ImageDetailPanel";
import ImageEditPanel from "@/components/ImageEditPanel";

type Aspect = "1:1" | "3:4" | "4:3";

function getJobLabel(prompt: string): string | null {
  if (prompt.includes("(subtle upscale 2×)")) return "Upscale (Subtle)";
  if (prompt.includes("(creative upscale 2×)")) return "Upscale (Creative)";
  if (prompt.includes("(upscaled, ultra-detailed")) return "Upscale (Creative)";
  if (prompt.includes("(variation)")) return "Variation";
  if (prompt.startsWith("Edit: ")) return "Edit";
  return null;
}

function stripJobLabel(prompt: string): string {
  return prompt
    .replace(/\s*\(subtle upscale 2×\)\s*/g, "")
    .replace(/\s*\(creative upscale 2×\)\s*/g, "")
    .replace(/\s*\(upscaled, ultra-detailed[^)]*\)\s*/g, "")
    .replace(/\s*\(variation\)\s*/g, "")
    .replace(/^Edit:\s*/, "")
    .trim();
}

type GenImage = { id: number; url: string; index: number };
type Gen = {
  id: number;
  prompt: string;
  negative: string;
  aspect: string;
  stylize: number;
  weirdness: number;
  variety: number;
  seed: number;
  status: string;
  images: GenImage[];
  createdAt: string;
};

function aspectLabel(a: Aspect) {
  if (a === "1:1") return "Square";
  if (a === "3:4") return "Portrait";
  return "Landscape";
}

function seedFromNow() {
  return Math.floor(Date.now() % 1000000000);
}

type Enhancement = {
  type: "preset" | "moodboard";
  id: number;
  name: string;
};

function getDateCategory(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= weekAgo) return "Last 7 Days";
  if (date >= monthAgo) return "Last 30 Days";
  return "Earlier";
}

function groupGensByDate(gens: Gen[]): { label: string; items: Gen[] }[] {
  const order = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "Earlier"];
  const groups: Record<string, Gen[]> = {};
  for (const g of gens) {
    if (g.images.length === 0) continue;
    const cat = getDateCategory(g.createdAt);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(g);
  }
  return order.filter(l => groups[l]).map(l => ({ label: l, items: groups[l] }));
}

export default function Studio() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [prompt, setPrompt] = useState<string>("");
  const [negative, setNegative] = useState<string>("");
  const [aspect, setAspect] = useState<Aspect>("1:1");
  const [stylize, setStylize] = useState<number>(65);
  const [weirdness, setWeirdness] = useState<number>(0);
  const [variety, setVariety] = useState<number>(0);
  const [seed, setSeed] = useState<number>(() => seedFromNow());
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEnhancement, setActiveEnhancement] = useState<Enhancement | null>(null);

  const [gens, setGens] = useState<Gen[]>([]);
  const [enhancementPicker, setEnhancementPicker] = useState<"preset" | "moodboard" | null>(null);
  const [enhancementOptions, setEnhancementOptions] = useState<any[]>([]);
  const [loadingEnhancements, setLoadingEnhancements] = useState(false);
  const [referenceImage, setReferenceImage] = useState<{ id: number; url: string } | null>(null);
  const [styleModifier, setStyleModifier] = useState<string>("");
  const [editOpen, setEditOpen] = useState(false);
  const [editImage, setEditImage] = useState<{ image: { id: number; url: string; createdAt: string }; job: { id: number; prompt: string; negativePrompt?: string; aspectRatio?: string; stylize?: number; weirdness?: number; variety?: number; seed?: number; status?: string } } | null>(null);
  const [detailImage, setDetailImage] = useState<{ image: { id: number; url: string; createdAt: string }; job: { id: number; prompt: string; negativePrompt?: string; aspectRatio?: string; stylize?: number; weirdness?: number; variety?: number; seed?: number; status?: string } } | null>(null);

  const findImageDetail = useCallback((imageId: number) => {
    for (const g of gens) {
      const img = g.images.find(i => i.id === imageId);
      if (img) {
        return {
          image: { id: img.id, url: img.url, createdAt: g.createdAt },
          job: { id: g.id, prompt: g.prompt, negativePrompt: g.negative || undefined, aspectRatio: g.aspect, stylize: g.stylize, weirdness: g.weirdness, variety: g.variety, seed: g.seed, status: g.status },
        };
      }
    }
    return null;
  }, [gens]);

  useEffect(() => {
    fetch("/api/jobs?limit=100", { credentials: "include" })
      .then((r) => r.ok ? r.json() : [])
      .then((data: { job: any; images: any[] }[]) => {
        const loaded = data.map((d) => parseResponse(d));
        setGens(loaded);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const presetId = params.get("presetId");
    const moodboardId = params.get("moodboardId");
    const promptParam = params.get("prompt");
    const refImageId = params.get("refImageId");
    const refImageUrl = params.get("refImageUrl");
    const styleParam = params.get("style");

    if (promptParam) {
      setPrompt(promptParam);
    }
    if (refImageId && refImageUrl) {
      setReferenceImage({ id: parseInt(refImageId), url: refImageUrl });
    }
    if (styleParam) {
      setStyleModifier(styleParam);
    }

    if (presetId) {
      fetch(`/api/presets`, { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((presets: any[]) => {
          const p = presets.find((p: any) => p.id === parseInt(presetId));
          if (p) {
            setActiveEnhancement({ type: "preset", id: p.id, name: p.name });
            if (p.promptTemplate && !p.promptTemplate.includes("{prompt}")) {
              setPrompt(p.promptTemplate);
            }
            if (p.negativePrompt) setNegative(p.negativePrompt);
            if (p.aspectRatio) setAspect(p.aspectRatio as Aspect);
            if (p.stylize !== null) setStylize(p.stylize);
            if (p.weirdness !== null && p.weirdness !== undefined) setWeirdness(p.weirdness);
            if (p.variety !== null && p.variety !== undefined) setVariety(p.variety);
          }
        });
    } else if (moodboardId) {
      fetch(`/api/moodboards`, { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((mbs: any[]) => {
          const mb = mbs.find((m: any) => m.id === parseInt(moodboardId));
          if (mb) {
            setActiveEnhancement({ type: "moodboard", id: mb.id, name: mb.name });
          }
        });
    }
    if (params.toString()) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const openEnhancementPicker = (type: "preset" | "moodboard") => {
    if (enhancementPicker === type) {
      setEnhancementPicker(null);
      return;
    }
    setEnhancementPicker(type);
    setLoadingEnhancements(true);
    const endpoint = type === "preset" ? "/api/presets" : "/api/moodboards";
    fetch(endpoint, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => setEnhancementOptions(data))
      .catch(() => setEnhancementOptions([]))
      .finally(() => setLoadingEnhancements(false));
  };

  const selectEnhancement = (item: any, type: "preset" | "moodboard") => {
    setActiveEnhancement({ type, id: item.id, name: item.name });
    setEnhancementPicker(null);
    if (type === "preset") {
      if (item.promptTemplate && !item.promptTemplate.includes("{prompt}")) {
        setPrompt(item.promptTemplate);
      }
      if (item.negativePrompt) setNegative(item.negativePrompt);
      if (item.aspectRatio) setAspect(item.aspectRatio as Aspect);
      if (item.stylize !== null && item.stylize !== undefined) setStylize(item.stylize);
      if (item.weirdness !== null && item.weirdness !== undefined) setWeirdness(item.weirdness);
      if (item.variety !== null && item.variety !== undefined) setVariety(item.variety);
    }
    toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1)} applied`, description: `"${item.name}" will be used for your next generation.` });
  };

  const dateGrouped = useMemo(() => groupGensByDate(gens), [gens]);

  const apiCall = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Request failed" }));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return res.json();
  };

  const parseResponse = (data: { job: any; images: any[] }): Gen => ({
    id: data.job.id,
    prompt: data.job.prompt,
    negative: data.job.negativePrompt || "",
    aspect: data.job.aspectRatio,
    stylize: data.job.stylize,
    weirdness: data.job.weirdness ?? 0,
    variety: data.job.variety ?? 0,
    seed: data.job.seed,
    status: data.job.status,
    createdAt: data.job.createdAt || new Date().toISOString(),
    images: data.images.map((im: any) => ({
      id: im.id,
      url: im.url,
      index: im.index,
    })),
  });

  const runGenerate = async () => {
    if (!prompt.trim()) {
      toast({ title: "Enter a prompt", description: "Describe what you want to generate.", variant: "destructive" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        prompt,
        negativePrompt: negative,
        aspectRatio: aspect,
        stylize,
        weirdness,
        variety,
        seed,
      };
      if (activeEnhancement?.type === "preset") body.presetId = activeEnhancement.id;
      if (activeEnhancement?.type === "moodboard") body.moodboardId = activeEnhancement.id;
      if (referenceImage) body.referenceImageId = referenceImage.id;
      if (styleModifier) body.styleModifier = styleModifier;

      const data = await apiCall("/api/jobs", body);
      const g = parseResponse(data);
      setGens((prev) => [g, ...prev]);
      setSeed(seedFromNow());

    } catch (err: any) {
      setError(err.message);
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 pf-grid opacity-[0.35]" />
        <div className="pointer-events-none absolute -top-24 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.28),transparent_60%)] blur-3xl" />
        <div className="pointer-events-none absolute -top-10 right-[-160px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--accent)/0.25),transparent_60%)] blur-3xl" />

        <header className="relative mx-auto max-w-7xl px-5 pt-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="pf-display text-[22px] font-semibold leading-tight md:text-[26px]" data-testid="text-hero">
                Create
              </div>
              <div className="text-sm text-muted-foreground" data-testid="text-subhero">
                Real AI image generation powered by GPT Image
              </div>
            </div>

            <div className="flex items-center gap-2">
              {busy && (
                <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary" data-testid="status-generating">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating...
                </div>
              )}
            </div>
          </div>

          {(activeEnhancement || referenceImage || styleModifier) && (
            <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="active-enhancement">
              {activeEnhancement && (
                <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary">
                  {activeEnhancement.type === "preset" && <Sparkles className="h-3.5 w-3.5" />}
                  {activeEnhancement.type === "moodboard" && <Palette className="h-3.5 w-3.5" />}
                  <span className="capitalize">{activeEnhancement.type}:</span>
                  <span className="font-medium">{activeEnhancement.name}</span>
                  <button
                    onClick={() => setActiveEnhancement(null)}
                    className="ml-1 rounded-full p-0.5 hover:bg-primary/20"
                    data-testid="button-remove-enhancement"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {referenceImage && (
                <div className="flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400" data-testid="active-reference-image">
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span>Reference Image</span>
                  <img src={referenceImage.url} alt="ref" className="h-5 w-5 rounded object-cover" />
                  <button
                    onClick={() => setReferenceImage(null)}
                    className="ml-1 rounded-full p-0.5 hover:bg-blue-500/20"
                    data-testid="button-remove-reference"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {styleModifier && (
                <div className="flex items-center gap-2 rounded-full bg-purple-500/10 px-3 py-1.5 text-xs text-purple-400" data-testid="active-style-modifier">
                  <Palette className="h-3.5 w-3.5" />
                  <span className="max-w-48 truncate">Style: {styleModifier.length > 50 ? styleModifier.slice(0, 50) + "..." : styleModifier}</span>
                  <button
                    onClick={() => setStyleModifier("")}
                    className="ml-1 rounded-full p-0.5 hover:bg-purple-500/20"
                    data-testid="button-remove-style"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="pf-card pf-noise overflow-hidden rounded-3xl p-5 md:p-6">
              <div className="flex flex-col gap-4">
                <div className="grid gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="prompt" data-testid="label-prompt">
                      Prompt
                    </Label>
                    <Textarea
                      id="prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={4}
                      className="mt-2 resize-none rounded-2xl bg-background/40"
                      placeholder="Describe what you want to see..."
                      data-testid="input-prompt"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        variant={enhancementPicker === "preset" ? "default" : "outline"}
                        size="sm"
                        className="rounded-full text-xs"
                        onClick={() => openEnhancementPicker("preset")}
                        data-testid="button-pick-preset"
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        Preset
                      </Button>
                      <Button
                        variant={enhancementPicker === "moodboard" ? "default" : "outline"}
                        size="sm"
                        className="rounded-full text-xs"
                        onClick={() => openEnhancementPicker("moodboard")}
                        data-testid="button-pick-moodboard"
                      >
                        <Palette className="mr-1.5 h-3.5 w-3.5" />
                        Moodboard
                      </Button>
                    </div>
                    {enhancementPicker && (
                      <div className="mt-2 rounded-2xl border border-border/50 bg-background/60 p-3" data-testid="enhancement-picker">
                        {loadingEnhancements ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : enhancementOptions.length === 0 ? (
                          <div className="py-3 text-center text-sm text-muted-foreground">
                            No {enhancementPicker}s yet. Create one from the {enhancementPicker === "preset" ? "Personalize" : "Moodboards"} page.
                          </div>
                        ) : (
                          <div className="grid gap-1.5 max-h-[200px] overflow-y-auto">
                            {enhancementOptions.map((item: any) => (
                              <button
                                key={item.id}
                                onClick={() => selectEnhancement(item, enhancementPicker)}
                                className={cn(
                                  "flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                                  activeEnhancement?.id === item.id && activeEnhancement?.type === enhancementPicker && "bg-primary/10 text-primary"
                                )}
                                data-testid={`enhancement-option-${item.id}`}
                              >
                                {item.sampleImageUrl && (
                                  <img src={item.sampleImageUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium truncate">{item.name}</div>
                                  {item.description && (
                                    <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
                    <div>
                      <Label className="text-xs text-muted-foreground" htmlFor="negative" data-testid="label-negative">
                        Negative prompt
                      </Label>
                      <Input
                        id="negative"
                        value={negative}
                        onChange={(e) => setNegative(e.target.value)}
                        className="mt-2 h-11 rounded-2xl bg-background/40"
                        placeholder="What to avoid"
                        data-testid="input-negative"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        className="h-11 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90"
                        onClick={runGenerate}
                        disabled={busy}
                        data-testid="button-generate"
                      >
                        {busy ? (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center"
                          >
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generating
                          </motion.div>
                        ) : (
                          <>
                            Generate
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 rounded-3xl border border-border/70 bg-background/30 p-4 md:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium" data-testid="text-controls">
                      Controls
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground" data-testid="label-aspect">
                        Aspect ratio
                      </Label>
                      <ToggleGroup
                        type="single"
                        value={aspect}
                        onValueChange={(v) => {
                          if (!v) return;
                          setAspect(v as Aspect);
                        }}
                        className="mt-2 justify-start"
                        data-testid="toggle-aspect"
                      >
                        {(["3:4", "1:1", "4:3"] as Aspect[]).map((a) => (
                          <ToggleGroupItem
                            key={a}
                            value={a}
                            className="rounded-2xl"
                            data-testid={`toggle-aspect-${a.replace(":", "x")}`}
                          >
                            {aspectLabel(a)}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground" data-testid="label-stylize">
                        Stylize
                      </Label>
                      <div className="mt-3 flex items-center gap-3">
                        <Slider
                          value={[stylize]}
                          onValueChange={(v) => setStylize(v[0] ?? 65)}
                          min={0}
                          max={100}
                          step={1}
                          className="flex-1"
                          data-testid="slider-stylize"
                        />
                        <div
                          className="pf-card w-12 rounded-2xl px-3 py-2 text-center text-xs"
                          data-testid="text-stylize"
                        >
                          {stylize}
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground" data-testid="label-weirdness">
                        Weirdness
                      </Label>
                      <div className="mt-3 flex items-center gap-3">
                        <Slider
                          value={[weirdness]}
                          onValueChange={(v) => setWeirdness(v[0] ?? 0)}
                          min={0}
                          max={100}
                          step={1}
                          className="flex-1"
                          data-testid="slider-weirdness"
                        />
                        <div
                          className="pf-card w-12 rounded-2xl px-3 py-2 text-center text-xs"
                          data-testid="text-weirdness"
                        >
                          {weirdness}
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs text-muted-foreground" data-testid="label-variety">
                        Variety
                      </Label>
                      <div className="mt-3 flex items-center gap-3">
                        <Slider
                          value={[variety]}
                          onValueChange={(v) => setVariety(v[0] ?? 0)}
                          min={0}
                          max={100}
                          step={1}
                          className="flex-1"
                          data-testid="slider-variety"
                        />
                        <div
                          className="pf-card w-12 rounded-2xl px-3 py-2 text-center text-xs"
                          data-testid="text-variety"
                        >
                          {variety}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            </Card>

          </div>
        </header>
      </div>

      {dateGrouped.length > 0 && (
        <div className="mx-auto max-w-7xl px-5 pb-12 pt-8" data-testid="history-section">
          <div className="mb-6 flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h2 className="pf-display text-lg font-semibold" data-testid="text-history-title">History</h2>
          </div>
          {dateGrouped.map(({ label, items }) => (
            <div key={label} className="mb-8" data-testid={`history-group-${label.toLowerCase().replace(/\s+/g, "-")}`}>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground" data-testid={`text-group-${label.toLowerCase().replace(/\s+/g, "-")}`}>
                {label}
              </h3>
              <div className="space-y-4">
                {items.map((g) => (
                  <div key={g.id} className="flex items-start gap-4">
                    <div className="flex shrink-0 gap-2">
                      {g.images.map((img) => (
                        <button
                          key={img.id}
                          onClick={() => {
                            const detail = findImageDetail(img.id);
                            if (detail) setDetailImage(detail);
                          }}
                          className="group relative overflow-hidden rounded-xl border-2 border-border/30 transition-all hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10"
                          style={{ width: "280px" }}
                          data-testid={`history-thumb-${img.id}`}
                        >
                          <img
                            src={img.url}
                            alt={g.prompt}
                            className={cn(
                              "w-full object-cover transition-transform group-hover:scale-105",
                              g.aspect === "3:4" ? "aspect-[3/4]" : g.aspect === "4:3" ? "aspect-[4/3]" : "aspect-square"
                            )}
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                    <div className="min-w-0 pt-1">
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3" data-testid={`text-gen-prompt-${g.id}`}>
                        {(() => {
                          const label = getJobLabel(g.prompt);
                          return label ? (
                            <><span className="font-semibold text-orange-400">{label}</span>{" "}{stripJobLabel(g.prompt)}</>
                          ) : g.prompt;
                        })()}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground/60">
                        {g.aspect === "3:4" ? "Portrait" : g.aspect === "4:3" ? "Landscape" : "Square"} &middot; Seed {g.seed}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {editOpen && editImage && (
        <ImageEditPanel
          image={editImage.image}
          job={editImage.job}
          onClose={() => { setEditOpen(false); setEditImage(null); }}
          busy={busy}
          onSubmitEdit={async (imageId, mask, editPrompt) => {
            setBusy(true);
            setError(null);
            try {
              const data = await apiCall(`/api/images/${imageId}/edit`, {
                prompt: editPrompt,
                mask,
              });
              const g = parseResponse(data);
              setGens((prev) => [g, ...prev]);
              setEditOpen(false);
              setEditImage(null);
            } catch (err: any) {
              setError(err.message);
              toast({ title: "Edit failed", description: err.message, variant: "destructive" });
            } finally {
              setBusy(false);
            }
          }}
          onVary={async (imageId, strength) => {
            setBusy(true);
            try {
              const data = await apiCall(`/api/images/${imageId}/vary`, { strength });
              const g = parseResponse(data);
              setGens(prev => [g, ...prev]);
              setEditOpen(false);
              setEditImage(null);
              toast({ title: "Variation created" });
            } catch (err: any) {
              toast({ title: "Variation failed", description: err.message, variant: "destructive" });
            } finally {
              setBusy(false);
            }
          }}
          onOpenInEditTab={(imageId) => {
            setEditOpen(false);
            setEditImage(null);
            setLocation(`/edit?imageId=${imageId}`);
          }}
        />
      )}

      {detailImage && !editOpen && (
        <ImageDetailPanel
          image={detailImage.image}
          job={detailImage.job}
          onClose={() => setDetailImage(null)}
          busy={busy}
          onVary={async (imageId, strength) => {
            setBusy(true);
            try {
              const data = await apiCall(`/api/images/${imageId}/vary`, { strength });
              const g = parseResponse(data);
              setGens(prev => [g, ...prev]);
              setDetailImage(null);
              toast({ title: "Variation created" });
            } catch (err: any) {
              toast({ title: "Variation failed", description: err.message, variant: "destructive" });
            } finally {
              setBusy(false);
            }
          }}
          onUpscale={async (imageId, mode) => {
            setBusy(true);
            try {
              const data = await apiCall(`/api/images/${imageId}/upscale`, { mode });
              const g = parseResponse(data);
              setGens(prev => [g, ...prev]);
              setDetailImage(null);
              toast({ title: `Upscale (${mode}) complete` });
            } catch (err: any) {
              toast({ title: "Upscale failed", description: err.message, variant: "destructive" });
            } finally {
              setBusy(false);
            }
          }}
          onRerun={async (jobId) => {
            setBusy(true);
            try {
              const data = await apiCall(`/api/jobs/${jobId}/reroll`, {});
              const g = parseResponse(data);
              setGens(prev => [g, ...prev]);
              setDetailImage(null);
              toast({ title: "Rerun complete" });
            } catch (err: any) {
              toast({ title: "Rerun failed", description: err.message, variant: "destructive" });
            } finally {
              setBusy(false);
            }
          }}
          onEdit={(imageId) => {
            const detail = findImageDetail(imageId);
            if (detail) setEditImage(detail);
            setEditOpen(true);
          }}
          onUsePrompt={(promptText) => {
            setPrompt(promptText);
            setDetailImage(null);
            window.scrollTo({ top: 0, behavior: "smooth" });
            toast({ title: "Prompt loaded" });
          }}
          onUseImage={(imageId, imageUrl) => {
            setReferenceImage({ id: imageId, url: imageUrl });
            setDetailImage(null);
            window.scrollTo({ top: 0, behavior: "smooth" });
            toast({ title: "Reference image loaded", description: "This image will be used as a reference for your next generation." });
          }}
          onUseStyle={async (imageId) => {
            setBusy(true);
            try {
              const res = await fetch(`/api/images/${imageId}/analyze-style`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
              });
              if (!res.ok) throw new Error("Style analysis failed");
              const data = await res.json();
              setStyleModifier(data.style);
              setDetailImage(null);
              window.scrollTo({ top: 0, behavior: "smooth" });
              toast({ title: "Style extracted", description: "The style from this image will be applied to your next generation." });
            } catch (err: any) {
              toast({ title: "Style analysis failed", description: err.message, variant: "destructive" });
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
