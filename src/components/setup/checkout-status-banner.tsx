"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

type CheckoutStatusBannerProps = {
  status: "success" | "cancel" | null;
  isVerifying?: boolean;
};

export const CheckoutStatusBanner = ({
  status,
  isVerifying = false,
}: CheckoutStatusBannerProps) => {
  if (!status) return null;

  if (status === "success") {
    return (
      <div className="bg-green-50 border-b border-green-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="flex-shrink-0">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800 font-mono">
              {isVerifying
                ? "Verifying payment..."
                : "Payment successful! Your subscription is now active."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "cancel") {
    return (
      <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800 font-mono">
              Checkout cancelled. You need an active subscription to create
              pods.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
