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
  locale?: string;
  translations?: {
    preview: string;
    title: string;
    greeting: string;
    body1: string;
    body2: string;
    button: string;
    whatYouGet: string;
    accessTeamPods: string;
    accessTeamPodsDesc: string;
    collaborative: string;
    collaborativeDesc: string;
    teamBilling: string;
    teamBillingDesc: string;
    persistentState: string;
    persistentStateDesc: string;
    questionsContact: string;
    footer: string;
  };
};

export const TeamInviteEmail = ({
  invitedByName,
  teamName,
  acceptUrl,
  locale = "en",
  translations,
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

  // Default English translations
  const t = translations || {
    preview: `You've been invited to join ${teamName} on Pinacle`,
    title: "team invitation",
    greeting: "Hi there,",
    body1: `${invitedByName} has invited you to join the ${teamName} team on Pinacle.`,
    body2: "As a team member, you'll have access to all the pods created by your team, and you can collaborate on development environments together.",
    button: "Accept Invitation",
    whatYouGet: "What you get:",
    accessTeamPods: "Access to team pods",
    accessTeamPodsDesc: "Work on the same dev machines as your teammates",
    collaborative: "Collaborative development",
    collaborativeDesc: "Share terminals, editors, and workspaces",
    teamBilling: "Team billing",
    teamBillingDesc: "Pods are billed to the team account",
    persistentState: "Persistent state",
    persistentStateDesc: "Your work continues even when you close your laptop",
    questionsContact: `Questions? Reply to this email or contact ${invitedByName} directly.`,
    footer: "– Pinacle",
  };

  return (
    <Html lang={locale}>
      <Head />
      <Preview>{t.preview.replace("{teamName}", teamName)}</Preview>
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

          <Text style={emailStyles.text}>{t.greeting}</Text>

          <Text style={emailStyles.text}>
            <strong>{invitedByName}</strong> {t.body1.replace("{invitedByName}", "").replace("{teamName}", teamName).trim()}{" "}
            <strong>{teamName}</strong> team on Pinacle.
          </Text>

          <Text style={emailStyles.text}>
            {t.body2}
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={acceptUrl}>
              {t.button}
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.h2}>{t.whatYouGet}</Text>

          <Text style={emailStyles.listItem}>
            <strong>{t.accessTeamPods}</strong> – {t.accessTeamPodsDesc}
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>{t.collaborative}</strong> – {t.collaborativeDesc}
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>{t.teamBilling}</strong> – {t.teamBillingDesc}
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>{t.persistentState}</strong> – {t.persistentStateDesc}
          </Text>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            {t.questionsContact.replace("{invitedByName}", invitedByName)}
          </Text>

          <Text style={emailStyles.footer}>{t.footer}</Text>
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
