import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import Landing from "@/pages/landing";
import Studio from "@/pages/studio";
import EditPage from "@/pages/edit";
import Explore from "@/pages/explore";
import Organize from "@/pages/organize";
import Personalize from "@/pages/personalize";
import MoodboardsPage from "@/pages/moodboards-page";

import Subscription from "@/pages/subscription";
import NotFound from "@/pages/not-found";
import {
  Loader2,
  Wand2,
  Pencil,
  Compass,
  FolderOpen,
  Sparkles,
  Palette,

  CreditCard,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/", label: "Create", icon: Wand2 },
  { path: "/edit", label: "Edit", icon: Pencil },
  { path: "/explore", label: "Explore", icon: Compass },
  { path: "/organize", label: "Organize", icon: FolderOpen },
  { path: "/personalize", label: "Personalize", icon: Sparkles },
  { path: "/moodboards", label: "Moodboards", icon: Palette },

  { path: "/subscription", label: "Subscription", icon: CreditCard },
];

function Sidebar() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-[68px] flex-col items-center border-r border-border/40 bg-background/80 backdrop-blur-xl py-4 lg:w-[200px]" data-testid="nav-sidebar">
      <nav className="flex flex-1 flex-col gap-1 px-2 w-full">
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = location === path;
          return (
            <button
              key={path}
              onClick={() => setLocation(path)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
              data-testid={`nav-${label.toLowerCase()}`}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
              <span className="hidden lg:block">{label}</span>
            </button>
          );
        })}
      </nav>

      {user && (
        <div className="mt-auto flex flex-col items-center gap-2 px-2 pb-2 w-full">
          <div className="flex items-center gap-2 px-3 py-2 w-full" data-testid="nav-user">
            {user.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={user.firstName || "User"}
                className="h-7 w-7 shrink-0 rounded-full border border-border/70"
                data-testid="nav-avatar"
              />
            ) : (
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                {(user.firstName?.[0] || user.email?.[0] || "U").toUpperCase()}
              </div>
            )}
            <span className="hidden truncate text-xs text-muted-foreground lg:block" data-testid="nav-username">
              {user.firstName || user.email || "User"}
            </span>
          </div>
          <a href="/api/logout" className="w-full" data-testid="nav-logout">
            <Button variant="ghost" size="sm" className="w-full justify-start rounded-xl px-3 text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="hidden lg:block ml-3 text-xs">Log out</span>
            </Button>
          </a>
        </div>
      )}
    </aside>
  );
}

function AppContent() {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-[68px] flex-1 lg:ml-[200px]">
        <Switch>
          <Route path="/" component={Studio} />
          <Route path="/edit" component={EditPage} />
          <Route path="/explore" component={Explore} />
          <Route path="/organize" component={Organize} />
          <Route path="/personalize" component={Personalize} />
          <Route path="/moodboards" component={MoodboardsPage} />

          <Route path="/subscription" component={Subscription} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
