import { Suspense } from "react";
import { LoadingFallback } from "@/components/loading-fallback";
import InstallPageContent from "./install-page-content";

export default function InstallPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <InstallPageContent />
    </Suspense>
  );
}
