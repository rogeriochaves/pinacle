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

type ResetPasswordEmailProps = {
  name: string;
  resetUrl: string;
  locale?: string;
  translations?: {
    preview: string;
    title: string;
    greeting: string;
    body1: string;
    body2: string;
    button: string;
    footer: string;
  };
};

export const ResetPasswordEmail = ({
  name,
  resetUrl,
  locale = "en",
  translations,
}: ResetPasswordEmailProps) => {
  const baseUrl = resetUrl.split("/auth")[0];

  // Default English translations
  const t = translations || {
    preview: "Reset your Pinacle password",
    title: "password reset requested",
    greeting: `Hey ${name},`,
    body1: "Someone requested a password reset for your account. If this was you, click the button below.",
    body2: "If you didn't request this, ignore this email. The link expires in 1 hour.",
    button: "Reset Password",
    footer: "– Pinacle",
  };

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{t.preview}</Preview>
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

          <Heading style={emailStyles.h1}>{t.title}</Heading>

          <Text style={emailStyles.text}>{t.greeting.replace("{name}", name)}</Text>

          <Text style={emailStyles.text}>
            {t.body1}
          </Text>

          <Text style={emailStyles.text}>
            {t.body2}
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={resetUrl}>
              {t.button}
            </Button>
          </Section>

          <Text style={emailStyles.footer}>{t.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
};

ResetPasswordEmail.PreviewProps = {
  name: "Alex",
  resetUrl: "http://localhost:3000/auth/reset-password?token=abc123",
} as ResetPasswordEmailProps;

export default ResetPasswordEmail;

