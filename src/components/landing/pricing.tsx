"use client";

import { Check, Zap, Crown, Rocket } from "lucide-react";
import Link from "next/link";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card";
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
    <section id="pricing" className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-base font-semibold leading-7 text-blue-600">
            Pricing
          </h2>
          <p className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Choose your development power
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Simple, transparent pricing that scales with your needs.
            All plans include our core AI development stack.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 items-center gap-y-6 sm:mt-20 sm:gap-y-0 lg:max-w-4xl lg:grid-cols-3">
          {tiers.map((tier, tierIdx) => {
            const Icon = tier.icon;
            return (
              <Card
                key={tier.id}
                className={`
                  relative
                  ${tier.popular
                    ? "ring-2 ring-blue-600 scale-105 shadow-xl"
                    : "ring-1 ring-gray-200"
                  }
                  ${tierIdx === 0 ? "lg:rounded-r-none" : ""}
                  ${tierIdx === 1 ? "lg:rounded-none" : ""}
                  ${tierIdx === 2 ? "lg:rounded-l-none" : ""}
                `}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-blue-600 text-white">
                      Most Popular
                    </Badge>
                  </div>
                )}

                <CardHeader className="pb-6">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      {tier.name}
                    </CardTitle>
                    <Icon className="h-6 w-6 text-blue-600" />
                  </div>
                  <CardDescription className="mt-2">
                    {tier.description}
                  </CardDescription>
                  <div className="mt-6 flex items-baseline gap-x-1">
                    <span className="text-4xl font-bold tracking-tight text-gray-900">
                      ${tier.price}
                    </span>
                    <span className="text-sm font-semibold leading-6 text-gray-600">
                      /month
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="pb-6">
                  <ul className="space-y-3">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-center">
                        <Check className="h-4 w-4 text-green-500 mr-3 flex-shrink-0" />
                        <span className="text-sm text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  <Button
                    asChild
                    className={`w-full ${
                      tier.popular
                        ? "bg-blue-600 hover:bg-blue-700"
                        : "bg-gray-900 hover:bg-gray-800"
                    }`}
                  >
                    <Link href="/auth/signup">
                      {tier.cta}
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-gray-600">
            All plans include a 7-day free trial. No credit card required to start.
          </p>
          <div className="mt-6 flex justify-center space-x-6 text-sm">
            <div className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              <span className="text-gray-600">Cancel anytime</span>
            </div>
            <div className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              <span className="text-gray-600">No setup fees</span>
            </div>
            <div className="flex items-center">
              <Check className="h-4 w-4 text-green-500 mr-2" />
              <span className="text-gray-600">24/7 support</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

