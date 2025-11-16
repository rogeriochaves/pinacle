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

type TeamInviteEmailProps = {
  invitedByName: string;
  teamName: string;
  acceptUrl: string;
};

export const TeamInviteEmail = ({
  invitedByName,
  teamName,
  acceptUrl,
}: TeamInviteEmailProps) => {
  // Extract base URL (protocol + domain) from acceptUrl
  let baseUrl: string;
  try {
    const url = new URL(acceptUrl);
    baseUrl = `${url.protocol}//${url.host}`;
  } catch {
    // Fallback if URL parsing fails
    baseUrl = acceptUrl.replace(/\/.*$/, "");
  }

  return (
    <Html>
      <Head />
      <Preview>You've been invited to join {teamName} on Pinacle</Preview>
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

          <Heading style={emailStyles.h1}>team invitation</Heading>

          <Text style={emailStyles.text}>Hi there,</Text>

          <Text style={emailStyles.text}>
            <strong>{invitedByName}</strong> has invited you to join the{" "}
            <strong>{teamName}</strong> team on Pinacle.
          </Text>

          <Text style={emailStyles.text}>
            As a team member, you'll have access to all the pods created by your
            team, and you can collaborate on development environments together.
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={acceptUrl}>
              Accept Invitation
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.h2}>What you get:</Text>

          <Text style={emailStyles.listItem}>
            <strong>Access to team pods</strong> – Work on the same dev machines
            as your teammates
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>Collaborative development</strong> – Share terminals, editors,
            and workspaces
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>Team billing</strong> – Pods are billed to the team account
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>Persistent state</strong> – Your work continues even when
            you close your laptop
          </Text>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            Questions? Reply to this email or contact {invitedByName} directly.
          </Text>

          <Text style={emailStyles.footer}>– Pinacle</Text>
        </Container>
      </Body>
    </Html>
  );
};

TeamInviteEmail.PreviewProps = {
  invitedByName: "Alex",
  teamName: "Acme Corp",
  acceptUrl: "http://localhost:3000/team-invite/accept?token=abc123",
} as TeamInviteEmailProps;

export default TeamInviteEmail;
