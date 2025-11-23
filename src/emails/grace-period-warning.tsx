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
    button: string;
    footer: string;
  };
};

export const GracePeriodWarningEmail = ({
  name,
  daysRemaining,
  amount,
  currency,
  billingUrl,
  locale = "en",
  translations,
}: GracePeriodWarningEmailProps) => {
  const baseUrl = billingUrl.replace("/dashboard/billing", "");

  // Translations object is guaranteed to be provided by the email function
  const t = translations;

  return (
    <Html>
      <Head />
      <Preview>
        {t.preview.replace("{daysRemaining}", String(daysRemaining))}
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
          <Heading style={emailStyles.h1}>{t.title}</Heading>

          <Text style={emailStyles.text}>{t.greeting.replace("{name}", name)}</Text>

          <Text style={emailStyles.text}>
            {t.body1.replace("{currency}", currency.toUpperCase()).replace("{amount}", amount)}
          </Text>

          <Text style={emailStyles.text}>
            {t.body2.replace("{daysRemaining}", String(daysRemaining))}
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={billingUrl}>
              {t.button}
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.h2}>{t.body3}</Text>

          <Text style={emailStyles.listItem}>
            {t.body4}
          </Text>

          <Text style={emailStyles.listItem}>
            {t.body5.replace("{daysRemaining}", String(daysRemaining))}
          </Text>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            {t.body6}
          </Text>

          <Text style={emailStyles.footer}>{t.footer}</Text>
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

