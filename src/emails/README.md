# Email Templates

This directory contains email templates built with [React Email](https://react.email/).

## Available Templates

### Welcome Email (`welcome.tsx`)

Sent to new users after they sign up. Includes:
- Welcome message
- Call-to-action button to create their first pod
- Step-by-step getting started guide
- Links to documentation and support

## Development

### Preview Emails

To preview and develop email templates locally:

```bash
pnpm email:preview
```

This will start the React Email development server at `http://localhost:3001` where you can see all email templates and test them with different props.

### Sending Emails

Emails are sent using the Resend API. The `sendWelcomeEmail` function in `/src/lib/email.ts` handles sending welcome emails.

**Environment Variables Required:**

```env
RESEND_API_KEY=re_xxxxxxxxx
NEXTAUTH_URL=http://localhost:3000  # Used to generate dashboard URLs
```

### Testing Emails

To test email sending:

1. Set up a Resend API key in your `.env` file
2. Sign up a new user through the app
3. Check your email inbox (or Resend logs if using the test API key)

**Note:** During development, if `RESEND_API_KEY` is not set, the email sending will be skipped with a warning logged to the console. User signup will still succeed.

## Creating New Email Templates

1. Create a new file in this directory (e.g., `reset-password.tsx`)
2. Import the shared styles from `./styles`:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { emailStyles } from "./styles";

type MyEmailProps = {
  name: string;
  actionUrl: string;
};

export const MyEmail = ({ name, actionUrl }: MyEmailProps) => {
  const baseUrl = actionUrl.replace(/\/[^/]*$/, "");

  return (
    <Html>
      <Head />
      <Preview>Preview text here</Preview>
      <Body style={emailStyles.main}>
        <Container style={emailStyles.container}>
          <Section style={emailStyles.header}>
            <Img
              src={`${baseUrl}/logo.png`}
              alt="Pinacle"
              width={32}
              height={32}
              style={emailStyles.logoImage}
            />
            <Text style={emailStyles.logoText}>pinacle</Text>
          </Section>

          <Heading style={emailStyles.h1}>your heading here</Heading>
          <Text style={emailStyles.text}>Hey {name},</Text>
          <Text style={emailStyles.text}>Your email content...</Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={actionUrl}>
              Action Button
            </Button>
          </Section>

          <Text style={emailStyles.footer}>– Pinacle</Text>
        </Container>
      </Body>
    </Html>
  );
};

export default MyEmail;
```

3. Add a sending function in `/src/lib/email.ts`
4. Use the function in your backend code

### Available Shared Styles

All styles are in `styles.ts`:
- `emailStyles.main` - Light background body
- `emailStyles.container` - White bordered box
- `emailStyles.header` - Dark header with logo
- `emailStyles.h1` - Main heading
- `emailStyles.h2` - Section heading
- `emailStyles.text` - Body text
- `emailStyles.listItem` - List items
- `emailStyles.button` - Orange button with shadow
- `emailStyles.buttonContainer` - Button wrapper
- `emailStyles.hr` - Horizontal divider
- `emailStyles.footer` - Footer text

## Resend Configuration

Currently configured to send from: `Pinacle <onboarding@resend.dev>`

**For Production:**
1. Verify your domain in Resend dashboard
2. Update the `from` address in `/src/lib/email.ts` to use your domain
3. Add SPF, DKIM, and DMARC records as instructed by Resend

Example production sender:
```typescript
from: "Pinacle <welcome@pinacle.dev>"
```

## Resources

- [React Email Documentation](https://react.email/docs/introduction)
- [Resend Documentation](https://resend.com/docs)
- [React Email Components](https://react.email/docs/components/html)

