import React, { useState, useEffect, useCallback } from "react";
import {
  Heart,
  Search,
  Loader2,
  TrendingUp,
  Clock,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type SortMode = "new" | "hot" | "top";

type ExploreItem = {
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
    userId: number;
    prompt: string;
    negativePrompt: string;
    aspectRatio: string;
    stylize: number;
    seed: number;
    status: string;
    createdAt: string;
  };
  likeCount: number;
  userName: string;
  liked: boolean;
};

const LIMIT = 30;

export default function Explore() {
  const [sort, setSort] = useState<SortMode>("new");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<ExploreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchItems = useCallback(
    async (currentOffset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams({
          sort,
          search: debouncedSearch,
          limit: String(LIMIT),
          offset: String(currentOffset),
        });
        const res = await fetch(`/api/explore?${params}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load");
        const data: ExploreItem[] = await res.json();
        if (append) {
          setItems((prev) => [...prev, ...data]);
        } else {
          setItems(data);
        }
        setHasMore(data.length >= LIMIT);
      } catch {
        if (!append) setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [sort, debouncedSearch],
  );

  useEffect(() => {
    setOffset(0);
    fetchItems(0, false);
  }, [fetchItems]);

  const loadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
    fetchItems(newOffset, true);
  };

  const toggleLike = async (imageId: number) => {
    try {
      const res = await fetch(`/api/images/${imageId}/like`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return;
      setItems((prev) =>
        prev.map((item) => {
          if (item.image.id === imageId) {
            return {
              ...item,
              liked: !item.liked,
              likeCount: item.liked
                ? item.likeCount - 1
                : item.likeCount + 1,
            };
          }
          return item;
        }),
      );
    } catch {}
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
                <Sparkle />
              </div>
              <div>
                <div
                  className="pf-display text-[15px] font-semibold tracking-[-0.02em]"
                  data-testid="text-appname"
                >
                  PromptForge
                </div>
                <div
                  className="text-xs text-muted-foreground"
                  data-testid="text-tagline"
                >
                  Community Gallery
                </div>
              </div>
            </a>
          </div>
        </header>

        <main className="relative mx-auto max-w-7xl px-5 pt-10 pb-20">
          <div className="mb-8">
            <h1
              className="pf-display text-3xl font-bold tracking-[-0.03em] md:text-4xl"
              data-testid="text-explore-title"
            >
              Explore
            </h1>
            <p
              className="mt-2 text-sm text-muted-foreground"
              data-testid="text-explore-subtitle"
            >
              Discover AI-generated images shared by the community
            </p>
          </div>

          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              value={sort}
              onValueChange={(v) => setSort(v as SortMode)}
              data-testid="tabs-sort"
            >
              <TabsList
                className="rounded-2xl bg-background/35"
                data-testid="tabslist-sort"
              >
                <TabsTrigger
                  value="new"
                  className="rounded-2xl"
                  data-testid="tab-sort-new"
                >
                  <Clock className="mr-1.5 h-3.5 w-3.5" />
                  New
                </TabsTrigger>
                <TabsTrigger
                  value="hot"
                  className="rounded-2xl"
                  data-testid="tab-sort-hot"
                >
                  <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
                  Hot
                </TabsTrigger>
                <TabsTrigger
                  value="top"
                  className="rounded-2xl"
                  data-testid="tab-sort-top"
                >
                  <Award className="mr-1.5 h-3.5 w-3.5" />
                  Top
                </TabsTrigger>
              </TabsList>
            </Tabs>

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
          </div>

          {loading ? (
            <div
              className="flex items-center justify-center py-20"
              data-testid="status-loading"
            >
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center gap-3 py-20 text-center"
              data-testid="status-empty"
            >
              <div className="pf-card grid h-12 w-12 place-items-center rounded-2xl">
                <Search className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                No images found. Try a different search or sort.
              </p>
            </div>
          ) : (
            <>
              <div
                className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4"
                data-testid="grid-explore"
              >
                {items.map((item) => (
                  <div
                    key={item.image.id}
                    className="group mb-4 break-inside-avoid"
                    data-testid={`card-image-${item.image.id}`}
                  >
                    <div className="pf-card pf-noise overflow-hidden rounded-2xl transition hover:-translate-y-0.5 hover:shadow-lg">
                      <div className="relative">
                        <img
                          src={item.image.url}
                          alt={item.job.prompt}
                          className="block w-full"
                          loading="lazy"
                          data-testid={`img-explore-${item.image.id}`}
                        />
                        <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                          <p
                            className="p-3 text-xs leading-relaxed text-white/90"
                            data-testid={`text-prompt-${item.image.id}`}
                          >
                            {item.job.prompt}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <span
                          className="truncate text-xs text-muted-foreground"
                          data-testid={`text-creator-${item.image.id}`}
                        >
                          {item.userName}
                        </span>
                        <button
                          onClick={() => toggleLike(item.image.id)}
                          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs transition hover:bg-primary/10"
                          data-testid={`button-like-${item.image.id}`}
                        >
                          <Heart
                            className={cn(
                              "h-3.5 w-3.5 transition",
                              item.liked
                                ? "fill-red-500 text-red-500"
                                : "text-muted-foreground",
                            )}
                          />
                          <span
                            className={cn(
                              item.liked
                                ? "text-red-500"
                                : "text-muted-foreground",
                            )}
                            data-testid={`text-likes-${item.image.id}`}
                          >
                            {item.likeCount}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {hasMore && (
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
        </main>

        <footer className="relative border-t border-border/50 py-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-5 text-xs text-muted-foreground">
            <div>PromptForge</div>
            <div>Built on Replit</div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Sparkle() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary"
    >
      <path d="M15 4V2" />
      <path d="M15 16v-2" />
      <path d="M8 9h2" />
      <path d="M20 9h2" />
      <path d="M17.8 11.8 19 13" />
      <path d="M15 9h.01" />
      <path d="M17.8 6.2 19 5" />
      <path d="m3 21 9-9" />
      <path d="M12.2 6.2 11 5" />
      <path d="M12.2 11.8 11 13" />
    </svg>
  );
}
