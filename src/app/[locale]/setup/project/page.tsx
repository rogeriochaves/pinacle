import { Suspense } from "react";
import { LoadingFallback } from "@/components/loading-fallback";
import SetupForm from "@/components/setup/setup-form";

const ProjectSelectionPage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SetupForm />
    </Suspense>
  );
};

export default ProjectSelectionPage;
