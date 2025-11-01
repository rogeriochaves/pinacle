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

type PaymentFailedEmailProps = {
  name: string;
  amount: string;
  currency: string;
  billingUrl: string;
  graceDays: number;
};

export const PaymentFailedEmail = ({
  name,
  amount,
  currency,
  billingUrl,
  graceDays = 7,
}: PaymentFailedEmailProps) => {
  const baseUrl = billingUrl.replace("/dashboard/billing", "");

  return (
    <Html>
      <Head />
      <Preview>Payment failed - Action required to keep your pods running</Preview>
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
          <Heading style={emailStyles.h1}>payment failed</Heading>

          <Text style={emailStyles.text}>Hey {name},</Text>

          <Text style={emailStyles.text}>
            We couldn't process your payment of {currency.toUpperCase()} {amount}.
            This is usually because:
          </Text>

          <Text style={emailStyles.listItem}>
            • Your card expired or was declined
          </Text>
          <Text style={emailStyles.listItem}>
            • Insufficient funds
          </Text>
          <Text style={emailStyles.listItem}>
            • Your card issuer blocked the transaction
          </Text>

          <Text style={emailStyles.text}>
            <strong>Your pods are still running</strong> for the next 24 hours.
            After that, they'll be suspended until payment is received.
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={billingUrl}>
              Update Payment Method
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            Stripe will automatically retry your payment. You can also update
            your payment method in your billing dashboard to resolve this
            immediately.
          </Text>

          <Text style={emailStyles.text}>
            Questions? Reply to this email.
          </Text>

          <Text style={emailStyles.footer}>– Pinacle</Text>
        </Container>
      </Body>
    </Html>
  );
};

PaymentFailedEmail.PreviewProps = {
  name: "Alex",
  amount: "24.00",
  currency: "usd",
  billingUrl: "http://localhost:3000/dashboard/billing",
  graceDays: 1,
} as PaymentFailedEmailProps;

export default PaymentFailedEmail;

