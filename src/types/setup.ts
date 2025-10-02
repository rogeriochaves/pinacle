export type SetupType = "repository" | "new";

export type Bundle = {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  tier: "dev.small" | "dev.medium" | "dev.large" | "dev.xlarge";
  cpuCores: number;
  memoryGb: number;
  storageGb: number;
  pricePerMonth: number;
  template: string;
  services: string[];
  requiredEnvVars: string[];
  popular?: boolean;
};

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
  updated_at: string;
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
