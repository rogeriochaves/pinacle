"use client";

import { Check, Zap, Crown, Rocket } from "lucide-react";
import Link from "next/link";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";

const tiers = [
  {
    name: "Starter",
    id: "starter",
    price: 8,
    description: "Perfect for personal projects and learning",
    icon: Zap,
    features: [
      "1 vCPU",
      "1GB RAM",
      "10GB Storage",
      "Claude Code + Vibe Kanban + VS Code",
      "24/7 uptime",
      "Browser access",
      "Terminal access",
      "Basic support",
    ],
    cta: "Start Building",
    popular: false,
  },
  {
    name: "Professional",
    id: "professional",
    price: 24,
    description: "For serious developers and small teams",
    icon: Crown,
    features: [
      "2 vCPUs",
      "4GB RAM",
      "50GB Storage",
      "All Starter features",
      "Team collaboration",
      "Custom domains",
      "Priority support",
      "Advanced monitoring",
      "Backup & restore",
    ],
    cta: "Go Professional",
    popular: true,
  },
  {
    name: "Enterprise",
    id: "enterprise",
    price: 64,
    description: "For growing teams and production workloads",
    icon: Rocket,
    features: [
      "4 vCPUs",
      "8GB RAM",
      "200GB Storage",
      "All Professional features",
      "SSO integration",
      "Advanced security",
      "Dedicated support",
      "SLA guarantee",
      "Custom integrations",
    ],
    cta: "Scale Up",
    popular: false,
  },
];

export const Pricing = () => {
  return (
    <section id="pricing" className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-flex items-center rounded-sm border-2 border-border-contrast bg-orange-200 px-4 py-2 text-sm font-mono font-bold text-orange-950 shadow-btn">
            PRICING
          </div>
          <p className="mt-2 text-4xl font-bold font-mono tracking-tight text-foreground sm:text-5xl">
            CHOOSE YOUR DEVELOPMENT POWER
          </p>
          <p className="mt-6 text-lg leading-8 text-muted-foreground font-mono">
            Simple, transparent pricing that scales with your needs. All plans
            include our core AI development stack.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 items-stretch gap-8 sm:mt-20 lg:max-w-none lg:grid-cols-3">
          {tiers.map((tier) => {
            const Icon = tier.icon;
            return (
              <Card
                key={tier.id}
                className={tier.popular ? "ring-2 ring-orange-400" : ""}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-orange-300 text-orange-950 border-2 border-border-contrast font-mono font-bold shadow-btn">
                      MOST POPULAR
                    </Badge>
                  </div>
                )}

                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold font-mono text-foreground">
                      {tier.name.toUpperCase()}
                    </CardTitle>
                    <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-slate-200 border border-border-contrast">
                      <Icon className="h-4 w-4 text-slate-900" />
                    </div>
                  </div>
                  <CardDescription className="mt-2 font-mono text-muted-foreground">
                    {tier.description}
                  </CardDescription>
                  <div className="mt-6 flex items-baseline gap-x-1">
                    <span className="text-4xl font-bold font-mono tracking-tight text-foreground">
                      ${tier.price}
                    </span>
                    <span className="text-sm font-bold font-mono leading-6 text-muted-foreground">
                      /MONTH
                    </span>
                  </div>
                </CardHeader>

                <CardContent>
                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-center">
                        <div className="flex h-4 w-4 items-center justify-center rounded-sm bg-green-200 border border-border-contrast mr-3 flex-shrink-0">
                          <Check className="h-2 w-2 text-green-900" />
                        </div>
                        <span className="text-sm font-mono text-muted-foreground">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <Button
                    asChild
                    variant={tier.popular ? "accent" : "default"}
                    className="w-full font-mono font-bold"
                  >
                    <Link href="/auth/signup">{tier.cta.toUpperCase()}</Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm font-mono text-muted-foreground">
            All plans include a 7-day free trial. No credit card required to
            start.
          </p>
          <div className="mt-6 flex justify-center space-x-6 text-sm">
            <div className="flex items-center">
              <div className="flex h-4 w-4 items-center justify-center rounded-sm bg-green-200 border border-border-contrast mr-2">
                <Check className="h-2 w-2 text-green-900" />
              </div>
              <span className="font-mono text-muted-foreground">
                CANCEL ANYTIME
              </span>
            </div>
            <div className="flex items-center">
              <div className="flex h-4 w-4 items-center justify-center rounded-sm bg-green-200 border border-border-contrast mr-2">
                <Check className="h-2 w-2 text-green-900" />
              </div>
              <span className="font-mono text-muted-foreground">
                NO SETUP FEES
              </span>
            </div>
            <div className="flex items-center">
              <div className="flex h-4 w-4 items-center justify-center rounded-sm bg-green-200 border border-border-contrast mr-2">
                <Check className="h-2 w-2 text-green-900" />
              </div>
              <span className="font-mono text-muted-foreground">
                24/7 SUPPORT
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
