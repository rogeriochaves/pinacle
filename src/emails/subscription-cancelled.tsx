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
    button: string;
    footer: string;
  };
};

export const SubscriptionCancelledEmail = ({
  name,
  billingUrl,
  dataRetentionDays = 30,
  locale = "en",
  translations,
}: SubscriptionCancelledEmailProps) => {
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
            {t.body1}
          </Text>

          <Text style={emailStyles.text}>
            {t.body2.replace("{dataRetentionDays}", String(dataRetentionDays))}
          </Text>

          <Text style={emailStyles.text}>
            {t.body3.replace("{dataRetentionDays}", String(dataRetentionDays))}
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={billingUrl}>
              {t.button}
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            {t.body4}
          </Text>

          <Text style={emailStyles.text}>
            {t.body5}
          </Text>

          <Text style={emailStyles.footer}>{t.footer}</Text>
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

