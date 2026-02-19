import React, { useState, useEffect } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Wand2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type Aspect = "1:1" | "16:9" | "9:16" | "4:3";

type Preset = {
  id: number;
  userId: number;
  name: string;
  promptTemplate: string;
  negativePrompt: string;
  aspectRatio: string;
  stylize: number;
  createdAt: string;
};

const ASPECTS: Aspect[] = ["1:1", "16:9", "9:16", "4:3"];

function aspectLabel(a: string) {
  if (a === "1:1") return "Square";
  if (a === "16:9") return "Wide";
  if (a === "9:16") return "Portrait";
  if (a === "4:3") return "Classic";
  return a;
}

const emptyForm = {
  name: "",
  promptTemplate: "",
  negativePrompt: "",
  aspectRatio: "1:1" as Aspect,
  stylize: 50,
};

export default function Personalize() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const fetchPresets = async () => {
    try {
      const res = await fetch("/api/presets", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load presets");
      const data: Preset[] = await res.json();
      setPresets(data);
    } catch {
      toast({ title: "Error", description: "Could not load presets.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPresets();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (preset: Preset) => {
    setEditingId(preset.id);
    setForm({
      name: preset.name,
      promptTemplate: preset.promptTemplate || "",
      negativePrompt: preset.negativePrompt || "",
      aspectRatio: (preset.aspectRatio || "1:1") as Aspect,
      stylize: preset.stylize ?? 50,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Name required", description: "Please enter a preset name.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/presets/${editingId}` : "/api/presets";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name,
          promptTemplate: form.promptTemplate,
          negativePrompt: form.negativePrompt,
          aspectRatio: form.aspectRatio,
          stylize: form.stylize,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      toast({ title: editingId ? "Preset updated" : "Preset created", description: `"${form.name}" saved successfully.` });
      setDialogOpen(false);
      await fetchPresets();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (preset: Preset) => {
    setDeleting(preset.id);
    try {
      const res = await fetch(`/api/presets/${preset.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast({ title: "Deleted", description: `"${preset.name}" removed.` });
      setPresets((prev) => prev.filter((p) => p.id !== preset.id));
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const handleApply = (preset: Preset) => {
    navigate(`/?presetId=${preset.id}`);
  };

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 pf-grid opacity-[0.35]" />
        <div className="pointer-events-none absolute -top-24 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.28),transparent_60%)] blur-3xl" />
        <div className="pointer-events-none absolute -top-10 right-[-160px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--accent)/0.25),transparent_60%)] blur-3xl" />

        <header className="relative mx-auto max-w-7xl px-5 pt-8">
          <div className="flex items-center justify-between gap-3">
            <a href="/" className="flex items-center gap-3" data-testid="link-home">
              <div className="pf-card pf-noise grid h-10 w-10 place-items-center rounded-2xl">
                <Wand2 className="h-5 w-5 text-primary" strokeWidth={2.2} />
              </div>
              <div>
                <div className="pf-display text-[15px] font-semibold tracking-[-0.02em]" data-testid="text-appname">
                  PromptForge
                </div>
                <div className="text-xs text-muted-foreground" data-testid="text-tagline">
                  Style Presets
                </div>
              </div>
            </a>
          </div>
        </header>

        <main className="relative mx-auto max-w-7xl px-5 pt-10 pb-20">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1
                className="pf-display text-3xl font-bold tracking-[-0.03em] md:text-4xl"
                data-testid="text-page-title"
              >
                Personalize
              </h1>
              <p className="mt-2 text-sm text-muted-foreground" data-testid="text-page-subtitle">
                Create and manage style presets for quick generation
              </p>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  className="rounded-2xl"
                  onClick={openCreate}
                  data-testid="button-create-preset"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Preset
                </Button>
              </DialogTrigger>
              <DialogContent className="pf-card rounded-3xl border-border/70 sm:max-w-lg" data-testid="dialog-preset">
                <DialogHeader>
                  <DialogTitle className="pf-display text-lg" data-testid="text-dialog-title">
                    {editingId ? "Edit Preset" : "Create Preset"}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 pt-2">
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="preset-name" data-testid="label-name">
                      Name
                    </Label>
                    <Input
                      id="preset-name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      className="mt-2 h-11 rounded-2xl bg-background/40"
                      placeholder="e.g. Cinematic Dark"
                      data-testid="input-name"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="preset-template" data-testid="label-template">
                      Prompt Template
                    </Label>
                    <Textarea
                      id="preset-template"
                      value={form.promptTemplate}
                      onChange={(e) => setForm((f) => ({ ...f, promptTemplate: e.target.value }))}
                      rows={3}
                      className="mt-2 resize-none rounded-2xl bg-background/40"
                      placeholder="Use {prompt} as placeholder, e.g. cinematic photo of {prompt}, moody lighting"
                      data-testid="input-template"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" htmlFor="preset-negative" data-testid="label-negative">
                      Negative Prompt
                    </Label>
                    <Input
                      id="preset-negative"
                      value={form.negativePrompt}
                      onChange={(e) => setForm((f) => ({ ...f, negativePrompt: e.target.value }))}
                      className="mt-2 h-11 rounded-2xl bg-background/40"
                      placeholder="What to avoid"
                      data-testid="input-negative"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" data-testid="label-aspect">
                      Aspect Ratio
                    </Label>
                    <div className="mt-2 flex gap-2" data-testid="selector-aspect">
                      {ASPECTS.map((a) => (
                        <Button
                          key={a}
                          variant={form.aspectRatio === a ? "default" : "secondary"}
                          className="rounded-2xl"
                          onClick={() => setForm((f) => ({ ...f, aspectRatio: a }))}
                          data-testid={`button-aspect-${a.replace(":", "x")}`}
                        >
                          {a}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground" data-testid="label-stylize">
                      Stylize
                    </Label>
                    <div className="mt-3 flex items-center gap-3">
                      <Slider
                        value={[form.stylize]}
                        onValueChange={(v) => setForm((f) => ({ ...f, stylize: v[0] ?? 50 }))}
                        min={0}
                        max={100}
                        step={1}
                        className="flex-1"
                        data-testid="slider-stylize"
                      />
                      <div
                        className="pf-card w-12 rounded-2xl px-3 py-2 text-center text-xs"
                        data-testid="text-stylize-value"
                      >
                        {form.stylize}
                      </div>
                    </div>
                  </div>
                  <Button
                    className="mt-2 rounded-2xl"
                    onClick={handleSave}
                    disabled={saving}
                    data-testid="button-save-preset"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {editingId ? "Update Preset" : "Create Preset"}
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20" data-testid="status-loading">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : presets.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center" data-testid="status-empty">
              <div className="pf-card grid h-12 w-12 place-items-center rounded-2xl">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium" data-testid="text-empty-title">No presets yet</p>
              <p className="text-xs text-muted-foreground" data-testid="text-empty-subtitle">
                Create your first style preset to speed up generation
              </p>
            </div>
          ) : (
            <div
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="grid-presets"
            >
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="pf-card pf-noise overflow-hidden rounded-2xl p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
                  data-testid={`card-preset-${preset.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3
                        className="pf-display truncate text-base font-semibold"
                        data-testid={`text-preset-name-${preset.id}`}
                      >
                        {preset.name}
                      </h3>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-xl p-0"
                        onClick={() => openEdit(preset)}
                        data-testid={`button-edit-${preset.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 rounded-xl p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(preset)}
                        disabled={deleting === preset.id}
                        data-testid={`button-delete-${preset.id}`}
                      >
                        {deleting === preset.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {preset.promptTemplate && (
                    <p
                      className="mt-2 line-clamp-2 text-xs text-muted-foreground"
                      data-testid={`text-preset-template-${preset.id}`}
                    >
                      {preset.promptTemplate}
                    </p>
                  )}

                  {preset.negativePrompt && (
                    <p
                      className="mt-1 line-clamp-1 text-xs text-muted-foreground/70"
                      data-testid={`text-preset-negative-${preset.id}`}
                    >
                      Avoid: {preset.negativePrompt}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className="pf-card rounded-full px-2.5 py-1 text-[10px] font-medium"
                      data-testid={`badge-aspect-${preset.id}`}
                    >
                      {preset.aspectRatio} {aspectLabel(preset.aspectRatio)}
                    </span>
                    <span
                      className="pf-card rounded-full px-2.5 py-1 text-[10px] font-medium"
                      data-testid={`badge-stylize-${preset.id}`}
                    >
                      Stylize {preset.stylize}
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/30">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all"
                      style={{ width: `${preset.stylize}%` }}
                      data-testid={`bar-stylize-${preset.id}`}
                    />
                  </div>

                  <Button
                    className="mt-4 w-full rounded-2xl"
                    variant="secondary"
                    onClick={() => handleApply(preset)}
                    data-testid={`button-apply-${preset.id}`}
                  >
                    Apply to Create
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </main>

        <footer className="relative border-t border-border/50 py-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 text-xs text-muted-foreground">
            <div data-testid="text-footer-brand">PromptForge</div>
            <div data-testid="text-footer-credit">Built on Replit</div>
          </div>
        </footer>
      </div>
    </div>
  );
}
