import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Upload,
  Image as ImageIcon,
  Palette,
  ArrowRight,
  X,
  Library,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type MoodboardRef = {
  id: number;
  moodboardId: number;
  url: string;
  createdAt: string;
};

type Moodboard = {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  createdAt: string;
  refs: MoodboardRef[];
};

export default function MoodboardsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [boards, setBoards] = useState<Moodboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deletingRef, setDeletingRef] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerImages, setPickerImages] = useState<{ image: { id: number; url: string }; job: { prompt: string } }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSelected, setPickerSelected] = useState<Set<number>>(new Set());
  const [addingFromLibrary, setAddingFromLibrary] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch("/api/moodboards", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      const data: Moodboard[] = await res.json();
      setBoards(data);
    } catch {
      toast({ title: "Error", description: "Could not load moodboards.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  const selected = boards.find((b) => b.id === selectedId) ?? null;

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/moodboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: createName.trim(), description: createDesc.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to create");
      }
      const board: Moodboard = await res.json();
      setBoards((prev) => [board, ...prev]);
      setCreateName("");
      setCreateDesc("");
      setCreateOpen(false);
      toast({ title: "Created", description: `Moodboard "${board.name}" created.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/moodboards/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      setBoards((prev) => prev.filter((b) => b.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast({ title: "Deleted", description: "Moodboard removed." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const handleUpload = useCallback(
    async (file: File) => {
      if (!selected) return;
      setUploading(true);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Read failed"));
          reader.readAsDataURL(file);
        });
        const res = await fetch(`/api/moodboards/${selected.id}/refs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ url: dataUrl }),
        });
        if (!res.ok) throw new Error("Upload failed");
        const ref: MoodboardRef = await res.json();
        setBoards((prev) =>
          prev.map((b) =>
            b.id === selected.id ? { ...b, refs: [...b.refs, ref] } : b,
          ),
        );
        toast({ title: "Uploaded", description: "Reference image added." });
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally {
        setUploading(false);
      }
    },
    [selected, toast],
  );

  const handleDeleteRef = async (refId: number) => {
    setDeletingRef(refId);
    try {
      const res = await fetch(`/api/moodboard-refs/${refId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      setBoards((prev) =>
        prev.map((b) => ({
          ...b,
          refs: b.refs.filter((r) => r.id !== refId),
        })),
      );
      toast({ title: "Removed", description: "Reference image removed." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingRef(null);
    }
  };

  const openPicker = async () => {
    setPickerOpen(true);
    setPickerSelected(new Set());
    setPickerLoading(true);
    try {
      const res = await fetch("/api/my-images?limit=60", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load images");
      setPickerImages(await res.json());
    } catch {
      toast({ title: "Error", description: "Could not load your images.", variant: "destructive" });
    } finally {
      setPickerLoading(false);
    }
  };

  const togglePickerImage = (id: number) => {
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddFromLibrary = async () => {
    if (!selected || pickerSelected.size === 0) return;
    setAddingFromLibrary(true);
    try {
      const newRefs: MoodboardRef[] = [];
      for (const imageId of Array.from(pickerSelected)) {
        const url = `/api/images/${imageId}/data`;
        const res = await fetch(`/api/moodboards/${selected.id}/refs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ url }),
        });
        if (!res.ok) throw new Error("Failed to add image");
        newRefs.push(await res.json());
      }
      setBoards((prev) =>
        prev.map((b) =>
          b.id === selected.id ? { ...b, refs: [...b.refs, ...newRefs] } : b,
        ),
      );
      setPickerOpen(false);
      toast({ title: "Added", description: `${newRefs.length} image${newRefs.length !== 1 ? "s" : ""} added as references.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAddingFromLibrary(false);
    }
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
                <Palette className="h-5 w-5 text-primary" strokeWidth={2.2} />
              </div>
              <div>
                <div className="pf-display text-[15px] font-semibold tracking-[-0.02em]" data-testid="text-appname">
                  PromptForge
                </div>
                <div className="text-xs text-muted-foreground" data-testid="text-tagline">
                  Moodboards
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
                data-testid="text-moodboards-title"
              >
                Moodboards
              </h1>
              <p className="mt-2 text-sm text-muted-foreground" data-testid="text-moodboards-subtitle">
                Collect reference images to guide your creations
              </p>
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-2xl" data-testid="button-create-moodboard">
                  <Plus className="mr-2 h-4 w-4" />
                  New Moodboard
                </Button>
              </DialogTrigger>
              <DialogContent className="pf-card rounded-3xl border-border/70 sm:max-w-md" data-testid="dialog-create-moodboard">
                <DialogHeader>
                  <DialogTitle className="pf-display" data-testid="text-dialog-title">
                    Create Moodboard
                  </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 pt-2">
                  <div>
                    <label className="text-xs text-muted-foreground" htmlFor="mb-name" data-testid="label-name">
                      Name
                    </label>
                    <Input
                      id="mb-name"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="e.g. Cyberpunk Cityscapes"
                      className="mt-2 h-11 rounded-2xl bg-background/40"
                      data-testid="input-moodboard-name"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground" htmlFor="mb-desc" data-testid="label-description">
                      Description (optional)
                    </label>
                    <Textarea
                      id="mb-desc"
                      value={createDesc}
                      onChange={(e) => setCreateDesc(e.target.value)}
                      rows={3}
                      placeholder="Describe the mood or theme..."
                      className="mt-2 resize-none rounded-2xl bg-background/40"
                      data-testid="input-moodboard-description"
                    />
                  </div>
                  <Button
                    className="rounded-2xl"
                    onClick={handleCreate}
                    disabled={!createName.trim() || creating}
                    data-testid="button-submit-create"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Create
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {selected ? (
            <div data-testid={`detail-moodboard-${selected.id}`}>
              <div className="mb-6 flex items-center gap-3">
                <Button
                  variant="ghost"
                  className="rounded-2xl"
                  onClick={() => setSelectedId(null)}
                  data-testid="button-back"
                >
                  <X className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <div className="flex-1">
                  <h2 className="pf-display text-xl font-semibold" data-testid="text-detail-name">
                    {selected.name}
                  </h2>
                  {selected.description && (
                    <p className="mt-1 text-sm text-muted-foreground" data-testid="text-detail-description">
                      {selected.description}
                    </p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  className="rounded-2xl"
                  onClick={() => navigate(`/?moodboardId=${selected.id}`)}
                  data-testid={`button-use-moodboard-${selected.id}`}
                >
                  Use in Create
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-2xl"
                  onClick={() => handleDelete(selected.id)}
                  disabled={deleting === selected.id}
                  data-testid={`button-delete-moodboard-${selected.id}`}
                >
                  {deleting === selected.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className="mb-6 flex flex-wrap gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  data-testid="input-file-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="secondary"
                  className="rounded-2xl"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  data-testid="button-upload-ref"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Image
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  className="rounded-2xl"
                  onClick={openPicker}
                  data-testid="button-add-from-library"
                >
                  <Library className="mr-2 h-4 w-4" />
                  Add from My Images
                </Button>
              </div>

              <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
                <DialogContent className="pf-card rounded-3xl border-border/70 sm:max-w-2xl max-h-[80vh] flex flex-col" data-testid="dialog-image-picker">
                  <DialogHeader>
                    <DialogTitle className="pf-display" data-testid="text-picker-title">
                      Add from My Images
                    </DialogTitle>
                  </DialogHeader>
                  {pickerLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : pickerImages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No generated images yet. Create some in the Studio first.</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">Select images to add as references. Click to toggle selection.</p>
                      <div className="overflow-y-auto flex-1 -mx-2 px-2">
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                          {pickerImages.map((item) => {
                            const isSelected = pickerSelected.has(item.image.id);
                            return (
                              <button
                                key={item.image.id}
                                type="button"
                                className={cn(
                                  "relative overflow-hidden rounded-xl border-2 transition-all",
                                  isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-border"
                                )}
                                onClick={() => togglePickerImage(item.image.id)}
                                data-testid={`picker-image-${item.image.id}`}
                              >
                                <img
                                  src={item.image.url}
                                  alt={item.job.prompt}
                                  className="aspect-square w-full object-cover"
                                  loading="lazy"
                                />
                                {isSelected && (
                                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                    <div className="grid h-7 w-7 place-items-center rounded-full bg-primary">
                                      <Check className="h-4 w-4 text-primary-foreground" />
                                    </div>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border/50">
                        <p className="text-xs text-muted-foreground">
                          {pickerSelected.size} image{pickerSelected.size !== 1 ? "s" : ""} selected
                        </p>
                        <Button
                          className="rounded-2xl"
                          onClick={handleAddFromLibrary}
                          disabled={pickerSelected.size === 0 || addingFromLibrary}
                          data-testid="button-confirm-add"
                        >
                          {addingFromLibrary ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            <>
                              <Plus className="mr-2 h-4 w-4" />
                              Add {pickerSelected.size > 0 ? pickerSelected.size : ""} Reference{pickerSelected.size !== 1 ? "s" : ""}
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>

              {selected.refs.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-center" data-testid="status-no-refs">
                  <div className="pf-card grid h-12 w-12 place-items-center rounded-2xl">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No reference images yet. Upload some to get started.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" data-testid="grid-refs">
                  {selected.refs.map((ref) => (
                    <div
                      key={ref.id}
                      className="group relative"
                      data-testid={`card-ref-${ref.id}`}
                    >
                      <div className="pf-card pf-noise overflow-hidden rounded-2xl">
                        <img
                          src={ref.url}
                          alt="Reference"
                          className="block aspect-square w-full object-cover"
                          loading="lazy"
                          data-testid={`img-ref-${ref.id}`}
                        />
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute right-2 top-2 h-8 w-8 rounded-full p-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => handleDeleteRef(ref.id)}
                        disabled={deletingRef === ref.id}
                        data-testid={`button-delete-ref-${ref.id}`}
                      >
                        {deletingRef === ref.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20" data-testid="status-loading">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : boards.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center" data-testid="status-empty">
              <div className="pf-card grid h-12 w-12 place-items-center rounded-2xl">
                <Palette className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium" data-testid="text-empty-title">
                No moodboards yet
              </p>
              <p className="text-sm text-muted-foreground">
                Create your first moodboard to start collecting references.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="grid-moodboards">
              {boards.map((board) => (
                <div
                  key={board.id}
                  className="pf-card pf-noise overflow-hidden rounded-3xl transition hover:-translate-y-0.5 hover:shadow-lg"
                  data-testid={`card-moodboard-${board.id}`}
                >
                  <button
                    className="block w-full text-left"
                    onClick={() => setSelectedId(board.id)}
                    data-testid={`button-open-moodboard-${board.id}`}
                  >
                    {board.refs.length > 0 ? (
                      <div className="grid grid-cols-2 gap-0.5">
                        {board.refs.slice(0, 4).map((ref) => (
                          <img
                            key={ref.id}
                            src={ref.url}
                            alt="Ref"
                            className="aspect-square w-full object-cover"
                            loading="lazy"
                            data-testid={`img-thumb-${ref.id}`}
                          />
                        ))}
                        {board.refs.length < 4 &&
                          Array.from({ length: 4 - Math.min(board.refs.length, 4) }).map((_, i) => (
                            <div
                              key={`placeholder-${i}`}
                              className="grid aspect-square place-items-center bg-background/30"
                            >
                              <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="grid aspect-video place-items-center bg-background/20">
                        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                  </button>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="pf-display truncate text-sm font-semibold" data-testid={`text-board-name-${board.id}`}>
                          {board.name}
                        </h3>
                        {board.description && (
                          <p className="mt-1 truncate text-xs text-muted-foreground" data-testid={`text-board-desc-${board.id}`}>
                            {board.description}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground" data-testid={`text-board-count-${board.id}`}>
                          {board.refs.length} reference{board.refs.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1 rounded-2xl"
                        onClick={() => navigate(`/?moodboardId=${board.id}`)}
                        data-testid={`button-use-moodboard-${board.id}`}
                      >
                        Use
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(board.id)}
                        disabled={deleting === board.id}
                        data-testid={`button-delete-moodboard-${board.id}`}
                      >
                        {deleting === board.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
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
