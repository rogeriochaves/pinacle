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
};

export const ResetPasswordEmail = ({
  name,
  resetUrl,
}: ResetPasswordEmailProps) => {
  const baseUrl = resetUrl.split("/auth")[0];

  return (
    <Html>
      <Head />
      <Preview>Reset your Pinacle password</Preview>
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

          <Heading style={emailStyles.h1}>password reset requested</Heading>

          <Text style={emailStyles.text}>Hey {name},</Text>

          <Text style={emailStyles.text}>
            Someone requested a password reset for your account. If this was
            you, click the button below.
          </Text>

          <Text style={emailStyles.text}>
            If you didn't request this, ignore this email. The link expires in
            1 hour.
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={resetUrl}>
              Reset Password
            </Button>
          </Section>

          <Text style={emailStyles.footer}>– Pinacle</Text>
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

