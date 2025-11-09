# GitHub App Setup Guide

This guide explains how to set up a GitHub App for Pinacle to enable full organization access and repository management.

## Why GitHub App?

While OAuth Apps can access user repositories, they have limitations:
- Limited organization access (requires explicit approval)
- Cannot create repositories in organizations easily
- Less granular permissions

GitHub Apps provide:
- Full organization access when installed
- Ability to create repositories in any installed organization
- More granular permissions
- Better security model

## Creating a GitHub App

### 1. Create the App

1. Go to your GitHub organization settings (or personal account settings)
2. Navigate to "Developer settings" → "GitHub Apps"
3. Click "New GitHub App"

### 2. App Configuration

**Basic Information:**
- **GitHub App name**: `pinacle-dev` (or your preferred name)
- **Description**: `Development environment management for your repositories`
- **Homepage URL**: `https://your-domain.com` (or `http://localhost:3000` for development)

**Callback URLs:**
- **User authorization callback URL**: `http://localhost:3000/api/auth/callback/github` (for NextAuth OAuth)
- **Setup URL (IMPORTANT)**: `http://localhost:3000/api/github/callback` (for GitHub App installation - this is where users are redirected after installing your app)

**Webhook:**
- **Webhook URL**: `http://localhost:3000/api/webhooks/github` (optional for MVP)
- **Webhook secret**: Generate a random string (optional for MVP)

### 3. Permissions

**Repository permissions:**
- **Contents**: Read & Write (to clone and modify repositories)
- **Metadata**: Read (to access repository information)
- **Pull requests**: Read & Write (for future PR integration)
- **Issues**: Read & Write (for future issue integration)

**Organization permissions:**
- **Members**: Read (to see organization members)
- **Administration**: Read (to see organization details)

**Account permissions:**
- **Email addresses**: Read (to get user email)

### 4. Subscribe to Events (Optional for MVP)

For future features, you might want to subscribe to:
- Repository events
- Push events
- Pull request events

### 5. Installation Settings

- **Where can this GitHub App be installed?**:
  - Choose "Any account" for public use
  - Choose "Only on this account" for private/development use

## Getting Your App Credentials

After creating the app, you'll need these values for your `.env` file:

### 1. App ID
- Found on your GitHub App's settings page
- Copy the "App ID" number

### 2. Private Key
- On your GitHub App's settings page, scroll down to "Private keys"
- Click "Generate a private key"
- Download the `.pem` file
- Copy the entire contents (including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----`)

### 3. App Slug
- This is the URL-friendly name of your app
- Found in the URL: `https://github.com/apps/YOUR-APP-SLUG`

## Environment Variables

Add these to your `.env` file:

```bash
# GitHub App (Required for organization access)
GITHUB_APP_ID="123456"
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA1234567890...
your-private-key-content-here...
-----END RSA PRIVATE KEY-----"
GITHUB_APP_SLUG="pinacle-dev"
```

**Important Notes:**
- The private key must include the `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` lines
- If storing in a `.env` file, you can use `\n` for line breaks, or use a multi-line string
- Keep the private key secure and never commit it to version control

## Installation Flow

### How It Works

1. **User Authentication**: User signs in with GitHub OAuth (basic permissions)
2. **App Installation**: When user needs organization access, they're redirected to install the GitHub App
3. **Permission Grant**: User grants the app access to specific repositories or all repositories in their organizations
4. **Callback Handling**: App processes the installation and stores the installation ID
5. **Repository Access**: App can now access repositories and create new ones in installed organizations

### User Experience

1. User clicks "Open Repository" or "New Project"
2. If not authenticated, they sign in with GitHub
3. If they need organization access, they see "Install GitHub App" button
4. They're redirected to GitHub to install the app
5. After installation, they're redirected back to continue the setup flow
6. They can now see all repositories and organizations where the app is installed

## Development Setup

### 1. Install Dependencies

```bash
pnpm add @octokit/app @octokit/rest jsonwebtoken @types/jsonwebtoken
```

### 2. Database Migration

The GitHub App integration requires new database tables:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit push
```

### 3. Test the Integration

1. Start your development server: `pnpm dev`
2. Go to `http://localhost:3000/setup?type=new`
3. Sign in with GitHub
4. Try to create a new project - you should see the "Install GitHub App" option
5. Install the app and verify you can see organization repositories

## Production Deployment

### 1. Update URLs

When deploying to production, update your GitHub App settings:

- **Homepage URL**: `https://your-production-domain.com`
- **User authorization callback URL**: `https://your-production-domain.com/api/auth/callback/github`
- **Setup URL**: `https://your-production-domain.com/api/github/callback`

### 2. Environment Variables

Ensure all environment variables are set in your production environment:

```bash
GITHUB_APP_ID="your-app-id"
GITHUB_APP_PRIVATE_KEY="your-private-key"
GITHUB_APP_SLUG="your-app-slug"
```

### 3. Security Considerations

- Store the private key securely (use environment variables or secret management)
- Consider using webhook secrets for production
- Regularly rotate your private keys
- Monitor app installations and permissions

## Troubleshooting

### Common Issues

**"GitHub App not configured" error:**
- Check that `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_APP_SLUG` are set
- Verify the private key format includes the BEGIN/END lines

**"Installation not found" error:**
- User needs to install the GitHub App first
- Check that the installation callback is working correctly

**"Permission denied" errors:**
- Verify the app has the correct permissions configured
- Check that the app is installed on the target organization/repository

**Organizations not showing up:**
- Ensure the app is installed on the organization
- Check that the user has admin rights in the organization
- Verify the app has "Members: Read" permission

### Debugging

Enable debug logging by adding to your `.env`:

```bash
DEBUG="octokit:*"
```

This will show all GitHub API requests and responses in your console.
