"use client";

import { bundles } from "../../config/bundles";
import { Badge } from "../ui/badge";

interface BundleSelectorProps {
  selectedBundle?: string;
  onBundleChange: (bundleId: string) => void;
  showPricing?: boolean;
}

export const BundleSelector = ({
  selectedBundle,
  onBundleChange,
  showPricing = true,
}: BundleSelectorProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {bundles.map((bundle) => {
        const Icon = bundle.icon;
        const isSelected = selectedBundle === bundle.id;

        return (
          <button
            key={bundle.id}
            type="button"
            className={`w-full text-left relative p-4 border-2 rounded-lg cursor-pointer transition-colors ${
              isSelected
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
            onClick={() => onBundleChange(bundle.id)}
          >
            {bundle.popular && (
              <Badge className="absolute -top-2 -right-2 bg-orange-500">
                Popular
              </Badge>
            )}

            <div className="flex items-start space-x-3">
              <Icon className="h-6 w-6 text-blue-600 mt-1" />
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{bundle.name}</h3>
                <p className="text-sm text-gray-600 mt-1 mb-2">
                  {bundle.description}
                </p>

                {showPricing && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Resources:</span>
                      <span className="font-medium">
                        {bundle.cpuCores} vCPU, {bundle.memoryGb}GB RAM
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Storage:</span>
                      <span className="font-medium">
                        {bundle.storageGb}GB SSD
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Includes:</p>
                  <div className="flex flex-wrap gap-1">
                    {bundle.services.map((service) => (
                      <Badge
                        key={service}
                        variant="secondary"
                        className="text-xs"
                      >
                        {service}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

