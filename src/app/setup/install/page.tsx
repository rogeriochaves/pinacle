import { Suspense } from "react";
import InstallPageContent from "./install-page-content";

export default function InstallPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InstallPageContent />
    </Suspense>
  );
}
