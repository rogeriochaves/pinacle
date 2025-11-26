"use client";

import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/currency-utils";
import {
  type Currency,
  isTierAtOrAbove,
  PRICING_TABLE,
  RESOURCE_TIERS,
  type TierId,
} from "@/lib/pod-orchestration/resource-tier-registry";
import {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";

type TierSelectorSetupProps = {
  value?: string;
  onChange: (tierId: string) => void;
  currency?: Currency;
  isCurrencyLoading?: boolean;
  minimumTier?: TierId;
};

export const TierSelectorSetup = ({
  value = "dev.small",
  onChange,
  currency = "usd",
  isCurrencyLoading = false,
  minimumTier = "dev.small",
}: TierSelectorSetupProps) => {
  const t = useTranslations("setup");
  return (
    <div className="flex flex-col gap-2">
      {Object.values(RESOURCE_TIERS).map((tier) => {
        const isSelected = value === tier.id;
        const tierPrice =
          PRICING_TABLE[tier.id as keyof typeof PRICING_TABLE][currency];
        const isDisabled = !isTierAtOrAbove(tier.id as TierId, minimumTier);
        const minimumTierData = RESOURCE_TIERS[minimumTier];

        const buttonElement = (
          <button
            key={tier.id}
            type="button"
            onClick={() => !isDisabled && onChange(tier.id)}
            disabled={isDisabled}
            className={`
              w-full flex items-center justify-between px-4 py-2 rounded-lg border-2 transition-all
              ${
                isDisabled
                  ? "border-gray-100 bg-gray-50 cursor-not-allowed opacity-50"
                  : isSelected
                    ? "border-orange-500 bg-orange-50"
                    : "border-gray-200 hover:border-gray-300 bg-white"
              }
            `}
          >
            {/* Content */}
            <div className="flex-1 text-left">
              <div className="flex flex-col items-start gap-0.5">
                <span
                  className={`font-mono font-bold text-sm ${isDisabled ? "text-slate-400" : "text-slate-900"}`}
                >
                  {tier.name}
                </span>
                <span
                  className={`text-xs font-mono ${isDisabled ? "text-slate-400" : "text-slate-600"}`}
                >
                  {tier.cpu} vCPU • {tier.memory}GB RAM • {tier.storage}GB Disk
                </span>
              </div>
            </div>

            {/* Price and Radio */}
            <div className="flex items-center gap-3 shrink-0">
              <span
                className={`font-mono font-bold text-sm ${isDisabled ? "text-slate-400" : "text-slate-900"}`}
              >
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
                  ${isDisabled ? "border-gray-200" : isSelected ? "border-orange-500" : "border-gray-300"}
                `}
              >
                {isSelected && !isDisabled && (
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                )}
              </div>
            </div>
          </button>
        );

        // Wrap disabled buttons with tooltip
        if (isDisabled) {
          return (
            <Tooltip key={tier.id}>
              <TooltipTrigger asChild>{buttonElement}</TooltipTrigger>
              <TooltipContent>
                <p>
                  {t("tierTooSmall", { minimumTier: minimumTierData.name })}
                </p>
                <TooltipArrow />
              </TooltipContent>
            </Tooltip>
          );
        }

        return buttonElement;
      })}
    </div>
  );
};
