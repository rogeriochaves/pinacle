import { describe, expect, it } from "vitest";
import {
  DEFAULT_PINACLE_CONFIG,
  generatePinacleConfigFromForm,
  type PinacleConfig,
  PinacleConfigSchema,
  parsePinacleConfig,
  serializePinacleConfig,
} from "../pinacle-config";

describe("PinacleConfig Schema Validation", () => {
  it("should validate a minimal config", () => {
    const config = {
      version: "1.0" as const,
      tier: "dev.small" as const,
      services: ["claude-code"],
    };

    const result = PinacleConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe("1.0");
      expect(result.data.tier).toBe("dev.small");
      expect(result.data.services).toEqual(["claude-code"]);
    }
  });

  it("should apply defaults for missing fields", () => {
    const config = {};

    const result = PinacleConfigSchema.parse(config);
    expect(result.version).toBe("1.0");
    expect(result.tier).toBe("dev.small");
    expect(result.services).toEqual([
      "claude-code",
      "vibe-kanban",
      "code-server",
    ]);
  });

  it("should validate all tier options", () => {
    const tiers = ["dev.small", "dev.medium", "dev.large", "dev.xlarge"];

    for (const tier of tiers) {
      const config = { tier };
      const result = PinacleConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    }
  });

  it("should reject invalid tier", () => {
    const config = {
      tier: "invalid-tier",
    };

    const result = PinacleConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it("should validate a full config", () => {
    const config: PinacleConfig = {
      version: "1.0",
      template: "nextjs",
      tier: "dev.medium",
      services: ["openai-codex", "vibe-kanban", "code-server"],
    };

    const result = PinacleConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(config);
    }
  });
});

describe("YAML Serialization", () => {
  it("should serialize minimal config to YAML", () => {
    const config: PinacleConfig = {
      version: "1.0",
      tier: "dev.small",
      services: ["claude-code"],
    };

    const yaml = serializePinacleConfig(config);

    expect(yaml).toContain('version: "1.0"');
    expect(yaml).toContain("tier: dev.small");
    expect(yaml).toContain("services:");
    expect(yaml).toContain("  - claude-code");
  });

  it("should serialize full config to YAML", () => {
    const config: PinacleConfig = {
      version: "1.0",
      template: "nextjs",
      tier: "dev.medium",
      services: ["openai-codex", "vibe-kanban", "code-server"],
    };

    const yaml = serializePinacleConfig(config);

    expect(yaml).toContain("template: nextjs");
    expect(yaml).toContain("tier: dev.medium");
    expect(yaml).toContain("  - openai-codex");
    expect(yaml).toContain("  - vibe-kanban");
    expect(yaml).toContain("  - code-server");
  });

  it("should include helpful comments", () => {
    const config: PinacleConfig = DEFAULT_PINACLE_CONFIG;
    const yaml = serializePinacleConfig(config);

    expect(yaml).toContain("# Pinacle Pod Configuration");
    expect(yaml).toContain("# https://pinacle.dev/docs/pinacle-yaml");
    expect(yaml).toContain("# Available tiers:");
    expect(yaml).toContain("# Available services:");
  });
});

describe("YAML Parsing", () => {
  it("should parse minimal YAML", () => {
    const yaml = `
version: "1.0"
tier: dev.small
services:
  - claude-code
`;

    const config = parsePinacleConfig(yaml);

    expect(config.version).toBe("1.0");
    expect(config.tier).toBe("dev.small");
    expect(config.services).toEqual(["claude-code"]);
  });

  it("should parse YAML with comments", () => {
    const yaml = `
# This is a comment
version: "1.0"

# Another comment
tier: dev.medium

# Services list
services:
  - openai-codex
  - vibe-kanban
`;

    const config = parsePinacleConfig(yaml);

    expect(config.version).toBe("1.0");
    expect(config.tier).toBe("dev.medium");
    expect(config.services).toEqual(["openai-codex", "vibe-kanban"]);
  });

  it("should parse full YAML with all fields", () => {
    const yaml = `
version: "1.0"
name: "my-awesome-project"
template: "nextjs"
tier: dev.large
services:
  - cursor-cli
  - vibe-kanban
  - code-server
  - web-terminal
`;

    const config = parsePinacleConfig(yaml);

    expect(config.version).toBe("1.0");
    expect(config.template).toBe("nextjs");
    expect(config.tier).toBe("dev.large");
    expect(config.services).toEqual([
      "cursor-cli",
      "vibe-kanban",
      "code-server",
      "web-terminal",
    ]);
  });

  it("should parse YAML without quotes on values", () => {
    const yaml = `
version: 1.0
tier: dev.small
services:
  - claude-code
`;

    const config = parsePinacleConfig(yaml);

    expect(config.version).toBe("1.0");
    expect(config.tier).toBe("dev.small");
  });

  it("should throw error on invalid YAML structure", () => {
    const yaml = `
version: "2.0"
tier: invalid-tier
`;

    expect(() => parsePinacleConfig(yaml)).toThrow();
  });

  it("should apply defaults for missing optional fields", () => {
    const yaml = `
tier: dev.medium
services:
  - claude-code
`;

    const config = parsePinacleConfig(yaml);

    expect(config.version).toBe("1.0");
    expect(config.tier).toBe("dev.medium");
    expect(config.template).toBeUndefined();
  });
});

describe("Round-trip: Serialize -> Parse", () => {
  it("should maintain config through round-trip", () => {
    const original: PinacleConfig = {
      version: "1.0",
      template: "vite",
      tier: "dev.xlarge",
      services: ["gemini-cli", "code-server"],
    };

    const yaml = serializePinacleConfig(original);
    const parsed = parsePinacleConfig(yaml);

    expect(parsed).toEqual(original);
  });

  it("should handle minimal config round-trip", () => {
    const original: PinacleConfig = {
      version: "1.0",
      tier: "dev.small",
      services: ["claude-code"],
    };

    const yaml = serializePinacleConfig(original);
    const parsed = parsePinacleConfig(yaml);

    expect(parsed).toEqual(original);
  });
});

describe("Form Data Conversion", () => {
  it("should generate config from form data", () => {
    const config = generatePinacleConfigFromForm({
      template: "nextjs",
      tier: "dev.medium",
      customServices: ["claude-code", "vibe-kanban", "code-server"],
    });

    expect(config.version).toBe("1.0");
    expect(config.template).toBe("nextjs");
    expect(config.tier).toBe("dev.medium");
    expect(config.services).toEqual([
      "claude-code",
      "vibe-kanban",
      "code-server",
    ]);
  });

  it("should use defaults when form data is minimal", () => {
    const config = generatePinacleConfigFromForm({});

    expect(config.version).toBe("1.0");
    expect(config.tier).toBe("dev.small");
    expect(config.services).toEqual(DEFAULT_PINACLE_CONFIG.services);
  });

  it("should handle optional fields being undefined", () => {
    const config = generatePinacleConfigFromForm({
      tier: "dev.large",
      customServices: ["openai-codex"],
    });

    expect(config.template).toBeUndefined();
    expect(config.tier).toBe("dev.large");
    expect(config.services).toEqual(["openai-codex"]);
  });

  it("should use default services when customServices is empty", () => {
    const config = generatePinacleConfigFromForm({
      template: "python-blank",
      customServices: [],
    });

    expect(config.services).toEqual(DEFAULT_PINACLE_CONFIG.services);
  });
});

describe("Real-world Examples", () => {
  it("should handle Next.js project config", () => {
    const yaml = `
# Pinacle Pod Configuration
version: "1.0"

name: "saas-app"
template: "nextjs"
tier: dev.medium

services:
  - claude-code
  - vibe-kanban
  - code-server
`;

    const config = parsePinacleConfig(yaml);

    expect(config.template).toBe("nextjs");
    expect(config.tier).toBe("dev.medium");
    expect(config.services).toHaveLength(3);
  });

  it("should handle Python data science config", () => {
    const yaml = `
version: "1.0"
template: "python-blank"
tier: dev.xlarge
services:
  - gemini-cli
  - code-server
`;

    const config = parsePinacleConfig(yaml);

    expect(config.tier).toBe("dev.xlarge");
    expect(config.services).toContain("gemini-cli");
    expect(config.services).not.toContain("vibe-kanban");
  });

  it("should handle team collaboration config", () => {
    const yaml = `
version: "1.0"
name: "team-project"
tier: dev.medium
services:
  - cursor-cli
  - vibe-kanban
  - code-server
  - web-terminal
`;

    const config = parsePinacleConfig(yaml);

    expect(config.services).toHaveLength(4);
    expect(config.services).toContain("web-terminal");
  });
});
