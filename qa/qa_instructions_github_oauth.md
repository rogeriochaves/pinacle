# QA Instructions: GitHub OAuth Testing

## Objective
Test the GitHub OAuth authentication flow in the Pinacle application to ensure users can sign in with their GitHub accounts.

## Test Steps

### 1. Navigate to Application
1. Open a web browser
2. Go to `http://localhost:3000`
3. Verify the landing page loads correctly

### 2. Access Sign In Page
1. Click on "Sign In" button or link from the landing page
2. Verify you are redirected to `/auth/signin`
3. Confirm the sign-in page displays both:
   - "SIGN IN WITH GITHUB" button (with GitHub icon)
   - Email/password form below it

### 3. Test GitHub OAuth Flow
1. Click the "SIGN IN WITH GITHUB" button
2. **Expected behavior:**
   - Should redirect to GitHub's OAuth authorization page
   - GitHub should show the OAuth consent screen
   - The consent screen should show the Pinacle application requesting access
3. **On GitHub OAuth page:**
   - Click "Authorize" to grant permission
   - Should redirect back to the application

### 4. Verify Successful Authentication
1. After GitHub authorization, should be redirected to `/dashboard`
2. Verify the dashboard loads successfully
3. Check that user information is displayed (name, avatar if available)
4. Verify the user can access dashboard features like:
   - Viewing pods
   - Creating new pods
   - Accessing teams

### 5. Test Session Persistence
1. Refresh the browser page
2. Verify user remains logged in
3. Navigate to different pages within the dashboard
4. Confirm authentication persists across page navigation

### 6. Test Sign Out (if available)
1. Look for a sign out option in the dashboard
2. Click sign out
3. Verify user is logged out and redirected appropriately
4. Try accessing `/dashboard` directly - should redirect to sign in

## Expected Results

### Success Criteria
- ✅ GitHub OAuth button is visible and clickable
- ✅ Clicking GitHub button redirects to GitHub OAuth
- ✅ GitHub shows proper OAuth consent screen for Pinacle
- ✅ Authorizing on GitHub redirects back to application
- ✅ User is successfully authenticated and redirected to dashboard
- ✅ Dashboard displays user information from GitHub (name, avatar)
- ✅ Session persists across page refreshes and navigation
- ✅ User can access all authenticated features

### Potential Issues to Report
- ❌ GitHub button doesn't work or shows errors
- ❌ OAuth redirect fails or shows error pages
- ❌ GitHub doesn't show proper consent screen
- ❌ Authorization doesn't redirect back to app
- ❌ User isn't properly authenticated after OAuth
- ❌ Dashboard doesn't load or shows errors
- ❌ Session doesn't persist
- ❌ User information isn't displayed correctly

## Additional Notes
- If any step fails, note the exact error message
- Take screenshots of any error pages
- Check browser console for JavaScript errors
- Verify network requests in browser dev tools if needed
- Test with a fresh incognito/private browser session

## Environment Details
- Application URL: http://localhost:3000
- Sign In URL: http://localhost:3000/auth/signin
- Expected Dashboard URL: http://localhost:3000/dashboard
- GitHub OAuth should handle the external redirect flow
