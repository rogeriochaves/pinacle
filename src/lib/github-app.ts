import { App } from "@octokit/app";
import { env } from "../env";

let appInstance: App | null = null;

export const getGitHubApp = (): App => {
  if (!appInstance) {
    if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
      throw new Error("GitHub App credentials not configured");
    }

    appInstance = new App({
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
    });
  }

  return appInstance;
};

export const getInstallationOctokit = async (installationId: number) => {
  const app = getGitHubApp();
  const octokit = await app.getInstallationOctokit(installationId);

  return octokit;
};

export const getUserInstallations = async (_userId: string) => {
  const app = getGitHubApp();

  try {
    // Get all installations for the app
    const { data: installations } = await app.octokit.request(
      "GET /app/installations",
    );

    // Filter installations that the user has access to
    // This is a simplified approach - in production you'd want to store
    // the mapping between users and installations in your database
    return installations;
  } catch (error) {
    console.error("Failed to get user installations:", error);
    return [];
  }
};

export const getInstallationRepositories = async (installationId: number) => {
  try {
    const octokit = await getInstallationOctokit(installationId);

    // Fetch repos sorted by most recently updated
    // We'll fetch up to 300 repos (3 pages) to get a good selection of recent repos
    const allRepos = [];

    for (let page = 1; page <= 10; page++) {
      const { data } = await octokit.request("GET /installation/repositories", {
        per_page: 100,
        page,
      });

      allRepos.push(...(data.repositories || []));

      // Stop if we got less than 100 repos (last page)
      if ((data.repositories || []).length < 100) break;
    }

    return allRepos;
  } catch (error) {
    console.error("Failed to get installation repositories:", error);
    return [];
  }
};

export const getInstallationAccounts = async (installationId: number) => {
  try {
    const octokit = await getInstallationOctokit(installationId);

    // Get the installation details to see what account it's installed on
    const { data: installation } = await octokit.request(
      "GET /app/installations/{installation_id}",
      {
        installation_id: installationId,
      },
    );

    // Return the account where the app is installed
    // This could be a user account or an organization
    if (installation.account) {
      return [installation.account];
    }

    return [];
  } catch (error) {
    console.error("Failed to get installation account:", error);
    return [];
  }
};
