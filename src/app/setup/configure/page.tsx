import { Suspense } from "react";
import SetupForm from "../../../components/setup/setup-form";

const ConfigurePage = () => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SetupForm />
    </Suspense>
  );
};

export default ConfigurePage;
