import { Suspense } from "react";
import { LoadingFallback } from "../../../components/loading-fallback";
import SetupForm from "../../../components/setup/setup-form";

const ConfigurePage = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <SetupForm />
    </Suspense>
  );
};

export default ConfigurePage;
