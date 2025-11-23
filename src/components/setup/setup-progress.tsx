"use client";

import { useTranslations } from "next-intl";

type SetupProgressProps = {
  currentStep: "project" | "configure";
  projectName?: string;
};

export const SetupProgress = ({
  currentStep,
  projectName,
}: SetupProgressProps) => {
  const t = useTranslations("setup.progress");

  return (
    <div className="bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-6">
          <div className="flex items-center gap-4">
            {/* Step 1 */}
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-mono font-bold text-sm transition-all ${
                  currentStep === "project"
                    ? "bg-orange-500 text-white ring-4 ring-orange-500/30"
                    : "bg-slate-700 text-slate-400"
                }`}
              >
                1
              </div>
              <div>
                <div
                  className={`font-mono text-sm font-medium ${
                    currentStep === "project" ? "text-white" : "text-slate-400"
                  }`}
                >
                  {t("step1")}
                </div>
              </div>
            </div>

            {/* Connector */}
            <div className="w-16 h-0.5 bg-slate-700 mx-2" />

            {/* Step 2 */}
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-mono font-bold text-sm transition-all ${
                  currentStep === "configure"
                    ? "bg-orange-500 text-white ring-4 ring-orange-500/30"
                    : "bg-slate-700 text-slate-400"
                }`}
              >
                2
              </div>
              <div>
                <div
                  className={`font-mono text-sm font-medium ${
                    currentStep === "configure"
                      ? "text-white"
                      : "text-slate-400"
                  }`}
                >
                  {t("step2")}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold font-mono text-white mb-2">
            {currentStep === "project"
              ? t("selectProject")
              : t("configurePod")}
          </h1>
          <p className="text-slate-400 font-mono text-sm">
            {currentStep === "project"
              ? t("chooseRepo")
              : projectName
                ? t("settingUpFor", { name: projectName })
                : t("customizeEnvironment")}
          </p>
        </div>
      </div>
    </div>
  );
};
