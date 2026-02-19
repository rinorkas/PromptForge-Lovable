import { Wand2, Sparkles, Layers, ArrowUpCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 pf-grid opacity-[0.35]" />
        <div className="pointer-events-none absolute -top-24 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.28),transparent_60%)] blur-3xl" />
        <div className="pointer-events-none absolute -top-10 right-[-160px] h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--accent)/0.25),transparent_60%)] blur-3xl" />

        <header className="relative mx-auto max-w-7xl px-5 pt-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="pf-card pf-noise grid h-10 w-10 place-items-center rounded-2xl" data-testid="badge-logo">
                <Wand2 className="h-5 w-5 text-primary" strokeWidth={2.2} />
              </div>
              <div className="pf-display text-[15px] font-semibold tracking-[-0.02em]" data-testid="text-appname">
                PromptForge
              </div>
            </div>
            <a href="/api/login" data-testid="button-login-header">
              <Button variant="secondary" className="rounded-full">
                Log in
              </Button>
            </a>
          </div>
        </header>

        <main className="relative mx-auto max-w-7xl px-5 pt-20 pb-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/40 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur" data-testid="badge-ai">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Powered by GPT Image AI
            </div>

            <h1 className="pf-display mt-6 text-4xl font-bold leading-tight tracking-[-0.03em] md:text-6xl" data-testid="text-headline">
              Create stunning images
              <br />
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                from text prompts
              </span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground md:text-lg" data-testid="text-subheadline">
              A Midjourney-like studio for AI image generation. Write a prompt, generate, reroll, vary, and upscale — all in one polished workflow.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href="/api/login" data-testid="button-get-started">
                <Button size="lg" className="rounded-2xl px-8 text-base">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>

            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground" data-testid="text-trust">
              <span>Free to sign up</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>No credit card required</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>Sign in with Google, GitHub, or email</span>
            </div>
          </div>

          <div className="mx-auto mt-20 grid max-w-4xl gap-4 md:grid-cols-3" data-testid="grid-features">
            <Card className="pf-card pf-noise rounded-3xl p-6 transition hover:-translate-y-1 hover:shadow-lg" data-testid="card-feature-generate">
              <div className="pf-card grid h-11 w-11 place-items-center rounded-2xl">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h3 className="pf-display mt-4 text-base font-semibold">Generate</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Describe any scene, character, or concept — get 2 unique AI-generated images in seconds.
              </p>
            </Card>

            <Card className="pf-card pf-noise rounded-3xl p-6 transition hover:-translate-y-1 hover:shadow-lg" data-testid="card-feature-vary">
              <div className="pf-card grid h-11 w-11 place-items-center rounded-2xl">
                <Layers className="h-5 w-5 text-accent" />
              </div>
              <h3 className="pf-display mt-4 text-base font-semibold">Reroll & Vary</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Not quite right? Reroll for fresh takes, or create subtle and strong variations of your favorites.
              </p>
            </Card>

            <Card className="pf-card pf-noise rounded-3xl p-6 transition hover:-translate-y-1 hover:shadow-lg" data-testid="card-feature-upscale">
              <div className="pf-card grid h-11 w-11 place-items-center rounded-2xl">
                <ArrowUpCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <h3 className="pf-display mt-4 text-base font-semibold">Upscale</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Found your winner? Upscale it to ultra-detailed, high-resolution quality ready for any use.
              </p>
            </Card>
          </div>
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
