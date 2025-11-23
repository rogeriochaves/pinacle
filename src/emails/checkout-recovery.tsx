
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { emailStyles } from "./styles";

interface CheckoutRecoveryEmailProps {
  userName: string;
  tier: string;
  checkoutUrl: string;
  attemptNumber: 1 | 2 | 3; // Which recovery email is this
  locale?: string;
  translations: {
    subjectAttempt1: string;
    subjectAttempt2: string;
    subjectAttempt3: string;
    headlineAttempt1: string;
    headlineAttempt2: string;
    headlineAttempt3: string;
    greeting: string;
    body1: string;
    body2: string;
    body3: string;
    body4: string;
    body5: string;
    body6: string;
    button: string;
    footer: string;
  };
}

export const CheckoutRecoveryEmail = ({
  userName = "there",
  tier = "dev.small",
  checkoutUrl = "https://pinacle.dev/setup/configure",
  attemptNumber = 1,
  translations,
}: CheckoutRecoveryEmailProps) => {
  // Translations object is guaranteed to be provided by the email function
  const t = translations;

  const getHeadline = () => {
    switch (attemptNumber) {
      case 1:
        return t.headlineAttempt1;
      case 2:
        return t.headlineAttempt2;
      case 3:
        return t.headlineAttempt3;
      default:
        return t.headlineAttempt1;
    }
  };

  const getSubject = () => {
    switch (attemptNumber) {
      case 1:
        return t.subjectAttempt1;
      case 2:
        return t.subjectAttempt2;
      case 3:
        return t.subjectAttempt3;
      default:
        return t.subjectAttempt1;
    }
  };

  const getMessage = () => {
    switch (attemptNumber) {
      case 1:
        return (
          <>
            <Text style={emailStyles.text}>{t.greeting.replace("{userName}", userName)}</Text>
            <Text style={emailStyles.text}>
              {t.body1.replace("{tier}", tier)}
            </Text>
            <Text style={emailStyles.text}>
              {t.body2}
            </Text>
          </>
        );
      case 2:
        return (
          <>
            <Text style={emailStyles.text}>{t.greeting.replace("{userName}", userName)}</Text>
            <Text style={emailStyles.text}>
              {t.body3.replace("{tier}", tier)}
            </Text>
            <Text style={emailStyles.text}>
              {t.body4}
            </Text>
          </>
        );
      case 3:
        return (
          <>
            <Text style={emailStyles.text}>{t.greeting.replace("{userName}", userName)}</Text>
            <Text style={emailStyles.text}>
              {t.body5.replace("{tier}", tier)}
            </Text>
            <Text style={emailStyles.text}>
              {t.body6}
            </Text>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Html>
      <Head />
      <Preview>{getSubject()}</Preview>
      <Body style={emailStyles.main}>
        <Container style={emailStyles.container}>
          <Heading style={emailStyles.h1}>{getHeadline()}</Heading>

          <Section>{getMessage()}</Section>

          <Section style={emailStyles.buttonContainer}>
            <Link href={checkoutUrl} style={emailStyles.button}>
              {t.button}
            </Link>
          </Section>

          <Text
            style={{ ...emailStyles.text, fontSize: "12px", color: "#64748b" }}
          >
            If you're having trouble with the button, copy and paste this URL
            into your browser:
          </Text>
          <Text
            style={{
              ...emailStyles.text,
              fontSize: "12px",
              color: "#64748b",
              wordBreak: "break-all",
            }}
          >
            {checkoutUrl}
          </Text>

          <Section
            style={{
              marginTop: "32px",
              paddingTop: "32px",
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <Text style={{ ...emailStyles.footer, margin: "0" }}>
              {t.footer}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default CheckoutRecoveryEmail;
