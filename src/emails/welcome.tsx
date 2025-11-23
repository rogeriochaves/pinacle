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
  locale?: string;
  translations?: {
    preview: string;
    title: string;
    greeting: string;
    body1: string;
    body2: string;
    button: string;
    whatYouNeedToKnow: string;
    payForUse: string;
    payForUseDesc: string;
    itsYours: string;
    itsYoursDesc: string;
    persistentState: string;
    persistentStateDesc: string;
    shareAccess: string;
    shareAccessDesc: string;
    questionsReply: string;
    footer: string;
  };
};

export const WelcomeEmail = ({ name, dashboardUrl, locale = "en", translations }: WelcomeEmailProps) => {
  const baseUrl = dashboardUrl.replace("/dashboard", "");

  // Default English translations
  const t = translations || {
    preview: "Your dev box is ready. Spin up your first pod.",
    title: "account created",
    greeting: `Hey ${name},`,
    body1: "Your account is set up. Next step: create your first pod.",
    body2: "A pod is a dev machine just for you. Comes ready with VS Code, a coding assistant (Claude Code, Cursor CLI, Codex, etc), and all the tools you need for modern software development.",
    button: "Create First Pod",
    whatYouNeedToKnow: "What you need to know:",
    payForUse: "Pay for what you use",
    payForUseDesc: "You're billed while your machine is running. Stop it anytime.",
    itsYours: "It's yours",
    itsYoursDesc: "Install whatever you need. No restrictions.",
    persistentState: "Persistent state",
    persistentStateDesc: "Your pod keeps running. Close your laptop, your work continues.",
    shareAccess: "Share access",
    shareAccessDesc: "Invite teammates to work on the same machine.",
    questionsReply: "Questions? Reply to this email.",
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
            <Button style={emailStyles.button} href={dashboardUrl}>
              {t.button}
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.h2}>{t.whatYouNeedToKnow}</Text>

          <Text style={emailStyles.listItem}>
            <strong>{t.payForUse}</strong> – {t.payForUseDesc}
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>{t.itsYours}</strong> – {t.itsYoursDesc}
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>{t.persistentState}</strong> – {t.persistentStateDesc}
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>{t.shareAccess}</strong> – {t.shareAccessDesc}
          </Text>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>{t.questionsReply}</Text>

          <Text style={emailStyles.footer}>{t.footer}</Text>
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
