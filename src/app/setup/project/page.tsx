import { Suspense } from "react";
import SetupForm from "../../../components/setup/setup-form";

const ProjectSelectionPage = () => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SetupForm />
    </Suspense>
  );
};

export default ProjectSelectionPage;
