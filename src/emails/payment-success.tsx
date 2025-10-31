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

type PaymentSuccessEmailProps = {
  name: string;
  amount: string;
  currency: string;
  invoiceUrl: string;
  billingUrl: string;
};

export const PaymentSuccessEmail = ({
  name,
  amount,
  currency,
  invoiceUrl,
  billingUrl,
}: PaymentSuccessEmailProps) => {
  const baseUrl = billingUrl.replace("/dashboard/billing", "");

  return (
    <Html>
      <Head />
      <Preview>Payment successful - Your pods are running smoothly</Preview>
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
          <Heading style={emailStyles.h1}>payment received</Heading>

          <Text style={emailStyles.text}>Hey {name},</Text>

          <Text style={emailStyles.text}>
            Your payment of {currency.toUpperCase()} {amount} was processed
            successfully.
          </Text>

          <Text style={emailStyles.text}>
            Your pods will continue running without interruption. Thanks for
            being with us.
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={invoiceUrl}>
              View Invoice
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            You can manage your billing and download invoices anytime from your{" "}
            <a href={billingUrl} style={emailStyles.link}>
              billing dashboard
            </a>
            .
          </Text>

          <Text style={emailStyles.footer}>– Pinacle</Text>
        </Container>
      </Body>
    </Html>
  );
};

PaymentSuccessEmail.PreviewProps = {
  name: "Alex",
  amount: "24.00",
  currency: "usd",
  invoiceUrl: "https://invoice.stripe.com/i/example",
  billingUrl: "http://localhost:3000/dashboard/billing",
} as PaymentSuccessEmailProps;

export default PaymentSuccessEmail;

