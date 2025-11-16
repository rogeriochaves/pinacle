"use client";

import { formatCurrency } from "@/lib/currency-utils";
import {
  type Currency,
  PRICING_TABLE,
  RESOURCE_TIERS,
} from "@/lib/pod-orchestration/resource-tier-registry";

type TierSelectorSetupProps = {
  value?: string;
  onChange: (tierId: string) => void;
  currency?: Currency;
  isCurrencyLoading?: boolean;
};

export const TierSelectorSetup = ({
  value = "dev.small",
  onChange,
  currency = "usd",
  isCurrencyLoading = false,
}: TierSelectorSetupProps) => {
  return (
    <div className="flex flex-col gap-2">
      {Object.values(RESOURCE_TIERS).map((tier) => {
        const isSelected = value === tier.id;
        const tierPrice =
          PRICING_TABLE[tier.id as keyof typeof PRICING_TABLE][currency];

        return (
          <button
            key={tier.id}
            type="button"
            onClick={() => onChange(tier.id)}
            className={`
              w-full flex items-center justify-between px-4 py-2 rounded-lg border-2 transition-all
              ${
                isSelected
                  ? "border-orange-500 bg-orange-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }
            `}
          >
            {/* Content */}
            <div className="flex-1 text-left">
              <div className="flex flex-col items-start gap-0.5">
                <span className="font-mono font-bold text-sm text-slate-900">
                  {tier.name}
                </span>
                <span className="text-xs text-slate-600 font-mono">
                  {tier.cpu} vCPU • {tier.memory}GB RAM • {tier.storage}GB Disk
                </span>
              </div>
            </div>

            {/* Price and Radio */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="font-mono font-bold text-sm text-slate-900">
                {isCurrencyLoading
                  ? "..."
                  : formatCurrency(tierPrice, currency, {
                      showDecimals: false,
                    })}
                /mo
              </span>
              <div
                className={`
                  w-5 h-5 rounded-full border-2 flex items-center justify-center
                  ${isSelected ? "border-orange-500" : "border-gray-300"}
                `}
              >
                {isSelected && (
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
