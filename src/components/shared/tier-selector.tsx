"use client";

import { useTranslations } from "next-intl";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { formatCurrency } from "@/lib/currency-utils";
import {
  type Currency,
  PRICING_TABLE,
  RESOURCE_TIERS,
} from "@/lib/pod-orchestration/resource-tier-registry";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../ui/select";

// Average hours per month for hourly pricing calculation
const HOURS_PER_MONTH = 730;

type TierSelectorProps = {
  value?: string;
  onChange: (tierId: string) => void;
  showLabel?: boolean;
  compact?: boolean;
  currency?: Currency;
  isLoading?: boolean;
  ariaLabel?: string;
};

export const TierSelector = ({
  value = "dev.small",
  onChange,
  showLabel = true,
  compact = false,
  currency = "usd",
  isLoading = false,
  ariaLabel,
}: TierSelectorProps) => {
  const t = useTranslations("setup");

  // A/B test: show hourly pricing instead of monthly in tier selector
  // Test with: ?ph_show-hourly-tier-pricing=test
  const pricingVariant = useFeatureFlag("show-hourly-tier-pricing");
  const showHourlyPricing = pricingVariant === "test";

  const selectedTier =
    value && value in RESOURCE_TIERS
      ? RESOURCE_TIERS[value as keyof typeof RESOURCE_TIERS]
      : RESOURCE_TIERS["dev.small"];

  const selectedTierPrice =
    PRICING_TABLE[selectedTier.id as keyof typeof PRICING_TABLE][currency];
  const selectedTierHourlyPrice = selectedTierPrice / HOURS_PER_MONTH;

  if (compact) {
    // Original compact version for landing page (dropdown with pricing)
    return (
      <div className="flex flex-col gap-1">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger
            className="w-fit-content !h-auto text-md font-mono p-0 border-none shadow-none bg-transparent gap-1 hover:bg-transparent focus:ring-0 focus:ring-offset-0 [&>svg]:text-lg"
            aria-label={ariaLabel}
          >
            <span className="mr-2">
              {isLoading ? (
                <span className="text-xl font-bold">...</span>
              ) : showHourlyPricing ? (
                <>
                  <span className="text-xl font-bold">
                    {formatCurrency(selectedTierHourlyPrice, currency, {
                      showDecimals: true,
                    })}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("perHour")}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xl font-bold">
                    {formatCurrency(selectedTierPrice, currency, {
                      showDecimals: false,
                    })}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("perMonth")}
                  </span>
                </>
              )}
            </span>
          </SelectTrigger>
          <SelectContent className="font-mono">
            {Object.values(RESOURCE_TIERS).map((tier) => {
              const tierPrice =
                PRICING_TABLE[tier.id as keyof typeof PRICING_TABLE][currency];
              const tierHourlyPrice = tierPrice / HOURS_PER_MONTH;
              return (
                <SelectItem key={tier.id} value={tier.id}>
                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex gap-1 w-full justify-between">
                      {showHourlyPricing ? (
                        <div className="text-sm font-semibold">
                          {formatCurrency(tierHourlyPrice, currency, {
                            showDecimals: true,
                          })}
                          {t("perHour")}
                        </div>
                      ) : (
                        <div className="text-sm font-semibold">
                          {formatCurrency(tierPrice, currency, {
                            showDecimals: false,
                          })}
                          {t("perMonth")}
                        </div>
                      )}
                      <div className="font-mono">{tier.name}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {tier.cpu} vCPU • {tier.memory} GB RAM • {tier.storage} GB
                      Disk
                      {tier.cpu > 0.6 && <span>&nbsp;</span>}
                    </div>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {showLabel && (
          <div className="text-xs text-muted-foreground">
            {selectedTier.cpu} vCPU • {selectedTier.memory} GB RAM
          </div>
        )}
      </div>
    );
  }

  // Full version for configure step
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full" aria-label={ariaLabel}>
        <div className="flex items-center justify-between w-full">
          <span className="font-mono">{selectedTier.name}</span>
          {isLoading ? (
            <span className="font-semibold">...</span>
          ) : showHourlyPricing ? (
            <span className="font-semibold">
              {formatCurrency(selectedTierHourlyPrice, currency, {
                showDecimals: true,
              })}
              {" "}{t("perHourOfUsage")}
            </span>
          ) : (
            <span className="font-semibold">
              {formatCurrency(selectedTierPrice, currency, {
                showDecimals: false,
              })}
              {t("perMonth")}
            </span>
          )}
        </div>
      </SelectTrigger>
      <SelectContent className="font-mono">
        {Object.values(RESOURCE_TIERS).map((tier) => {
          const tierPrice =
            PRICING_TABLE[tier.id as keyof typeof PRICING_TABLE][currency];
          const tierHourlyPrice = tierPrice / HOURS_PER_MONTH;
          return (
            <SelectItem key={tier.id} value={tier.id}>
              <div className="flex flex-col gap-1 w-full">
                <div className="flex gap-1 w-full justify-between">
                  <div className="font-mono">{tier.name}</div>
                  {showHourlyPricing ? (
                    <div className="text-sm font-semibold">
                      {formatCurrency(tierHourlyPrice, currency, {
                        showDecimals: true,
                      })}
                      {t("perHour")}
                    </div>
                  ) : (
                    <div className="text-sm font-semibold">
                      {formatCurrency(tierPrice, currency, {
                        showDecimals: false,
                      })}
                      {t("perMonth")}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {tier.cpu} vCPU • {tier.memory} GB RAM • {tier.storage} GB
                  Disk
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};
