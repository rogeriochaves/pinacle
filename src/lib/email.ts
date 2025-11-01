import { render } from "@react-email/render";
import { Resend } from "resend";
import FinalDeletionWarningEmail from "../emails/final-deletion-warning";
import GracePeriodWarningEmail from "../emails/grace-period-warning";
import PaymentFailedEmail from "../emails/payment-failed";
import PaymentSuccessEmail from "../emails/payment-success";
import ResetPasswordEmail from "../emails/reset-password";
import SubscriptionCancelledEmail from "../emails/subscription-cancelled";
import WelcomeEmail from "../emails/welcome";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

type SendWelcomeEmailParams = {
  to: string;
  name: string;
  dashboardUrl: string;
};

type SendResetPasswordEmailParams = {
  to: string;
  name: string;
  resetUrl: string;
};

export const sendWelcomeEmail = async ({
  to,
  name,
  dashboardUrl,
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

    // Render the email template
    const emailHtml = await render(WelcomeEmail({ name, dashboardUrl }));

    // Send the email
    const { data, error } = await resend.emails.send({
      from: "Pinacle <hello@pinacle.dev>",
      to: [to],
      subject: "Welcome to Pinacle - Create Your First Pod! 🚀",
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

    // Render the email template
    const emailHtml = await render(ResetPasswordEmail({ name, resetUrl }));

    // Send the email
    const { data, error } = await resend.emails.send({
      from: "Pinacle <hello@pinacle.dev>",
      to: [to],
      subject: "Reset your Pinacle password",
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
};

type SendPaymentFailedEmailParams = {
  to: string;
  name: string;
  amount: string;
  currency: string;
  billingUrl: string;
  graceDays?: number;
};

type SendSubscriptionCancelledEmailParams = {
  to: string;
  name: string;
  billingUrl: string;
  dataRetentionDays?: number;
};

type SendGracePeriodWarningEmailParams = {
  to: string;
  name: string;
  daysRemaining: number;
  amount: string;
  currency: string;
  billingUrl: string;
};

type SendFinalDeletionWarningEmailParams = {
  to: string;
  name: string;
  daysUntilDeletion: number;
  billingUrl: string;
};

export const sendPaymentSuccessEmail = async ({
  to,
  name,
  amount,
  currency,
  invoiceUrl,
  billingUrl,
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

    const emailHtml = await render(
      PaymentSuccessEmail({ name, amount, currency, invoiceUrl, billingUrl }),
    );

    const { data, error } = await resend.emails.send({
      from: "Pinacle <billing@pinacle.dev>",
      to: [to],
      subject: `Payment Received - ${currency.toUpperCase()} ${amount}`,
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

    const emailHtml = await render(
      PaymentFailedEmail({ name, amount, currency, billingUrl, graceDays }),
    );

    const { data, error } = await resend.emails.send({
      from: "Pinacle <billing@pinacle.dev>",
      to: [to],
      subject: "⚠️ Payment Failed - Action Required",
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

    const emailHtml = await render(
      SubscriptionCancelledEmail({ name, billingUrl, dataRetentionDays }),
    );

    const { data, error } = await resend.emails.send({
      from: "Pinacle <billing@pinacle.dev>",
      to: [to],
      subject: "Subscription Cancelled",
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

    const emailHtml = await render(
      GracePeriodWarningEmail({
        name,
        daysRemaining,
        amount,
        currency,
        billingUrl,
      }),
    );

    const { data, error } = await resend.emails.send({
      from: "Pinacle <billing@pinacle.dev>",
      to: [to],
      subject: `⚠️ Payment Overdue - ${daysRemaining} Days Until Suspension`,
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

    const emailHtml = await render(
      FinalDeletionWarningEmail({ name, daysUntilDeletion, billingUrl }),
    );

    const { data, error } = await resend.emails.send({
      from: "Pinacle <billing@pinacle.dev>",
      to: [to],
      subject: `🚨 Final Warning - Data Deletion in ${daysUntilDeletion} Days`,
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

// Checkout Recovery Email
type SendCheckoutRecoveryEmailParams = {
  to: string;
  name: string;
  tier: string;
  checkoutUrl: string;
  attemptNumber: 1 | 2 | 3;
};

export const sendCheckoutRecoveryEmail = async ({
  to,
  name,
  tier,
  checkoutUrl,
  attemptNumber,
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

    const CheckoutRecoveryEmail = (
      await import("../emails/checkout-recovery")
    ).default;
    const emailHtml = await render(
      CheckoutRecoveryEmail({ userName: name, tier, checkoutUrl, attemptNumber }),
    );

    const getSubjectLine = () => {
      switch (attemptNumber) {
        case 1:
          return "Complete your Pinacle setup";
        case 2:
          return "Your dev environment is waiting";
        case 3:
          return "Last chance - Your Pinacle pod setup";
        default:
          return "Complete your Pinacle setup";
      }
    };

    const { data, error } = await resend.emails.send({
      from: "Pinacle <noreply@pinacle.dev>",
      to,
      subject: getSubjectLine(),
      html: emailHtml,
    });

    if (error) {
      console.error("Failed to send checkout recovery email:", error);
      return { success: false, error: error.message };
    }

    console.log(`Checkout recovery email (attempt ${attemptNumber}) sent to ${to}:`, data?.id);
    return { success: true };
  } catch (error) {
    console.error("Error sending checkout recovery email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
