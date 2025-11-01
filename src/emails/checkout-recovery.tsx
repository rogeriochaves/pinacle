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
import type React from "react";
import { containerStyles, headingStyles, link, textStyles } from "./styles";

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
            <Text style={textStyles}>Hi {userName},</Text>
            <Text style={textStyles}>
              We noticed you started setting up your <strong>{tier}</strong> development pod but didn't complete the checkout process.
            </Text>
            <Text style={textStyles}>
              Your configuration is still saved! Click the button below to complete your setup and get your development environment running in minutes.
            </Text>
          </>
        );
      case 2:
        return (
          <>
            <Text style={textStyles}>Hi {userName},</Text>
            <Text style={textStyles}>
              Your <strong>{tier}</strong> pod configuration is still waiting for you. We'd hate to see you miss out on having your own fully-configured development environment.
            </Text>
            <Text style={textStyles}>
              Need help? Have questions? Just reply to this email and we'll be happy to assist!
            </Text>
          </>
        );
      case 3:
        return (
          <>
            <Text style={textStyles}>Hi {userName},</Text>
            <Text style={textStyles}>
              This is our last reminder about your <strong>{tier}</strong> pod setup. After this, we'll clear your saved configuration.
            </Text>
            <Text style={textStyles}>
              If you're not ready yet, no worries! You can always start a new setup anytime. But if you want to continue where you left off, click below now.
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
      <Body style={{ backgroundColor: "#f6f9fc", fontFamily: "monospace" }}>
        <Container style={containerStyles}>
          <Heading style={headingStyles}>{getHeadline()}</Heading>

          <Section>{getMessage()}</Section>

          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Link
              href={checkoutUrl}
              style={{
                ...link,
                backgroundColor: "#fb923c",
                color: "white",
                padding: "12px 24px",
                borderRadius: "6px",
                textDecoration: "none",
                display: "inline-block",
                fontWeight: "bold",
              }}
            >
              Complete Your Setup
            </Link>
          </Section>

          <Text style={{ ...textStyles, fontSize: "12px", color: "#64748b" }}>
            If you're having trouble with the button, copy and paste this URL into your browser:
          </Text>
          <Text style={{ ...textStyles, fontSize: "12px", color: "#64748b", wordBreak: "break-all" }}>
            {checkoutUrl}
          </Text>

          <Section style={{ marginTop: "32px", paddingTop: "32px", borderTop: "1px solid #e2e8f0" }}>
            <Text style={{ ...textStyles, fontSize: "12px", color: "#64748b" }}>
              Not interested? No problem! You can ignore this email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default CheckoutRecoveryEmail;

