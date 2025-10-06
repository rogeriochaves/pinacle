"use client";

import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

type EnvVar = {
  key: string;
  value: string;
  isSecret: boolean;
};

type EnvironmentVariablesProps = {
  envVars: EnvVar[];
  showSecrets: Record<number, boolean>;
  requiredCount: number;
  onUpdate: (
    index: number,
    field: keyof EnvVar,
    value: string | boolean,
  ) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onToggleSecret: (index: number) => void;
};

export const EnvironmentVariables = ({
  envVars,
  showSecrets,
  requiredCount,
  onUpdate,
  onRemove,
  onAdd,
  onToggleSecret,
}: EnvironmentVariablesProps) => {
  return (
    <div>
      <Label className="text-xs font-mono font-medium text-slate-600 mb-3 block">
        ENVIRONMENT VARIABLES
        {requiredCount > 0 && (
          <span className="text-orange-600 ml-2">
            ({requiredCount} required)
          </span>
        )}
      </Label>

      <div className="space-y-2">
        {envVars.map((envVar, index) => (
          <div
            key={`env-${index}-${envVar.key}`}
            className="flex items-start gap-2 p-3 bg-white rounded-lg border border-gray-200"
          >
            <div className="flex-1 space-y-2">
              <Input
                placeholder="VARIABLE_NAME"
                value={envVar.key}
                onChange={(e) => onUpdate(index, "key", e.target.value)}
                className="font-mono text-xs h-8"
              />
              <div className="relative">
                <Input
                  type={
                    envVar.isSecret && !showSecrets[index] ? "password" : "text"
                  }
                  placeholder="value"
                  value={envVar.value}
                  onChange={(e) => onUpdate(index, "value", e.target.value)}
                  className="font-mono text-xs h-8 pr-8"
                />
                {envVar.isSecret && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                    onClick={() => onToggleSecret(index)}
                  >
                    {showSecrets[index] ? (
                      <EyeOff className="h-3 w-3 text-slate-500" />
                    ) : (
                      <Eye className="h-3 w-3 text-slate-500" />
                    )}
                  </Button>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(index)}
              className="h-6 w-6 p-0 shrink-0"
            >
              <Trash2 className="h-3 w-3 text-red-500" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="ghost"
          onClick={onAdd}
          className="w-full font-mono text-xs h-9 border-1 border-slate-200"
        >
          <Plus className="mr-2 h-3 w-3" /> Add Variable
        </Button>
      </div>
    </div>
  );
};
