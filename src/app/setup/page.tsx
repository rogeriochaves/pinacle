import { Suspense } from "react";
import SetupPageContent from "./setup-page-content";

export default function SetupPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SetupPageContent />
    </Suspense>
  );
}
