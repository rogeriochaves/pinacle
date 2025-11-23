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
    body8: string;
    body9: string;
    body10: string;
    body11: string;
    body12: string;
    button: string;
    footer: string;
  };
};

export const FinalDeletionWarningEmail = ({
  name,
  daysUntilDeletion,
  billingUrl,
  locale = "en",
  translations,
}: FinalDeletionWarningEmailProps) => {
  const baseUrl = billingUrl.replace("/dashboard/billing", "");

  // Translations object is guaranteed to be provided by the email function
  const t = translations;

  return (
    <Html>
      <Head />
      <Preview>
        {t.preview.replace("{daysUntilDeletion}", String(daysUntilDeletion))}
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
            {t.body1}
          </Text>

          <Text style={emailStyles.text}>
            {t.body2.replace("{daysUntilDeletion}", String(daysUntilDeletion))}
          </Text>

          <Text style={emailStyles.listItem}>{t.body3}</Text>
          <Text style={emailStyles.listItem}>{t.body4}</Text>
          <Text style={emailStyles.listItem}>{t.body5}</Text>

          <Text style={emailStyles.text}>
            {t.body6}
          </Text>

          <Section style={emailStyles.buttonContainer}>
            <Button style={emailStyles.button} href={billingUrl}>
              {t.button}
            </Button>
          </Section>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            {t.body7}
          </Text>

          <Text style={emailStyles.listItem}>{t.body8}</Text>
          <Text style={emailStyles.listItem}>{t.body9}</Text>
          <Text style={emailStyles.listItem}>{t.body10}</Text>

          <Hr style={emailStyles.hr} />

          <Text style={emailStyles.text}>
            {t.body11}
          </Text>

          <Text style={emailStyles.text}>
            {t.body12}
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

