"use client";

import { useTranslations } from "next-intl";
import type { DotenvValidationResult } from "../../lib/dotenv";
import { DotenvEditor } from "../ui/dotenv-editor";

type EnvironmentVariablesProps = {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (result: DotenvValidationResult) => void;
  onEnvVarCountChange?: (count: number) => void;
  defaultValue?: string;
  hideLabel?: boolean;
  controlsPosition?: "header" | "footer" | "none";
};

export const EnvironmentVariables = ({
  value,
  onChange,
  onValidationChange,
  onEnvVarCountChange,
  defaultValue,
  hideLabel,
  controlsPosition = "header",
}: EnvironmentVariablesProps) => {
  const t = useTranslations("setup");

  return (
    <DotenvEditor
      value={value}
      onChange={onChange}
      onValidationChange={onValidationChange}
      onEnvVarCountChange={onEnvVarCountChange}
      defaultValue={defaultValue}
      label={t("environmentVariables")}
      showLabel={!hideLabel}
      controlsPosition={controlsPosition}
      variant="light"
      minHeight="200px"
      helpText={t("envSetupHelp")}
    />
  );
};
