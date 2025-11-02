import { Suspense } from "react";
import { LoadingFallback } from "../../../components/loading-fallback";
import PageContent from "./page-content";

export default function Page() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <PageContent />
    </Suspense>
  );
}
