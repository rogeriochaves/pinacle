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

type SubscriptionCancelledEmailProps = {
  name: string;
  billingUrl: string;
  dataRetentionDays: number;
};

export const SubscriptionCancelledEmail = ({
  name,
  billingUrl,
  dataRetentionDays = 30,
}: SubscriptionCancelledEmailProps) => {
  const baseUrl = billingUrl.replace("/dashboard/billing", "");

  return (
    <Html>
      <Head />
      <Preview>Your subscription has been cancelled</Preview>
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
          <Heading style={emailStyles.h1}>subscription cancelled</Heading>

          <Text style={emailStyles.text}>Hey {name},</Text>

          <Text style={emailStyles.text}>
            Your subscription has been cancelled. All your pods have been stopped
            and won't incur any more charges.
          </Text>

          <Text style={emailStyles.text}>
            <strong>Your data</strong> will be kept for {dataRetentionDays} days.
            If you reactivate your subscription before then, everything will be
            exactly as you left it.
          </Text>

          <Text style={emailStyles.text}>
            After {dataRetentionDays} days, your pods and snapshots will be
            permanently deleted.
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={billingUrl}>
              Reactivate Subscription
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            We're sorry to see you go. If there's anything we could have done
            better, please reply to this email and let us know.
          </Text>

          <Text style={emailStyles.footer}>– Pinacle</Text>
        </Container>
      </Body>
    </Html>
  );
};

SubscriptionCancelledEmail.PreviewProps = {
  name: "Alex",
  billingUrl: "http://localhost:3000/dashboard/billing",
  dataRetentionDays: 30,
} as SubscriptionCancelledEmailProps;

export default SubscriptionCancelledEmail;

