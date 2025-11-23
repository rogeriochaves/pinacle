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
  translations: {
    preview: string;
    title: string;
    greeting: string;
    body1: string;
    body2: string;
    viewInvoice: string;
    manageBilling: string;
    footer: string;
  };
};

export const PaymentSuccessEmail = ({
  name,
  amount,
  currency,
  invoiceUrl,
  billingUrl,
  translations,
}: PaymentSuccessEmailProps) => {
  const baseUrl = billingUrl.replace("/dashboard/billing", "");

  // Translations object is guaranteed to be provided by the email function
  const t = translations;

  return (
    <Html>
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

          <Text style={emailStyles.text}>{t.greeting}</Text>

          <Text style={emailStyles.text}>
            {t.body1}
          </Text>

          <Text style={emailStyles.text}>
            {t.body2}
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={invoiceUrl}>
              {t.viewInvoice}
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            You can manage your billing and download invoices anytime from your{" "}
            <a href={billingUrl} style={emailStyles.link}>
              {t.manageBilling}
            </a>
            .
          </Text>

          <Text style={emailStyles.footer}>{t.footer}</Text>
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

