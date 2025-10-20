// Shared email styles for Pinacle
// All emails should use these styles for consistent branding

export const emailStyles = {
  // Main body
  main: {
    backgroundColor: "#f1f5f9",
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },

  // Container for email content
  container: {
    backgroundColor: "#ffffff",
    margin: "40px auto",
    padding: "0",
    maxWidth: "600px",
    border: "1px solid #0f172a",
    borderRadius: "2px",
  },

  // Dark header section
  header: {
    backgroundColor: "#1e293b",
    padding: "16px 32px",
    borderBottom: "2px solid #0f172a",
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },

  // Logo image
  logoImage: {
    display: "inline-block",
    verticalAlign: "middle",
    marginRight: "12px",
  },

  // Logo text
  logoText: {
    color: "#f9fafb",
    fontSize: "16px",
    fontWeight: "600",
    margin: "0",
    display: "inline-block",
    verticalAlign: "middle",
  },

  // Main heading
  h1: {
    color: "#0f172a",
    fontSize: "24px",
    fontWeight: "700",
    margin: "32px 0 24px 0",
    padding: "0 32px",
    lineHeight: "1.2",
  },

  // Section titles
  h2: {
    color: "#0f172a",
    fontSize: "16px",
    fontWeight: "600",
    margin: "24px 0 16px 0",
    padding: "0 32px",
  },

  // Body text
  text: {
    color: "#334155",
    fontSize: "14px",
    lineHeight: "24px",
    margin: "12px 0",
    padding: "0 32px",
  },

  // List items
  listItem: {
    color: "#334155",
    fontSize: "14px",
    lineHeight: "24px",
    margin: "10px 0",
    padding: "0 32px",
  },

  // Button container
  buttonContainer: {
    padding: "32px 32px",
    textAlign: "center" as const,
  },

  // Primary button (orange with shadow)
  button: {
    backgroundColor: "#fdba74",
    border: "1px solid #0f172a",
    color: "#000",
    fontSize: "14px",
    textDecoration: "none",
    textAlign: "center" as const,
    display: "inline-block",
    padding: "10px 24px",
    boxShadow:
      "rgba(255, 255, 255, 0.3) 1px 1px 0px 0px inset, rgba(0, 0, 0, 0.3) -1px -1px 0px 0px inset, rgba(0, 0, 0, 0.2) 3px 3px 0px 0px",
  },

  // Horizontal rule
  hr: {
    width: "auto",
    borderColor: "#e2e8f0",
    margin: "24px 32px",
  },

  // Footer text
  footer: {
    color: "#64748b",
    fontSize: "12px",
    lineHeight: "20px",
    margin: "32px 0 0 0",
    padding: "0 32px 32px 32px",
  },
};

