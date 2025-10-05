"use client";

import { RESOURCE_TIERS } from "@/lib/pod-orchestration/resource-tier-registry";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../ui/select";

type TierSelectorProps = {
  value?: string;
  onChange: (tierId: string) => void;
  showLabel?: boolean;
  compact?: boolean;
};

export const TierSelector = ({
  value = "dev.small",
  onChange,
  showLabel = true,
  compact = false,
}: TierSelectorProps) => {
  const selectedTier = RESOURCE_TIERS[value] || RESOURCE_TIERS["dev.small"];

  if (compact) {
    return (
      <div className="flex flex-col gap-1">
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-fit-content !h-auto text-md p-0 border-none shadow-none bg-transparent gap-1 hover:bg-transparent focus:ring-0 focus:ring-offset-0 [&>svg]:text-lg">
            <span className="mr-2">
              <span className="text-xl font-bold">${selectedTier.price}</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </span>
          </SelectTrigger>
          <SelectContent>
            {Object.values(RESOURCE_TIERS).map((tier) => (
              <SelectItem key={tier.id} value={tier.id}>
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex gap-1 w-full justify-between">
                    <div className="text-sm font-semibold">
                      ${tier.price}/month
                    </div>
                    <div className="font-mono">{tier.name}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {tier.cpu} vCPU • {tier.memory} GB RAM • {tier.storage} GB
                    Disk
                    {tier.cpu > 0.6 && <span>&nbsp;</span>}
                  </div>
                </div>
              </SelectItem>
            ))}
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
      <SelectTrigger className="w-full">
        <div className="flex items-center justify-between w-full">
          <span className="font-mono">{selectedTier.name}</span>
          <span className="font-semibold">${selectedTier.price}/month</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {Object.values(RESOURCE_TIERS).map((tier) => (
          <SelectItem key={tier.id} value={tier.id}>
            <div className="flex flex-col gap-1 w-full">
              <div className="flex gap-1 w-full justify-between">
                <div className="font-mono">{tier.name}</div>
                <div className="text-sm font-semibold">${tier.price}/month</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {tier.cpu} vCPU • {tier.memory} GB RAM • {tier.storage} GB Disk
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

