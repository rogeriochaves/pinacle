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

type FinalDeletionWarningEmailProps = {
  name: string;
  daysUntilDeletion: number;
  billingUrl: string;
};

export const FinalDeletionWarningEmail = ({
  name,
  daysUntilDeletion,
  billingUrl,
}: FinalDeletionWarningEmailProps) => {
  const baseUrl = billingUrl.replace("/dashboard/billing", "");

  return (
    <Html>
      <Head />
      <Preview>
        Final warning: Your data will be deleted in {String(daysUntilDeletion)} days
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
          <Heading style={emailStyles.h1}>🚨 final warning</Heading>

          <Text style={emailStyles.text}>Hey {name},</Text>

          <Text style={emailStyles.text}>
            <strong>This is your final notice.</strong>
          </Text>

          <Text style={emailStyles.text}>
            Your pods have been suspended for an extended period. In{" "}
            {daysUntilDeletion} day{daysUntilDeletion !== 1 ? "s" : ""}, all your
            data will be permanently deleted:
          </Text>

          <Text style={emailStyles.listItem}>• All pods and their contents</Text>
          <Text style={emailStyles.listItem}>• All snapshots and backups</Text>
          <Text style={emailStyles.listItem}>
            • All environment variables and configurations
          </Text>

          <Text style={emailStyles.text}>
            <strong>This action cannot be undone.</strong>
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={billingUrl}>
              Reactivate Your Account
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            To prevent deletion and restore access to your pods:
          </Text>

          <Text style={emailStyles.listItem}>
            1. Click the button above to visit your billing dashboard
          </Text>
          <Text style={emailStyles.listItem}>
            2. Update your payment method
          </Text>
          <Text style={emailStyles.listItem}>
            3. Your pods will be restored immediately after payment
          </Text>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            If you meant to cancel your subscription, you can ignore this email.
            Your data will be deleted as scheduled.
          </Text>

          <Text style={emailStyles.text}>
            Questions? Reply to this email and we'll help.
          </Text>

          <Text style={emailStyles.footer}>– Pinacle</Text>
        </Container>
      </Body>
    </Html>
  );
};

FinalDeletionWarningEmail.PreviewProps = {
  name: "Alex",
  daysUntilDeletion: 7,
  billingUrl: "http://localhost:3000/dashboard/billing",
} as FinalDeletionWarningEmailProps;

export default FinalDeletionWarningEmail;

