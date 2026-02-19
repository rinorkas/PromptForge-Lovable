import React, { useState } from "react";
import { Check, Crown, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const plans = [
  {
    id: "basic",
    name: "Basic",
    icon: Zap,
    monthlyPrice: 9.99,
    yearlyPrice: 99.99,
    description: "Perfect for hobbyists and casual creators",
    features: [
      "50 image generations per month",
      "Standard resolution output",
      "3 style presets",
      "1 moodboard",
      "Community Explore access",
      "Basic aspect ratios (1:1, 16:9)",
    ],
    cta: "Get Basic",
  },
  {
    id: "standard",
    name: "Standard",
    icon: Crown,
    monthlyPrice: 24.99,
    yearlyPrice: 249.99,
    description: "For serious creators who need more power",
    popular: true,
    features: [
      "Unlimited image generations",
      "High resolution + upscaling",
      "Unlimited style presets",
      "Unlimited moodboards",
      "Priority generation queue",
      "All aspect ratios",
      "Reroll & variations included",
      "Style Creator access",
      "Private collections",
      "Early access to new features",
    ],
    cta: "Get Standard",
  },
];

export default function Subscription() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const { toast } = useToast();

  const handleSubscribe = (planId: string) => {
    toast({
      title: "Coming soon",
      description: `The ${planId} plan will be available for purchase soon. Stay tuned!`,
    });
  };

  return (
    <div className="min-h-screen px-4 py-10 md:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 text-center">
          <h1 className="pf-display text-3xl font-bold tracking-tight md:text-4xl" data-testid="heading-subscription">
            Choose Your Plan
          </h1>
          <p className="mt-3 text-muted-foreground" data-testid="text-subscription-subtitle">
            Unlock the full power of PromptForge
          </p>

          <div className="mt-6 inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/60 p-1 backdrop-blur-sm" data-testid="billing-toggle">
            <button
              onClick={() => setBilling("monthly")}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-medium transition-all",
                billing === "monthly"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              data-testid="button-monthly"
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-medium transition-all",
                billing === "yearly"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              data-testid="button-yearly"
            >
              Yearly
              <span className="ml-1.5 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {plans.map((plan) => {
            const price = billing === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
            const Icon = plan.icon;
            return (
              <div
                key={plan.id}
                className={cn(
                  "pf-card pf-noise relative flex flex-col rounded-3xl p-6 md:p-8 transition-all",
                  plan.popular && "ring-2 ring-primary/50"
                )}
                data-testid={`card-plan-${plan.id}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground" data-testid="badge-popular">
                    Most Popular
                  </div>
                )}

                <div className="mb-6">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "grid h-10 w-10 place-items-center rounded-xl",
                      plan.popular ? "bg-primary/20" : "bg-muted/60"
                    )}>
                      <Icon className={cn("h-5 w-5", plan.popular ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <h2 className="pf-display text-xl font-bold" data-testid={`text-plan-name-${plan.id}`}>
                      {plan.name}
                    </h2>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground" data-testid={`text-plan-description-${plan.id}`}>
                    {plan.description}
                  </p>
                </div>

                <div className="mb-6" data-testid={`text-plan-price-${plan.id}`}>
                  <span className="pf-display text-4xl font-bold">${price.toFixed(2)}</span>
                  <span className="text-sm text-muted-foreground">
                    /{billing === "monthly" ? "mo" : "yr"}
                  </span>
                  {billing === "yearly" && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      ${(plan.yearlyPrice / 12).toFixed(2)}/mo billed annually
                    </div>
                  )}
                </div>

                <ul className="mb-8 flex flex-1 flex-col gap-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm" data-testid={`feature-${plan.id}-${i}`}>
                      <Check className={cn("mt-0.5 h-4 w-4 shrink-0", plan.popular ? "text-primary" : "text-green-400")} />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handleSubscribe(plan.id)}
                  className={cn(
                    "w-full rounded-xl py-5 text-sm font-medium",
                    plan.popular
                      ? "bg-primary hover:bg-primary/90"
                      : "bg-muted/60 text-foreground hover:bg-muted"
                  )}
                  data-testid={`button-subscribe-${plan.id}`}
                >
                  {plan.cta}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center text-xs text-muted-foreground" data-testid="text-subscription-footer">
          All plans include a 7-day free trial. Cancel anytime. Prices in USD.
        </div>
      </div>
    </div>
  );
}
