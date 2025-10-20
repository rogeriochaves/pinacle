import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { emailStyles } from "./styles";

type WelcomeEmailProps = {
  name: string;
  dashboardUrl: string;
};

export const WelcomeEmail = ({ name, dashboardUrl }: WelcomeEmailProps) => {
  const baseUrl = dashboardUrl.replace("/dashboard", "");

  return (
    <Html>
      <Head />
      <Preview>Your dev box is ready. Spin up your first pod.</Preview>
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
          <Heading style={emailStyles.h1}>account created</Heading>

          <Text style={emailStyles.text}>Hey {name},</Text>

          <Text style={emailStyles.text}>
            Your account is set up. Next step: create your first pod.
          </Text>

          <Text style={emailStyles.text}>
            A pod is a dev machine just for you. Comes ready with VS Code, a
            coding assistant (Claude Code, Cursor CLI, Codex, etc), and all the tools you
            need for modern software development.
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={dashboardUrl}>
              Create First Pod
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.h2}>What you need to know:</Text>

          <Text style={emailStyles.listItem}>
            <strong>Pay for what you use</strong> – You're billed while your
            machine is running. Stop it anytime.
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>It's yours</strong> – Install whatever you need. No
            restrictions.
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>Persistent state</strong> – Your pod keeps running. Close
            your laptop, your work continues.
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>Share access</strong> – Invite teammates to work on the same
            machine.
          </Text>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>Questions? Reply to this email.</Text>

          <Text style={emailStyles.footer}>– Pinacle</Text>
        </Container>
      </Body>
    </Html>
  );
};

WelcomeEmail.PreviewProps = {
  name: "Alex",
  dashboardUrl: "http://localhost:3000/dashboard",
} as WelcomeEmailProps;

export default WelcomeEmail;
