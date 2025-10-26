import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      githubAccessToken?: string;
      githubId?: string;
    };
    error?: string; // Error flag for expired tokens
  }

  interface User {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    githubAccessToken?: string;
    githubId?: string;
    githubAccessTokenExpires?: number; // Timestamp when token expires
    error?: string; // Error flag for token refresh failures
  }
}
