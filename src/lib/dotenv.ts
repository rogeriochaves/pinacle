/**
 * Dotenv parsing and formatting utilities
 *
 * Handles conversion between dotenv format (free text with comments)
 * and Record<string, string> for backward compatibility.
 */

/**
 * Parse dotenv content into a Record<string, string>
 * Supports:
 * - Comments (lines starting with #)
 * - Empty lines
 * - KEY=value format
 * - Quoted values (single or double quotes)
 * - Multiline values with quotes
 */
export const parseDotenv = (content: string): Record<string, string> => {
  const result: Record<string, string> = {};

  if (!content || content.trim() === "") {
    return result;
  }

  const lines = content.split("\n");
  let currentKey = "";
  let currentValue = "";
  let inMultiline = false;
  let quoteChar = "";

  for (const line of lines) {
    // If we're in a multiline value
    if (inMultiline) {
      currentValue += `\n${line}`;
      // Check if this line ends the multiline
      if (line.trimEnd().endsWith(quoteChar)) {
        result[currentKey] = currentValue.slice(1, -1); // Remove surrounding quotes
        inMultiline = false;
        currentKey = "";
        currentValue = "";
      }
      continue;
    }

    // Skip empty lines and comments
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    // Parse KEY=value
    const equalIndex = line.indexOf("=");
    if (equalIndex === -1) {
      continue; // Skip lines without =
    }

    const key = line.substring(0, equalIndex).trim();
    let value = line.substring(equalIndex + 1);

    // Handle quoted values
    const trimmedValue = value.trim();
    if (
      (trimmedValue.startsWith('"') && !trimmedValue.endsWith('"')) ||
      (trimmedValue.startsWith("'") && !trimmedValue.endsWith("'"))
    ) {
      // Start of multiline quoted value
      inMultiline = true;
      quoteChar = trimmedValue[0];
      currentKey = key;
      currentValue = value.trim();
      continue;
    }

    // Remove surrounding quotes if present
    if (
      (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
      (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
    ) {
      value = trimmedValue.slice(1, -1);
    } else {
      value = trimmedValue;
    }

    if (key) {
      result[key] = value;
    }
  }

  return result;
};

/**
 * Format a Record<string, string> as dotenv content
 */
export const formatAsDotenv = (
  vars: Record<string, string>,
  options?: {
    comments?: Record<string, string>; // Comments to add above each key
    sectionHeaders?: Record<string, string>; // Section headers (key = first var in section)
  },
): string => {
  const lines: string[] = [];
  const { comments = {}, sectionHeaders = {} } = options || {};

  // Track which sections we've added
  const addedSections = new Set<string>();

  for (const [key, value] of Object.entries(vars)) {
    // Add section header if this is the first var in a section
    for (const [sectionKey, header] of Object.entries(sectionHeaders)) {
      if (key === sectionKey && !addedSections.has(header)) {
        if (lines.length > 0) {
          lines.push(""); // Add blank line before section
        }
        lines.push(`# ${header}`);
        addedSections.add(header);
      }
    }

    // Add comment if present
    if (comments[key]) {
      lines.push(`# ${comments[key]}`);
    }

    // Format the value - quote if it contains special characters
    let formattedValue = value;
    if (
      value.includes(" ") ||
      value.includes("\n") ||
      value.includes('"') ||
      value.includes("'") ||
      value.includes("#") ||
      value.includes("$")
    ) {
      // Escape double quotes and use double quotes
      formattedValue = `"${value.replace(/"/g, '\\"')}"`;
    }

    lines.push(`${key}=${formattedValue}`);
  }

  return lines.join("\n");
};

/**
 * Default .env content when template doesn't provide one
 */
export const DEFAULT_ENV_CONTENT = `# Environment Variables
# Add your environment variables below

`;

/**
 * Validation error for a specific line
 */
export type DotenvValidationError = {
  line: number;
  content: string;
  message: string;
};

/**
 * Validation result
 */
export type DotenvValidationResult = {
  valid: boolean;
  errors: DotenvValidationError[];
};

/**
 * Valid env var name pattern: starts with letter or underscore, followed by letters, numbers, or underscores
 */
const ENV_VAR_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Validate a single env var name
 */
export const isValidEnvVarName = (name: string): boolean => {
  return ENV_VAR_NAME_REGEX.test(name);
};

/**
 * Validate dotenv content and return detailed errors
 */
export const validateDotenv = (content: string): DotenvValidationResult => {
  const errors: DotenvValidationError[] = [];

  if (!content || content.trim() === "") {
    return { valid: true, errors: [] };
  }

  const lines = content.split("\n");
  let inMultiline = false;
  let quoteChar = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // If we're in a multiline value, check for closing quote
    if (inMultiline) {
      if (line.trimEnd().endsWith(quoteChar)) {
        inMultiline = false;
      }
      continue;
    }

    // Skip empty lines and comments
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    // Check for = sign
    const equalIndex = line.indexOf("=");
    if (equalIndex === -1) {
      errors.push({
        line: lineNumber,
        content: line,
        message: "Missing '=' sign. Format should be KEY=value",
      });
      continue;
    }

    // Validate the key
    const key = line.substring(0, equalIndex).trim();

    if (key === "") {
      errors.push({
        line: lineNumber,
        content: line,
        message: "Empty variable name before '='",
      });
      continue;
    }

    if (!isValidEnvVarName(key)) {
      errors.push({
        line: lineNumber,
        content: line,
        message: `Invalid variable name "${key}". Names must start with a letter or underscore, and contain only letters, numbers, and underscores`,
      });
      continue;
    }

    // Check for multiline start
    const value = line.substring(equalIndex + 1);
    const trimmedValue = value.trim();
    if (
      (trimmedValue.startsWith('"') && !trimmedValue.endsWith('"')) ||
      (trimmedValue.startsWith("'") && !trimmedValue.endsWith("'"))
    ) {
      inMultiline = true;
      quoteChar = trimmedValue[0];
    }
  }

  // Check if we're still in an unclosed multiline
  if (inMultiline) {
    errors.push({
      line: lines.length,
      content: lines[lines.length - 1],
      message: `Unclosed quoted value. Missing closing ${quoteChar}`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Get a human-readable validation error summary
 */
export const getValidationErrorSummary = (
  result: DotenvValidationResult,
): string => {
  if (result.valid) {
    return "";
  }

  if (result.errors.length === 1) {
    const error = result.errors[0];
    return `Line ${error.line}: ${error.message}`;
  }

  return `${result.errors.length} errors found. First error at line ${result.errors[0].line}: ${result.errors[0].message}`;
};

/**
 * Migrate JSON env vars to dotenv format
 * Used for backward compatibility during migration
 */
export const migrateJsonToDotenv = (jsonContent: string): string => {
  try {
    const vars = JSON.parse(jsonContent) as Record<string, string>;
    return formatAsDotenv(vars);
  } catch {
    // If it's not valid JSON, assume it's already dotenv format
    return jsonContent;
  }
};

/**
 * Check if content is JSON format (legacy) or dotenv format
 */
export const isJsonFormat = (content: string): boolean => {
  const trimmed = content.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
};

/**
 * Get env vars from content, auto-detecting format
 */
export const getEnvVars = (content: string): Record<string, string> => {
  if (!content || content.trim() === "") {
    return {};
  }

  if (isJsonFormat(content)) {
    try {
      return JSON.parse(content) as Record<string, string>;
    } catch {
      return {};
    }
  }

  return parseDotenv(content);
};

/**
 * Calculate MD5 hash of content for change detection
 */
export const calculateEnvHash = async (content: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(content.trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Merge two dotenv contents, with content2 taking precedence for conflicts
 */
export const mergeDotenvContents = (
  content1: string,
  content2: string,
): string => {
  const vars1 = parseDotenv(content1);
  const vars2 = parseDotenv(content2);

  const merged = { ...vars1, ...vars2 };
  return formatAsDotenv(merged);
};
