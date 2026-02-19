import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  FolderPlus,
  Folder,
  Trash2,
  Share2,
  Plus,
  Loader2,
  Image as ImageIcon,
  X,
  Clock,
  LayoutGrid,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import ImageDetailPanel from "@/components/ImageDetailPanel";
import ImageEditPanel from "@/components/ImageEditPanel";
import { useLocation } from "wouter";

type ViewSize = "small" | "medium" | "large";

const sizeClasses: Record<ViewSize, string> = {
  small: "grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10",
  medium: "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8",
  large: "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
};

const sizeMaxWidths: Record<ViewSize, string> = {
  small: "160px",
  medium: "220px",
  large: "280px",
};

type MyImage = {
  image: {
    id: number;
    jobId: number;
    index: number;
    url: string;
    isPublic: boolean;
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
    createdAt?: string;
  };
};

type Collection = {
  id: number;
  name: string;
  description: string;
  createdAt?: string;
};

const LIMIT = 40;

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

function groupImagesByDate(images: MyImage[]): { label: string; items: MyImage[] }[] {
  const order = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "Earlier"];
  const groups: Record<string, MyImage[]> = {};
  for (const img of images) {
    const cat = getDateCategory(img.image.createdAt);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(img);
  }
  return order.filter(l => groups[l]).map(l => ({ label: l, items: groups[l] }));
}

type JobGroup = { jobId: number; prompt: string; aspectRatio?: string; images: MyImage[] };

function groupImagesByJob(images: MyImage[]): JobGroup[] {
  const map = new Map<number, JobGroup>();
  for (const item of images) {
    const jid = item.image.jobId;
    if (!map.has(jid)) {
      map.set(jid, { jobId: jid, prompt: item.job?.prompt || "Generated image", aspectRatio: item.job?.aspectRatio, images: [] });
    }
    map.get(jid)!.images.push(item);
  }
  return Array.from(map.values());
}

export default function Organize() {
  const { toast } = useToast();

  const [view, setView] = useState<"all" | "liked" | number>("all");
  const [search, setSearch] = useState("");
  const [viewSize, setViewSize] = useState<ViewSize>("large");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [images, setImages] = useState<MyImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionImages, setCollectionImages] = useState<MyImage[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);

  const [likedImages, setLikedImages] = useState<MyImage[]>([]);
  const [likedLoading, setLikedLoading] = useState(false);

  const [newColName, setNewColName] = useState("");
  const [newColDesc, setNewColDesc] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [addToColImageId, setAddToColImageId] = useState<number | null>(null);
  const [detailImage, setDetailImage] = useState<MyImage | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [editImage, setEditImage] = useState<MyImage | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchImages = useCallback(
    async (currentOffset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const params = new URLSearchParams({
          search: debouncedSearch,
          limit: String(LIMIT),
          offset: String(currentOffset),
        });
        const res = await fetch(`/api/my-images?${params}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load");
        const data: MyImage[] = await res.json();
        if (append) {
          setImages((prev) => [...prev, ...data]);
        } else {
          setImages(data);
        }
        setHasMore(data.length >= LIMIT);
      } catch {
        if (!append) setImages([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch],
  );

  useEffect(() => {
    if (view === "all") {
      setOffset(0);
      fetchImages(0, false);
    }
  }, [fetchImages, view]);

  const loadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    fetchImages(newOffset, true);
  };

  const fetchCollections = async () => {
    setCollectionsLoading(true);
    try {
      const res = await fetch("/api/collections", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data: Collection[] = await res.json();
      setCollections(data);
    } catch {
      setCollections([]);
    } finally {
      setCollectionsLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  const fetchLikedImages = async () => {
    setLikedLoading(true);
    try {
      const res = await fetch("/api/my-liked-images?limit=80", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data: MyImage[] = await res.json();
      setLikedImages(data);
    } catch {
      setLikedImages([]);
    } finally {
      setLikedLoading(false);
    }
  };

  useEffect(() => {
    if (view === "liked") {
      fetchLikedImages();
    }
  }, [view]);

  const fetchCollectionItems = async (colId: number) => {
    setCollectionLoading(true);
    try {
      const res = await fetch(`/api/collections/${colId}/items`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      const data: MyImage[] = await res.json();
      setCollectionImages(data);
    } catch {
      setCollectionImages([]);
    } finally {
      setCollectionLoading(false);
    }
  };

  useEffect(() => {
    if (typeof view === "number") {
      fetchCollectionItems(view);
    }
  }, [view]);

  const createCollection = async () => {
    if (!newColName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newColName.trim(), description: newColDesc.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create");
      const col: Collection = await res.json();
      setCollections((prev) => [...prev, col]);
      setNewColName("");
      setNewColDesc("");
      setCreateOpen(false);
      toast({ title: "Collection created", description: col.name });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const deleteCollection = async (colId: number) => {
    try {
      const res = await fetch(`/api/collections/${colId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      setCollections((prev) => prev.filter((c) => c.id !== colId));
      if (view === colId) setView("all");
      toast({ title: "Collection deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleShare = async (imageId: number) => {
    try {
      const res = await fetch(`/api/images/${imageId}/share`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      const updateFn = (prev: MyImage[]) =>
        prev.map((item) =>
          item.image.id === imageId
            ? { ...item, image: { ...item.image, isPublic: !item.image.isPublic } }
            : item,
        );
      setImages(updateFn);
      setCollectionImages(updateFn);
      toast({ title: "Visibility updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const addToCollection = async (colId: number, imageId: number) => {
    try {
      const res = await fetch(`/api/collections/${colId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageId }),
      });
      if (!res.ok) throw new Error("Failed");
      setAddToColImageId(null);
      toast({ title: "Added to collection" });
      if (view === colId) fetchCollectionItems(colId);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const removeFromCollection = async (colId: number, imageId: number) => {
    try {
      const res = await fetch(`/api/collections/${colId}/items/${imageId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      setCollectionImages((prev) => prev.filter((item) => item.image.id !== imageId));
      toast({ title: "Removed from collection" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const selectedCollection = typeof view === "number" ? collections.find((c) => c.id === view) : null;
  const displayImages = view === "all" ? images : view === "liked" ? likedImages : collectionImages;
  const isLoading = view === "all" ? loading : view === "liked" ? likedLoading : collectionLoading;
  const dateGrouped = useMemo(() => groupImagesByDate(images), [images]);

  const renderImageCard = (item: MyImage) => (
    <div
      key={item.image.id}
      className="group"
      data-testid={`card-image-${item.image.id}`}
    >
      <div className="pf-card pf-noise overflow-hidden rounded-2xl transition hover:-translate-y-0.5 hover:shadow-lg">
        <div
          className="relative cursor-pointer"
          onClick={() => setDetailImage(item)}
        >
          <img
            src={item.image.url}
            alt={item.job?.prompt || "Generated image"}
            className={`w-full object-cover ${item.job?.aspectRatio === "3:4" ? "aspect-[3/4]" : item.job?.aspectRatio === "4:3" ? "aspect-[4/3]" : "aspect-square"}`}
            loading="lazy"
            data-testid={`img-organize-${item.image.id}`}
          />
          <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
            <p
              className="p-3 text-xs leading-relaxed text-white/90"
              data-testid={`text-prompt-${item.image.id}`}
            >
              {item.job?.prompt || "Generated image"}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span
            className="truncate text-xs text-muted-foreground"
            data-testid={`text-created-${item.image.id}`}
          >
            {new Date(item.image.createdAt).toLocaleDateString()}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => toggleShare(item.image.id)}
              className={cn(
                "rounded-full p-1.5 text-xs transition hover:bg-primary/10",
                item.image.isPublic
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
              title={item.image.isPublic ? "Shared — click to unshare" : "Private — click to share"}
              data-testid={`button-share-${item.image.id}`}
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() =>
                setAddToColImageId(
                  addToColImageId === item.image.id ? null : item.image.id,
                )
              }
              className="rounded-full p-1.5 text-muted-foreground transition hover:bg-primary/10"
              title="Add to collection"
              data-testid={`button-add-to-collection-${item.image.id}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>

            {typeof view === "number" && (
              <button
                onClick={() => removeFromCollection(view, item.image.id)}
                className="rounded-full p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                title="Remove from collection"
                data-testid={`button-remove-from-collection-${item.image.id}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {addToColImageId === item.image.id && (
          <div
            className="border-t border-border/50 px-3 py-2"
            data-testid={`dropdown-collections-${item.image.id}`}
          >
            <div className="text-xs text-muted-foreground mb-1.5">
              Add to collection:
            </div>
            {collections.length === 0 ? (
              <div className="text-xs text-muted-foreground py-1">
                No collections yet
              </div>
            ) : (
              <div className="grid gap-1 max-h-32 overflow-y-auto">
                {collections.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => addToCollection(col.id, item.image.id)}
                    className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs text-muted-foreground transition hover:bg-background/40 hover:text-foreground"
                    data-testid={`button-add-image-${item.image.id}-to-${col.id}`}
                  >
                    <Folder className="h-3 w-3 shrink-0" />
                    <span className="truncate">{col.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

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
                <ImageIcon className="h-5 w-5 text-primary" strokeWidth={2.2} />
              </div>
              <div>
                <div
                  className="pf-display text-[15px] font-semibold tracking-[-0.02em]"
                  data-testid="text-appname"
                >
                  PromptForge
                </div>
                <div className="text-xs text-muted-foreground" data-testid="text-tagline">
                  My Library
                </div>
              </div>
            </a>
          </div>
        </header>

        <main className="relative mx-auto max-w-7xl px-5 pt-10 pb-20">
          <div className="mb-8">
            <h1
              className="pf-display text-3xl font-bold tracking-[-0.03em] md:text-4xl"
              data-testid="text-organize-title"
            >
              Organize
            </h1>
            <p
              className="mt-2 text-sm text-muted-foreground"
              data-testid="text-organize-subtitle"
            >
              Manage your generated images and collections
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
            <aside className="space-y-4" data-testid="sidebar-collections">
              <div className="flex items-center justify-between">
                <h2
                  className="pf-display text-sm font-semibold"
                  data-testid="text-collections-heading"
                >
                  Collections
                </h2>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      data-testid="button-create-collection"
                    >
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent data-testid="dialog-create-collection">
                    <DialogHeader>
                      <DialogTitle>New Collection</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-3 pt-2">
                      <Input
                        value={newColName}
                        onChange={(e) => setNewColName(e.target.value)}
                        placeholder="Collection name"
                        className="rounded-2xl bg-background/40"
                        data-testid="input-collection-name"
                      />
                      <Input
                        value={newColDesc}
                        onChange={(e) => setNewColDesc(e.target.value)}
                        placeholder="Description (optional)"
                        className="rounded-2xl bg-background/40"
                        data-testid="input-collection-description"
                      />
                      <Button
                        onClick={createCollection}
                        disabled={creating || !newColName.trim()}
                        className="rounded-2xl"
                        data-testid="button-submit-collection"
                      >
                        {creating ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          "Create"
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <button
                onClick={() => setView("all")}
                className={cn(
                  "flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm transition",
                  view === "all"
                    ? "pf-card pf-noise text-foreground"
                    : "text-muted-foreground hover:bg-background/40",
                )}
                data-testid="button-view-all"
              >
                <ImageIcon className="h-4 w-4" />
                All Images
              </button>

              <button
                onClick={() => setView("liked")}
                className={cn(
                  "flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm transition",
                  view === "liked"
                    ? "pf-card pf-noise text-foreground"
                    : "text-muted-foreground hover:bg-background/40",
                )}
                data-testid="button-view-liked"
              >
                <Heart className="h-4 w-4" />
                Liked
              </button>

              {collectionsLoading ? (
                <div className="flex justify-center py-4" data-testid="status-collections-loading">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                collections.map((col) => (
                  <div
                    key={col.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm transition",
                      view === col.id
                        ? "pf-card pf-noise text-foreground"
                        : "text-muted-foreground hover:bg-background/40",
                    )}
                    data-testid={`collection-item-${col.id}`}
                  >
                    <button
                      onClick={() => setView(col.id)}
                      className="flex flex-1 items-center gap-2 text-left"
                      data-testid={`button-select-collection-${col.id}`}
                    >
                      <Folder className="h-4 w-4 shrink-0" />
                      <span className="truncate">{col.name}</span>
                    </button>
                    <button
                      onClick={() => deleteCollection(col.id)}
                      className="shrink-0 rounded-full p-1 opacity-0 transition hover:bg-destructive/20 group-hover:opacity-100"
                      data-testid={`button-delete-collection-${col.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                ))
              )}
            </aside>

            <div>
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2
                  className="pf-display text-lg font-semibold"
                  data-testid="text-view-title"
                >
                  {selectedCollection ? selectedCollection.name : view === "liked" ? "Liked" : "All Images"}
                </h2>

                <div className="flex items-center gap-2">
                  {view === "all" && (
                    <div className="relative w-full sm:max-w-xs">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search prompts..."
                        className="h-10 rounded-2xl bg-background/40 pl-9"
                        data-testid="input-search"
                      />
                    </div>
                  )}

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 rounded-2xl"
                        data-testid="button-view-options"
                      >
                        <LayoutGrid className="mr-1.5 h-4 w-4" />
                        View
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-44 rounded-2xl p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Image Size</p>
                      <ToggleGroup
                        type="single"
                        value={viewSize}
                        onValueChange={(v) => { if (v) setViewSize(v as ViewSize); }}
                        className="flex flex-col gap-1"
                      >
                        {(["small", "medium", "large"] as ViewSize[]).map((s) => (
                          <ToggleGroupItem
                            key={s}
                            value={s}
                            className="w-full justify-start rounded-xl capitalize"
                            data-testid={`button-size-${s}`}
                          >
                            {s}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {isLoading ? (
                <div
                  className="flex items-center justify-center py-20"
                  data-testid="status-loading"
                >
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : displayImages.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center gap-3 py-20 text-center"
                  data-testid="status-empty"
                >
                  <div className="pf-card grid h-12 w-12 place-items-center rounded-2xl">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {view === "all"
                      ? "No images found. Generate some in the Studio!"
                      : view === "liked"
                        ? "No liked images yet. Like images from the Explore page!"
                        : "This collection is empty. Add images from All Images."}
                  </p>
                </div>
              ) : (
                <>
                  {view === "all" ? (
                    <div className="space-y-8" data-testid="history-section">
                      {dateGrouped.map(({ label, items }) => {
                        const jobGroups = groupImagesByJob(items);
                        return (
                          <div key={label} data-testid={`history-group-${label.toLowerCase().replace(/\s+/g, "-")}`}>
                            <div className="mb-4 flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <h3 className="pf-display text-sm font-semibold" data-testid={`text-history-label-${label.toLowerCase().replace(/\s+/g, "-")}`}>
                                {label}
                              </h3>
                              <span className="text-xs text-muted-foreground">({items.length})</span>
                            </div>
                            <div className="space-y-3">
                              {jobGroups.map((group) => (
                                <div key={group.jobId} className="flex items-start gap-4">
                                  <div className="flex shrink-0 gap-2">
                                    {group.images.map((item) => (
                                      <div
                                        key={item.image.id}
                                        className="group relative overflow-hidden rounded-xl border-2 border-border/30 transition-all hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 cursor-pointer"
                                        style={{ width: sizeMaxWidths[viewSize] }}
                                        onClick={() => setDetailImage(item)}
                                        data-testid={`card-image-${item.image.id}`}
                                      >
                                        <img
                                          src={item.image.url}
                                          alt={item.job?.prompt || "Generated image"}
                                          className={`w-full object-cover ${item.job?.aspectRatio === "3:4" ? "aspect-[3/4]" : item.job?.aspectRatio === "4:3" ? "aspect-[4/3]" : "aspect-square"}`}
                                          loading="lazy"
                                          data-testid={`img-organize-${item.image.id}`}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <div className="min-w-0 pt-1">
                                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3" data-testid={`text-job-prompt-${group.jobId}`}>
                                      {group.prompt}
                                    </p>
                                    <p className="mt-1 text-[11px] text-muted-foreground/60">
                                      {group.aspectRatio === "3:4" ? "Portrait" : group.aspectRatio === "4:3" ? "Landscape" : "Square"}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-3" data-testid="grid-images">
                      {groupImagesByJob(displayImages).map((group) => (
                        <div key={group.jobId} className="flex items-start gap-4">
                          <div className="flex shrink-0 gap-2">
                            {group.images.map((item) => (
                              <div
                                key={item.image.id}
                                className="group relative overflow-hidden rounded-xl border-2 border-border/30 transition-all hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10 cursor-pointer"
                                style={{ width: sizeMaxWidths[viewSize] }}
                                onClick={() => setDetailImage(item)}
                                data-testid={`card-image-${item.image.id}`}
                              >
                                <img
                                  src={item.image.url}
                                  alt={item.job?.prompt || "Generated image"}
                                  className={`w-full object-cover ${item.job?.aspectRatio === "3:4" ? "aspect-[3/4]" : item.job?.aspectRatio === "4:3" ? "aspect-[4/3]" : "aspect-square"}`}
                                  loading="lazy"
                                  data-testid={`img-organize-${item.image.id}`}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="min-w-0 pt-1">
                            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3" data-testid={`text-job-prompt-${group.jobId}`}>
                              {group.prompt}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground/60">
                              {group.aspectRatio === "3:4" ? "Portrait" : group.aspectRatio === "4:3" ? "Landscape" : "Square"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {view === "all" && hasMore && (
                    <div className="mt-8 flex justify-center">
                      <Button
                        variant="secondary"
                        className="rounded-2xl px-8"
                        onClick={loadMore}
                        disabled={loadingMore}
                        data-testid="button-load-more"
                      >
                        {loadingMore ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          "Load more"
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>

        <footer className="relative border-t border-border/50 py-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 text-xs text-muted-foreground">
            <div>PromptForge</div>
            <div>Built on Replit</div>
          </div>
        </footer>
      </div>

      {detailImage && !editOpen && (
        <ImageDetailPanel
          image={{
            id: detailImage.image.id,
            url: detailImage.image.url,
            createdAt: detailImage.image.createdAt,
          }}
          job={{
            id: detailImage.job.id,
            prompt: detailImage.job.prompt,
            negativePrompt: detailImage.job.negativePrompt,
            aspectRatio: detailImage.job.aspectRatio,
            stylize: detailImage.job.stylize,
            weirdness: detailImage.job.weirdness,
            variety: detailImage.job.variety,
            seed: detailImage.job.seed,
            status: detailImage.job.status,
          }}
          onClose={() => setDetailImage(null)}
          busy={detailBusy}
          onVary={async (imageId, strength) => {
            setDetailBusy(true);
            try {
              const res = await fetch(`/api/images/${imageId}/vary`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ strength }),
              });
              if (!res.ok) throw new Error("Variation failed");
              setDetailImage(null);
              toast({ title: "Variation created" });
              if (view === "all") { setOffset(0); fetchImages(0, false); }
            } catch (err: any) {
              toast({ title: "Error", description: err.message, variant: "destructive" });
            } finally {
              setDetailBusy(false);
            }
          }}
          onUpscale={async (imageId, mode) => {
            setDetailBusy(true);
            try {
              const res = await fetch(`/api/images/${imageId}/upscale`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ mode }),
              });
              if (!res.ok) throw new Error("Upscale failed");
              setDetailImage(null);
              toast({ title: `Upscale (${mode}) complete` });
              if (view === "all") { setOffset(0); fetchImages(0, false); }
            } catch (err: any) {
              toast({ title: "Error", description: err.message, variant: "destructive" });
            } finally {
              setDetailBusy(false);
            }
          }}
          onRerun={async (jobId) => {
            setDetailBusy(true);
            try {
              const res = await fetch(`/api/jobs/${jobId}/reroll`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({}),
              });
              if (!res.ok) throw new Error("Rerun failed");
              setDetailImage(null);
              toast({ title: "Rerun complete" });
              if (view === "all") { setOffset(0); fetchImages(0, false); }
            } catch (err: any) {
              toast({ title: "Error", description: err.message, variant: "destructive" });
            } finally {
              setDetailBusy(false);
            }
          }}
          onEdit={(imageId) => {
            const item = images.find(i => i.image.id === imageId) || detailImage;
            if (item) {
              setEditImage(item);
              setEditOpen(true);
            }
          }}
          onUsePrompt={(promptText) => {
            setDetailImage(null);
            setLocation(`/?prompt=${encodeURIComponent(promptText)}`);
            toast({ title: "Prompt loaded in Create" });
          }}
          onUseImage={(imageId, imageUrl) => {
            setDetailImage(null);
            setLocation(`/?refImageId=${imageId}&refImageUrl=${encodeURIComponent(imageUrl)}`);
            toast({ title: "Reference image loaded in Create" });
          }}
          onUseStyle={async (imageId) => {
            setDetailBusy(true);
            try {
              const res = await fetch(`/api/images/${imageId}/analyze-style`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
              });
              if (!res.ok) throw new Error("Style analysis failed");
              const data = await res.json();
              setDetailImage(null);
              setLocation(`/?style=${encodeURIComponent(data.style)}`);
              toast({ title: "Style extracted and loaded in Create" });
            } catch (err: any) {
              toast({ title: "Style analysis failed", description: err.message, variant: "destructive" });
            } finally {
              setDetailBusy(false);
            }
          }}
          onShare={(imageId) => toggleShare(imageId)}
        />
      )}

      {editOpen && editImage && (
        <ImageEditPanel
          image={{
            id: editImage.image.id,
            url: editImage.image.url,
            createdAt: editImage.image.createdAt,
          }}
          job={{
            id: editImage.job.id,
            prompt: editImage.job.prompt,
            negativePrompt: editImage.job.negativePrompt,
            aspectRatio: editImage.job.aspectRatio,
            stylize: editImage.job.stylize,
            seed: editImage.job.seed,
            status: editImage.job.status,
          }}
          onClose={() => { setEditOpen(false); setEditImage(null); }}
          busy={detailBusy}
          onSubmitEdit={async (imageId, mask, editPrompt) => {
            setDetailBusy(true);
            try {
              const res = await fetch(`/api/images/${imageId}/edit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ prompt: editPrompt, mask }),
              });
              if (!res.ok) throw new Error("Edit failed");
              setEditOpen(false);
              setEditImage(null);
              toast({ title: "Edit applied" });
              if (view === "all") { setOffset(0); fetchImages(0, false); }
            } catch (err: any) {
              toast({ title: "Error", description: err.message, variant: "destructive" });
            } finally {
              setDetailBusy(false);
            }
          }}
          onVary={async (imageId, strength) => {
            setDetailBusy(true);
            try {
              const res = await fetch(`/api/images/${imageId}/vary`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ strength }),
              });
              if (!res.ok) throw new Error("Variation failed");
              setEditOpen(false);
              setEditImage(null);
              toast({ title: "Variation created" });
              if (view === "all") { setOffset(0); fetchImages(0, false); }
            } catch (err: any) {
              toast({ title: "Error", description: err.message, variant: "destructive" });
            } finally {
              setDetailBusy(false);
            }
          }}
          onOpenInEditTab={(imageId) => {
            setEditOpen(false);
            setEditImage(null);
            setLocation(`/edit?imageId=${imageId}`);
          }}
        />
      )}
    </div>
  );
}
