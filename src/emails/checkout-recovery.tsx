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
}

export const CheckoutRecoveryEmail = ({
  userName = "there",
  tier = "dev.small",
  checkoutUrl = "https://pinacle.dev/setup/configure",
  attemptNumber = 1,
}: CheckoutRecoveryEmailProps) => {
  const getSubjectLine = () => {
    switch (attemptNumber) {
      case 1:
        return "Complete your Pinacle setup";
      case 2:
        return "Your dev environment is waiting";
      case 3:
        return "Last chance - Your Pinacle pod setup";
      default:
        return "Complete your Pinacle setup";
    }
  };

  const getHeadline = () => {
    switch (attemptNumber) {
      case 1:
        return "Almost there!";
      case 2:
        return "Still interested?";
      case 3:
        return "We're holding your spot";
      default:
        return "Complete your setup";
    }
  };

  const getMessage = () => {
    switch (attemptNumber) {
      case 1:
        return (
          <>
            <Text style={emailStyles.text}>Hi {userName},</Text>
            <Text style={emailStyles.text}>
              We noticed you started setting up your <strong>{tier}</strong>{" "}
              development pod but didn't complete the checkout process.
            </Text>
            <Text style={emailStyles.text}>
              Your configuration is still saved! Click the button below to
              complete your setup and get your development environment running
              in minutes.
            </Text>
          </>
        );
      case 2:
        return (
          <>
            <Text style={emailStyles.text}>Hi {userName},</Text>
            <Text style={emailStyles.text}>
              Your <strong>{tier}</strong> pod configuration is still waiting
              for you. We'd hate to see you miss out on having your own
              fully-configured development environment.
            </Text>
            <Text style={emailStyles.text}>
              Need help? Have questions? Just reply to this email and we'll be
              happy to assist!
            </Text>
          </>
        );
      case 3:
        return (
          <>
            <Text style={emailStyles.text}>Hi {userName},</Text>
            <Text style={emailStyles.text}>
              This is our last reminder about your <strong>{tier}</strong> pod
              setup. After this, we'll clear your saved configuration.
            </Text>
            <Text style={emailStyles.text}>
              If you're not ready yet, no worries! You can always start a new
              setup anytime. But if you want to continue where you left off,
              click below now.
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
      <Preview>{getSubjectLine()}</Preview>
      <Body style={emailStyles.main}>
        <Container style={emailStyles.container}>
          <Heading style={emailStyles.h1}>{getHeadline()}</Heading>

          <Section>{getMessage()}</Section>

          <Section style={emailStyles.buttonContainer}>
            <Link href={checkoutUrl} style={emailStyles.button}>
              Complete Your Setup
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
              Not interested? No problem! You can ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default CheckoutRecoveryEmail;
