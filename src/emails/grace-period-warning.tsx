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

type GracePeriodWarningEmailProps = {
  name: string;
  daysRemaining: number; // Now represents hours, not days (24 hour grace period)
  amount: string;
  currency: string;
  billingUrl: string;
};

export const GracePeriodWarningEmail = ({
  name,
  daysRemaining,
  amount,
  currency,
  billingUrl,
}: GracePeriodWarningEmailProps) => {
  const baseUrl = billingUrl.replace("/dashboard/billing", "");

  return (
    <Html>
      <Head />
      <Preview>
        {String(daysRemaining)} hours until your pods are suspended - Action required
      </Preview>
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
          <Heading style={emailStyles.h1}>⚠️ payment overdue</Heading>

          <Text style={emailStyles.text}>Hey {name},</Text>

          <Text style={emailStyles.text}>
            Your payment of {currency.toUpperCase()} {amount} is still outstanding.
            We've tried processing it multiple times but haven't been able to
            collect payment.
          </Text>

          <Text style={emailStyles.text}>
            <strong>
              You have {daysRemaining} hour{daysRemaining !== 1 ? "s" : ""} remaining
            </strong>{" "}
            before your pods are suspended and you lose access to them.
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={billingUrl}>
              Update Payment Method Now
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.h2}>What happens next:</Text>

          <Text style={emailStyles.listItem}>
            <strong>If you update your payment method:</strong> Your pods will
            continue running normally.
          </Text>

          <Text style={emailStyles.listItem}>
            <strong>If payment isn't received:</strong> Your pods will be
            suspended in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}. You
            won't be able to access them until payment is made.
          </Text>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            This is an automated reminder. Please update your payment method to
            avoid service interruption.
          </Text>

          <Text style={emailStyles.footer}>– Pinacle</Text>
        </Container>
      </Body>
    </Html>
  );
};

GracePeriodWarningEmail.PreviewProps = {
  name: "Alex",
  daysRemaining: 12, // 12 hours remaining
  amount: "24.00",
  currency: "usd",
  billingUrl: "http://localhost:3000/dashboard/billing",
} as GracePeriodWarningEmailProps;

export default GracePeriodWarningEmail;

