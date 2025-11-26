"use client";

import { useTranslations } from "next-intl";
import type { DotenvValidationResult } from "../../lib/dotenv";
import { DotenvEditor } from "../ui/dotenv-editor";

type EnvironmentVariablesProps = {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (result: DotenvValidationResult) => void;
  defaultValue?: string;
};

export const EnvironmentVariables = ({
  value,
  onChange,
  onValidationChange,
  defaultValue,
}: EnvironmentVariablesProps) => {
  const t = useTranslations("setup");

  return (
    <DotenvEditor
      value={value}
      onChange={onChange}
      onValidationChange={onValidationChange}
      defaultValue={defaultValue}
      label={t("environmentVariables")}
      variant="light"
      minHeight="200px"
      helpText={t("envSetupHelp")}
    />
  );
};
