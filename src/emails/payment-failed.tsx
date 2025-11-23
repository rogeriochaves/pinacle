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
  locale?: string;
  translations: {
    preview: string;
    title: string;
    greeting: string;
    body1: string;
    body2: string;
    body3: string;
    body4: string;
    body5: string;
    body6: string;
    body7: string;
    button: string;
    footer: string;
  };
};

export const PaymentFailedEmail = ({
  name,
  amount,
  currency,
  billingUrl,
  graceDays = 7,
  locale = "en",
  translations,
}: PaymentFailedEmailProps) => {
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

          <Text style={emailStyles.text}>{t.greeting.replace("{name}", name)}</Text>

          <Text style={emailStyles.text}>
            {t.body1.replace("{currency}", currency.toUpperCase()).replace("{amount}", amount)}
          </Text>

          <Text style={emailStyles.listItem}>
            {t.body2}
          </Text>
          <Text style={emailStyles.listItem}>
            {t.body3}
          </Text>
          <Text style={emailStyles.listItem}>
            {t.body4}
          </Text>

          <Text style={emailStyles.text}>
            {t.body5}
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={billingUrl}>
              {t.button}
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            {t.body6}
          </Text>

          <Text style={emailStyles.text}>
            {t.body7}
          </Text>

          <Text style={emailStyles.footer}>{t.footer}</Text>
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

