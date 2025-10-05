import { z } from "zod";

export type SetupType = "repository" | "new";

export const setupFormSchema = z.object({
  setupType: z.enum(["repository", "new"]),
  selectedRepo: z.string().optional(),
  selectedOrg: z.string().optional(),
  newRepoName: z.string().optional(),
  podName: z.string().min(1, "Pod name is required"),
  bundle: z.string().min(1, "Bundle selection is required"),
  tier: z
    .enum(["dev.small", "dev.medium", "dev.large", "dev.xlarge"])
    .optional(),
  agent: z.string().optional(),
  envVars: z.record(z.string(), z.string()),
});

export type SetupFormValues = z.infer<typeof setupFormSchema>;

export type SetupFormData = {
  // Step 1: Project Selection
  setupType: SetupType;
  selectedRepo?: string;
  selectedOrg?: string;
  newRepoName?: string;
  selectedBundle?: string;

  // Step 2: Configuration
  podName: string;
  bundle: string;
  envVars: Record<string, string>;
};

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  stargazers_count: number;
  updated_at: string | null;
  default_branch: string;
  language: string | null;
  owner: {
    login: string;
    avatar_url: string;
  };
};

export type GitHubOrg = {
  id: number;
  login: string;
  avatar_url: string;
  description: string | null;
};
