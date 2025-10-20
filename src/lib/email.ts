import { render } from "@react-email/render";
import { Resend } from "resend";
import WelcomeEmail from "../emails/welcome";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

type SendWelcomeEmailParams = {
  to: string;
  name: string;
  dashboardUrl: string;
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
