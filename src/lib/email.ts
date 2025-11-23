import { render } from "@react-email/render";
import { Resend } from "resend";
import type { Locale } from "@/i18n";
import FinalDeletionWarningEmail from "../emails/final-deletion-warning";
import GracePeriodWarningEmail from "../emails/grace-period-warning";
import PaymentFailedEmail from "../emails/payment-failed";
import PaymentSuccessEmail from "../emails/payment-success";
import ResetPasswordEmail from "../emails/reset-password";
import SubscriptionCancelledEmail from "../emails/subscription-cancelled";
import TeamInviteEmail from "../emails/team-invite";
import WelcomeEmail from "../emails/welcome";
import { getEmailT, getEmailTranslations } from "./email-i18n";

// Lazy initialization of Resend client (only when needed at runtime)
let resend: Resend | null = null;
const getResendClient = (): Resend => {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
};

type SendWelcomeEmailParams = {
  to: string;
  name: string;
  dashboardUrl: string;
  locale: Locale;
};

type SendResetPasswordEmailParams = {
  to: string;
  name: string;
  resetUrl: string;
  locale: Locale;
};

export const sendWelcomeEmail = async ({
  to,
  name,
  dashboardUrl,
  locale,
}: SendWelcomeEmailParams): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "RESEND_API_KEY is not set. Skipping welcome email sending.",
      );
      return {
        success: false,
        error: "Email service not configured",
      };
    }

    // Get translations for the locale
    const emailTranslations = await getEmailTranslations(locale);
    const t = (key: string, replacements?: Record<string, string | number>) =>
      getEmailT(emailTranslations, `welcome.${key}`, replacements);

    const translations = {
      preview: t("preview"),
      title: t("title"),
      greeting: t("greeting", { name }),
      body1: t("body1"),
      body2: t("body2"),
      button: t("button"),
      whatYouNeedToKnow: t("whatYouNeedToKnow"),
      payForUse: t("payForUse"),
      payForUseDesc: t("payForUseDesc"),
      itsYours: t("itsYours"),
      itsYoursDesc: t("itsYoursDesc"),
      persistentState: t("persistentState"),
      persistentStateDesc: t("persistentStateDesc"),
      shareAccess: t("shareAccess"),
      shareAccessDesc: t("shareAccessDesc"),
      questionsReply: t("questionsReply"),
      footer: t("footer"),
    };

    // Render the email template
    const emailHtml = await render(
      WelcomeEmail({ name, dashboardUrl, locale, translations }),
    );

    // Send the email
    const { data, error } = await getResendClient().emails.send({
      from: "Pinacle <hello@pinacle.dev>",
      to: [to],
      subject: t("preview"),
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send welcome email:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log(`Welcome email sent successfully to ${to}:`, data?.id);
    return { success: true };
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

export const sendResetPasswordEmail = async ({
  to,
  name,
  resetUrl,
  locale,
}: SendResetPasswordEmailParams): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "RESEND_API_KEY is not set. Skipping reset password email sending.",
      );
      return {
        success: false,
        error: "Email service not configured",
      };
    }

    // Get translations for the locale
    const emailTranslations = await getEmailTranslations(locale);
    const t = (key: string, replacements?: Record<string, string | number>) =>
      getEmailT(emailTranslations, `resetPassword.${key}`, replacements);

    const translations = {
      preview: t("preview"),
      title: t("title"),
      greeting: t("greeting", { name }),
      body1: t("body1"),
      body2: t("body2"),
      button: t("button"),
      footer: t("footer"),
    };

    // Render the email template
    const emailHtml = await render(
      ResetPasswordEmail({ name, resetUrl, locale, translations }),
    );

    // Send the email
    const { data, error } = await getResendClient().emails.send({
      from: "Pinacle <hello@pinacle.dev>",
      to: [to],
      subject: t("preview"),
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send reset password email:", error);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log(`Reset password email sent successfully to ${to}:`, data?.id);
    return { success: true };
  } catch (error) {
    console.error("Error sending reset password email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// Billing email types
type SendPaymentSuccessEmailParams = {
  to: string;
  name: string;
  amount: string;
  currency: string;
  invoiceUrl: string;
  billingUrl: string;
  locale: Locale;
};

type SendPaymentFailedEmailParams = {
  to: string;
  name: string;
  amount: string;
  currency: string;
  billingUrl: string;
  graceDays?: number;
  locale: Locale;
};

type SendSubscriptionCancelledEmailParams = {
  to: string;
  name: string;
  billingUrl: string;
  dataRetentionDays?: number;
  locale: Locale;
};

type SendGracePeriodWarningEmailParams = {
  to: string;
  name: string;
  daysRemaining: number;
  amount: string;
  currency: string;
  billingUrl: string;
  locale: Locale;
};

type SendFinalDeletionWarningEmailParams = {
  to: string;
  name: string;
  daysUntilDeletion: number;
  billingUrl: string;
  locale: Locale;
};

export const sendPaymentSuccessEmail = async ({
  to,
  name,
  amount,
  currency,
  invoiceUrl,
  billingUrl,
  locale,
}: SendPaymentSuccessEmailParams): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "RESEND_API_KEY is not set. Skipping payment success email sending.",
      );
      return { success: false, error: "Email service not configured" };
    }

    // Get translations for the locale
    const emailTranslations = await getEmailTranslations(locale);
    const t = (key: string, replacements?: Record<string, string | number>) =>
      getEmailT(emailTranslations, `paymentSuccess.${key}`, replacements);

    const translations = {
      preview: t("preview"),
      title: t("title"),
      greeting: t("greeting", { name }),
      body1: t("body1", { amount, currency: currency.toUpperCase() }),
      body2: t("body2"),
      viewInvoice: t("viewInvoice"),
      manageBilling: t("manageBilling"),
      footer: t("footer"),
    };

    const emailHtml = await render(
      PaymentSuccessEmail({ name, amount, currency, invoiceUrl, billingUrl, translations }),
    );

    const { data, error } = await getResendClient().emails.send({
      from: "Pinacle <billing@pinacle.dev>",
      to: [to],
      subject: t("subject", { currency: currency.toUpperCase(), amount }),
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send payment success email:", error);
      return { success: false, error: error.message };
    }

    console.log(`Payment success email sent to ${to}:`, data?.id);
    return { success: true };
  } catch (error) {
    console.error("Error sending payment success email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

export const sendPaymentFailedEmail = async ({
  to,
  name,
  amount,
  currency,
  billingUrl,
  graceDays = 7,
  locale,
}: SendPaymentFailedEmailParams): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "RESEND_API_KEY is not set. Skipping payment failed email sending.",
      );
      return { success: false, error: "Email service not configured" };
    }

    // Get translations for the locale
    const emailTranslations = await getEmailTranslations(locale);
    const t = (key: string, replacements?: Record<string, string | number>) =>
      getEmailT(emailTranslations, `paymentFailed.${key}`, replacements);

    const translations = {
      preview: t("preview"),
      title: t("title"),
      greeting: t("greeting"),
      body1: t("body1", { currency: currency.toUpperCase(), amount }),
      body2: t("body2"),
      body3: t("body3"),
      body4: t("body4"),
      body5: t("body5"),
      body6: t("body6"),
      body7: t("body7"),
      button: t("button"),
      footer: t("footer"),
    };

    const emailHtml = await render(
      PaymentFailedEmail({ name, amount, currency, billingUrl, graceDays, locale, translations }),
    );

    const { data, error } = await getResendClient().emails.send({
      from: "Pinacle <billing@pinacle.dev>",
      to: [to],
      subject: t("subject"),
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send payment failed email:", error);
      return { success: false, error: error.message };
    }

    console.log(`Payment failed email sent to ${to}:`, data?.id);
    return { success: true };
  } catch (error) {
    console.error("Error sending payment failed email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

export const sendSubscriptionCancelledEmail = async ({
  to,
  name,
  billingUrl,
  dataRetentionDays = 30,
  locale,
}: SendSubscriptionCancelledEmailParams): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "RESEND_API_KEY is not set. Skipping subscription cancelled email sending.",
      );
      return { success: false, error: "Email service not configured" };
    }

    // Get translations for the locale
    const emailTranslations = await getEmailTranslations(locale);
    const t = (key: string, replacements?: Record<string, string | number>) =>
      getEmailT(emailTranslations, `subscriptionCancelled.${key}`, replacements);

    const translations = {
      preview: t("preview"),
      title: t("title"),
      greeting: t("greeting"),
      body1: t("body1"),
      body2: t("body2", { dataRetentionDays }),
      body3: t("body3", { dataRetentionDays }),
      body4: t("body4"),
      body5: t("body5"),
      button: t("button"),
      footer: t("footer"),
    };

    const emailHtml = await render(
      SubscriptionCancelledEmail({ name, billingUrl, dataRetentionDays, locale, translations }),
    );

    const { data, error } = await getResendClient().emails.send({
      from: "Pinacle <billing@pinacle.dev>",
      to: [to],
      subject: t("subject"),
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send subscription cancelled email:", error);
      return { success: false, error: error.message };
    }

    console.log(`Subscription cancelled email sent to ${to}:`, data?.id);
    return { success: true };
  } catch (error) {
    console.error("Error sending subscription cancelled email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

export const sendGracePeriodWarningEmail = async ({
  to,
  name,
  daysRemaining,
  amount,
  currency,
  billingUrl,
  locale,
}: SendGracePeriodWarningEmailParams): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "RESEND_API_KEY is not set. Skipping grace period warning email sending.",
      );
      return { success: false, error: "Email service not configured" };
    }

    // Get translations for the locale
    const emailTranslations = await getEmailTranslations(locale);
    const t = (key: string, replacements?: Record<string, string | number>) =>
      getEmailT(emailTranslations, `gracePeriodWarning.${key}`, replacements);

    const translations = {
      preview: t("preview", { daysRemaining }),
      title: t("title"),
      greeting: t("greeting"),
      body1: t("body1", { currency: currency.toUpperCase(), amount }),
      body2: t("body2", { daysRemaining }),
      body3: t("body3"),
      body4: t("body4"),
      body5: t("body5", { daysRemaining }),
      body6: t("body6"),
      button: t("button"),
      footer: t("footer"),
    };

    const emailHtml = await render(
      GracePeriodWarningEmail({
        name,
        daysRemaining,
        amount,
        currency,
        billingUrl,
        locale,
        translations,
      }),
    );

    const { data, error } = await getResendClient().emails.send({
      from: "Pinacle <billing@pinacle.dev>",
      to: [to],
      subject: t("subject", { daysRemaining }),
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send grace period warning email:", error);
      return { success: false, error: error.message };
    }

    console.log(`Grace period warning email sent to ${to}:`, data?.id);
    return { success: true };
  } catch (error) {
    console.error("Error sending grace period warning email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

export const sendFinalDeletionWarningEmail = async ({
  to,
  name,
  daysUntilDeletion,
  billingUrl,
  locale,
}: SendFinalDeletionWarningEmailParams): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "RESEND_API_KEY is not set. Skipping final deletion warning email sending.",
      );
      return { success: false, error: "Email service not configured" };
    }

    // Get translations for the locale
    const emailTranslations = await getEmailTranslations(locale);
    const t = (key: string, replacements?: Record<string, string | number>) =>
      getEmailT(emailTranslations, `finalDeletionWarning.${key}`, replacements);

    const translations = {
      preview: t("preview", { daysUntilDeletion }),
      title: t("title"),
      greeting: t("greeting"),
      body1: t("body1"),
      body2: t("body2", { daysUntilDeletion }),
      body3: t("body3"),
      body4: t("body4"),
      body5: t("body5"),
      body6: t("body6"),
      body7: t("body7"),
      body8: t("body8"),
      body9: t("body9"),
      body10: t("body10"),
      body11: t("body11"),
      body12: t("body12"),
      button: t("button"),
      footer: t("footer"),
    };

    const emailHtml = await render(
      FinalDeletionWarningEmail({ name, daysUntilDeletion, billingUrl, locale, translations }),
    );

    const { data, error } = await getResendClient().emails.send({
      from: "Pinacle <billing@pinacle.dev>",
      to: [to],
      subject: t("subject", { daysUntilDeletion }),
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send final deletion warning email:", error);
      return { success: false, error: error.message };
    }

    console.log(`Final deletion warning email sent to ${to}:`, data?.id);
    return { success: true };
  } catch (error) {
    console.error("Error sending final deletion warning email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// Team Invite Email
type SendTeamInviteEmailParams = {
  to: string;
  invitedByName: string;
  teamName: string;
  acceptUrl: string;
  locale: Locale;
};

export const sendTeamInviteEmail = async ({
  to,
  invitedByName,
  teamName,
  acceptUrl,
  locale,
}: SendTeamInviteEmailParams): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "RESEND_API_KEY is not set. Skipping team invite email sending.",
      );
      return { success: false, error: "Email service not configured" };
    }

    // Get translations for the locale
    const emailTranslations = await getEmailTranslations(locale);
    const t = (key: string, replacements?: Record<string, string | number>) =>
      getEmailT(emailTranslations, `teamInvite.${key}`, replacements);

    const translations = {
      preview: t("preview", { teamName }),
      title: t("title"),
      greeting: t("greeting"),
      body1: t("body1", { invitedByName, teamName }),
      body2: t("body2"),
      button: t("button"),
      whatYouGet: t("whatYouGet"),
      accessTeamPods: t("accessTeamPods"),
      accessTeamPodsDesc: t("accessTeamPodsDesc"),
      collaborative: t("collaborative"),
      collaborativeDesc: t("collaborativeDesc"),
      teamBilling: t("teamBilling"),
      teamBillingDesc: t("teamBillingDesc"),
      persistentState: t("persistentState"),
      persistentStateDesc: t("persistentStateDesc"),
      questionsContact: t("questionsContact", { invitedByName }),
      footer: t("footer"),
    };

    const emailHtml = await render(
      TeamInviteEmail({
        invitedByName,
        teamName,
        acceptUrl,
        locale,
        translations,
      }),
    );

    const { data, error } = await getResendClient().emails.send({
      from: "Pinacle <hello@pinacle.dev>",
      to: [to],
      subject: t("preview", { teamName }),
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send team invite email:", error);
      return { success: false, error: error.message };
    }

    console.log(`Team invite email sent successfully to ${to}:`, data?.id);
    return { success: true };
  } catch (error) {
    console.error("Error sending team invite email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// Checkout Recovery Email
type SendCheckoutRecoveryEmailParams = {
  to: string;
  name: string;
  tier: string;
  checkoutUrl: string;
  attemptNumber: 1 | 2 | 3;
  locale: Locale;
};

export const sendCheckoutRecoveryEmail = async ({
  to,
  name,
  tier,
  checkoutUrl,
  attemptNumber,
  locale,
}: SendCheckoutRecoveryEmailParams): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "RESEND_API_KEY is not set. Skipping checkout recovery email sending.",
      );
      return { success: false, error: "Email service not configured" };
    }

    // Get translations for the locale
    const emailTranslations = await getEmailTranslations(locale);
    const t = (key: string, replacements?: Record<string, string | number>) =>
      getEmailT(emailTranslations, `checkoutRecovery.${key}`, replacements);

    const translations = {
      subjectAttempt1: t("subjectAttempt1"),
      subjectAttempt2: t("subjectAttempt2"),
      subjectAttempt3: t("subjectAttempt3"),
      headlineAttempt1: t("headlineAttempt1"),
      headlineAttempt2: t("headlineAttempt2"),
      headlineAttempt3: t("headlineAttempt3"),
      greeting: t("greeting"),
      body1: t("body1", { tier }),
      body2: t("body2"),
      body3: t("body3", { tier }),
      body4: t("body4"),
      body5: t("body5", { tier }),
      body6: t("body6"),
      button: t("button"),
      footer: t("footer"),
    };

    const CheckoutRecoveryEmail = (await import("../emails/checkout-recovery"))
      .default;
    const emailHtml = await render(
      CheckoutRecoveryEmail({
        userName: name,
        tier,
        checkoutUrl,
        attemptNumber,
        locale,
        translations,
      }),
    );

    const getSubjectLine = () => {
      switch (attemptNumber) {
        case 1:
          return translations.subjectAttempt1;
        case 2:
          return translations.subjectAttempt2;
        case 3:
          return translations.subjectAttempt3;
        default:
          return translations.subjectAttempt1;
      }
    };

    const { data, error } = await getResendClient().emails.send({
      from: "Pinacle <noreply@pinacle.dev>",
      to,
      subject: getSubjectLine(),
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send checkout recovery email:", error);
      return { success: false, error: error.message };
    }

    console.log(
      `Checkout recovery email (attempt ${attemptNumber}) sent to ${to}:`,
      data?.id,
    );
    return { success: true };
  } catch (error) {
    console.error("Error sending checkout recovery email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
