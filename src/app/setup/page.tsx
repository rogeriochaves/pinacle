import { Suspense } from "react";
import { LoadingFallback } from "../../components/loading-fallback";
import SetupPageContent from "./setup-page-content";

export default function SetupPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SetupPageContent />
    </Suspense>
  );
}
