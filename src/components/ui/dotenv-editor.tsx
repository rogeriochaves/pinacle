"use client";

import { AlertCircle, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import Editor from "react-simple-code-editor";
import {
  type DotenvValidationResult,
  isValidEnvVarName,
  validateDotenv,
} from "../../lib/dotenv";
import { Button } from "./button";
import { Label } from "./label";

// Custom dotenv syntax highlighting with error detection
const highlightDotenv = (
  code: string,
  isDark: boolean,
  errorLines: Set<number>,
): string => {
  return code
    .split("\n")
    .map((line, index) => {
      const lineNumber = index + 1;
      const hasError = errorLines.has(lineNumber);
      const trimmed = line.trim();

      // Error styling
      if (hasError) {
        const errorBg = isDark ? "bg-red-900/30" : "bg-red-100";
        const errorText = isDark ? "text-red-400" : "text-red-600";
        return `<span class="${errorBg} ${errorText} block -mx-4 px-4">${escapeHtml(line)}</span>`;
      }

      // Comments
      if (trimmed.startsWith("#")) {
        return `<span class="${isDark ? "text-neutral-500" : "text-slate-400"} italic">${escapeHtml(line)}</span>`;
      }

      // KEY=value pairs
      const equalsIndex = line.indexOf("=");
      if (equalsIndex > 0) {
        const key = line.substring(0, equalsIndex);
        const value = line.substring(equalsIndex + 1);

        // Check if key is valid
        const keyTrimmed = key.trim();
        const isKeyValid = isValidEnvVarName(keyTrimmed);

        const keyClass = isKeyValid
          ? isDark
            ? "text-orange-400"
            : "text-orange-600"
          : isDark
            ? "text-red-400"
            : "text-red-600";
        const operatorClass = isDark ? "text-neutral-400" : "text-slate-500";
        const valueClass = isDark ? "text-emerald-400" : "text-emerald-600";

        return `<span class="${keyClass} font-medium">${escapeHtml(key)}</span><span class="${operatorClass}">=</span><span class="${valueClass}">${escapeHtml(value)}</span>`;
      }

      // Empty lines
      if (trimmed === "") {
        return escapeHtml(line);
      }

      // Invalid lines (no = sign, not a comment)
      const errorText = isDark ? "text-red-400" : "text-red-600";
      return `<span class="${errorText}">${escapeHtml(line)}</span>`;
    })
    .join("\n");
};

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

type DotenvEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (result: DotenvValidationResult) => void;
  onEnvVarCountChange?: (count: number) => void;
  onEditRequest?: () => void; // Called when user clicks on a readOnly editor
  defaultValue?: string;
  label?: string;
  showLabel?: boolean;
  controlsPosition?: "header" | "footer" | "none";
  minHeight?: string;
  variant?: "light" | "dark";
  disabled?: boolean;
  readOnly?: boolean;
  helpText?: string;
};

export const DotenvEditor = ({
  value,
  onChange,
  onValidationChange,
  onEnvVarCountChange,
  onEditRequest,
  defaultValue,
  label,
  showLabel = true,
  controlsPosition = "header",
  minHeight = "200px",
  variant = "light",
  disabled = false,
  readOnly = false,
  helpText,
}: DotenvEditorProps) => {
  const t = useTranslations("setup");
  const [showContent, setShowContent] = useState(true);

  // Validate content and get error lines
  const validation = useMemo(() => {
    const result = validateDotenv(value);
    return result;
  }, [value]);

  // Notify parent of validation changes
  useMemo(() => {
    onValidationChange?.(validation);
  }, [validation, onValidationChange]);

  const errorLines = useMemo(() => {
    return new Set(validation.errors.map((e) => e.line));
  }, [validation.errors]);

  const countEnvVars = (content: string): number => {
    if (!content) return 0;
    return content.split("\n").filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("#") && trimmed.includes("=");
    }).length;
  };

  const envVarCount = countEnvVars(value);

  // Notify parent of count changes
  useMemo(() => {
    onEnvVarCountChange?.(envVarCount);
  }, [envVarCount, onEnvVarCountChange]);

  const handleReset = () => {
    if (defaultValue) {
      onChange(defaultValue);
    }
  };

  const maskedValue = value.replace(/=.*/g, "=••••••");

  const isDark = variant === "dark";

  return (
    <div className="flex flex-col h-full">
      {showLabel && (
        <div className="flex items-center justify-between mb-3">
          <Label
            className={`text-xs font-mono font-medium ${isDark ? "text-neutral-400" : "text-slate-600"}`}
          >
            {label || t("environmentVariables")}
            {controlsPosition === "header" && envVarCount > 0 && (
              <span
                className={
                  isDark ? "text-neutral-500 ml-2" : "text-slate-400 ml-2"
                }
              >
                ({envVarCount}{" "}
                {envVarCount === 1 ? t("variable") : t("variables")})
              </span>
            )}
          </Label>
          {controlsPosition === "header" && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowContent(!showContent)}
                className={`h-7 px-2 text-xs font-mono ${isDark ? "text-neutral-300 hover:text-white" : ""}`}
              >
                {showContent ? (
                  <>
                    <EyeOff className="h-3 w-3 mr-1" />
                    {t("hide")}
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3 mr-1" />
                    {t("show")}
                  </>
                )}
              </Button>
              {defaultValue && value !== defaultValue && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="h-7 px-2 text-xs font-mono text-orange-600 hover:text-orange-700"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  {t("resetToDefault")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="relative flex-1">
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: click to edit is intentional UX */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: click to edit is intentional UX */}
        <div
          className={`w-full h-full border rounded-lg overflow-hidden ${
            isDark
              ? `bg-neutral-800 ${!validation.valid ? "border-red-500/50" : "border-neutral-700"}`
              : `bg-white ${!validation.valid ? "border-red-300" : "border-slate-200"}`
          } ${disabled ? "opacity-50" : ""} ${readOnly && onEditRequest ? "cursor-pointer" : ""}`}
          style={{ minHeight }}
          onClick={() => {
            if (readOnly && onEditRequest) {
              onEditRequest();
            }
          }}
        >
          <Editor
            value={showContent ? value : maskedValue}
            onValueChange={(code) => {
              if (showContent && !disabled && !readOnly) {
                onChange(code);
              }
            }}
            highlight={(code) => highlightDotenv(code, isDark, errorLines)}
            padding={16}
            readOnly={!showContent || disabled || readOnly}
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "0.875rem",
              lineHeight: "1.6",
              minHeight,
              backgroundColor: "transparent",
              // wordBreak: "break-all",
              // whiteSpace: "pre-wrap",
              overflowWrap: "break-word",
            }}
            className={`focus-within:ring-2 focus-within:ring-orange-500 focus-within:ring-inset rounded-lg ${
              !showContent ? "cursor-default select-none" : ""
            }`}
            textareaClassName={`focus:outline-none ${
              isDark ? "caret-white" : "caret-slate-900"
            } editor-break-all`}
            preClassName="editor-break-all"
          />
        </div>
        {!showContent && (
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-lg border border-neutral-200 ${
              isDark ? "bg-neutral-800/80" : "bg-slate-50/80"
            }`}
            onClick={() => setShowContent(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setShowContent(true);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <p
              className={`text-sm font-mono ${isDark ? "text-neutral-400" : "text-slate-500"}`}
            >
              {t("clickShowToEdit")}
            </p>
          </div>
        )}
      </div>

      {/* Validation errors */}
      {!validation.valid && showContent && (
        <div
          className={`flex items-start gap-2 mt-2 p-2 rounded-md ${
            isDark ? "bg-red-900/20 text-red-400" : "bg-red-50 text-red-600"
          }`}
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="text-xs font-mono">
            {validation.errors.length === 1 ? (
              <p>
                Line {validation.errors[0].line}: {validation.errors[0].message}
              </p>
            ) : (
              <>
                <p className="font-medium mb-1">
                  {validation.errors.length} {t("validationErrors")}:
                </p>
                <ul className="space-y-0.5">
                  {validation.errors.slice(0, 3).map((error) => (
                    <li key={error.line}>
                      Line {error.line}: {error.message}
                    </li>
                  ))}
                  {validation.errors.length > 3 && (
                    <li>...and {validation.errors.length - 3} more</li>
                  )}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer with help text and optional controls */}
      {(validation.valid || !showContent) && (
        <div className="flex items-center justify-between mt-2">
          <p
            className={`text-xs font-mono ${isDark ? "text-neutral-500" : "text-slate-500"}`}
          >
            {helpText || t("dotenvHelp")}
          </p>
          {controlsPosition === "footer" && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowContent(!showContent)}
                className={`h-7 px-2 text-xs font-mono ${isDark ? "text-neutral-300 hover:text-white" : ""}`}
              >
                {showContent ? (
                  <>
                    <EyeOff className="h-3 w-3 mr-1" />
                    {t("hide")}
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3 mr-1" />
                    {t("show")}
                  </>
                )}
              </Button>
              {defaultValue && value !== defaultValue && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  className="h-7 px-2 text-xs font-mono text-orange-600 hover:text-orange-700"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  {t("resetToDefault")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
