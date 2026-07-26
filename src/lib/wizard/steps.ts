import content from "./content.json";

export type WizardInput = {
  name: string;
  label: string;
  type: "text" | "textarea";
  secret: boolean; // secret → stored encrypted in Credential; else in WizardState.data
  placeholder?: string;
};

export type WizardStepDef = {
  id: string;
  phase: string;
  optional: boolean;
  /** step ids that should be done first (informational, not enforced) */
  requires: string[];
  inputs: WizardInput[];
  /** returns an error string, or null if values pass */
  validate?: (values: Record<string, string>) => string | null;
  title: string;
  summary: string;
  clockNote: string | null;
  instructionsMarkdown: string;
  verifyHints: string | null;
};

type StepContent = {
  title: string;
  summary: string;
  clockNote: string | null;
  instructionsMarkdown: string;
  verifyHints: string | null;
};

const c = content as Record<string, StepContent>;

function step(
  id: string,
  phase: string,
  opts: Partial<Pick<WizardStepDef, "optional" | "requires" | "inputs" | "validate">> = {}
): WizardStepDef {
  const body = c[id] ?? {
    title: id,
    summary: "",
    clockNote: null,
    instructionsMarkdown: "Instructions coming soon.",
    verifyHints: null,
  };
  return {
    id,
    phase,
    optional: opts.optional ?? false,
    requires: opts.requires ?? [],
    inputs: opts.inputs ?? [],
    validate: opts.validate,
    ...body,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUNDLE_RE = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export const WIZARD_STEPS: WizardStepDef[] = [
  // ── Phase 1: Accounts (start the clocks) ────────────────────────────────
  step("github-pat", "1. Accounts", {
    inputs: [
      {
        name: "github_pat",
        label: "GitHub personal access token",
        type: "text",
        secret: true,
        placeholder: "github_pat_… or ghp_…",
      },
    ],
    validate: (v) =>
      v.github_pat?.startsWith("github_pat_") || v.github_pat?.startsWith("ghp_")
        ? null
        : "That doesn't look like a GitHub token (should start with github_pat_ or ghp_).",
  }),
  step("expo-account-token", "1. Accounts", {
    inputs: [
      { name: "expo_token", label: "Expo access token", type: "text", secret: true, placeholder: "Paste your expo.dev access token" },
    ],
    validate: (v) => (v.expo_token && v.expo_token.length >= 20 ? null : "Expo tokens are longer than that — copy the full value."),
  }),
  step("apple-developer-account", "1. Accounts", {
    inputs: [{ name: "apple_team_id", label: "Apple Team ID (10 characters, from Membership page)", type: "text", secret: false, placeholder: "e.g. 5K3P7ABCDE" }],
    validate: (v) => (/^[A-Z0-9]{10}$/.test(v.apple_team_id ?? "") ? null : "Team IDs are exactly 10 letters/digits (find it under Membership details)."),
  }),
  step("play-console-account", "1. Accounts", {
    inputs: [{ name: "play_dev_name", label: "Your Play Console developer name", type: "text", secret: false }],
  }),

  // ── Phase 2: App identity ───────────────────────────────────────────────
  step("app-identity", "2. App identity", {
    inputs: [
      { name: "app_name", label: "App display name (max 30 characters)", type: "text", secret: false },
      { name: "bundle_id", label: "Bundle ID / package name", type: "text", secret: false, placeholder: "com.yourname.yourapp" },
    ],
    validate: (v) => {
      if (!v.app_name || v.app_name.length > 30) return "App name is required, 30 characters max.";
      if (!BUNDLE_RE.test(v.bundle_id ?? "")) return "Bundle ID must look like com.yourname.yourapp (letters/digits, dot-separated).";
      return null;
    },
  }),

  // ── Phase 3: Signing & submission credentials ───────────────────────────
  step("asc-api-key", "3. Credentials", {
    requires: ["apple-developer-account"],
    inputs: [
      { name: "asc_key_id", label: "Key ID (10 characters)", type: "text", secret: true },
      { name: "asc_issuer_id", label: "Issuer ID (UUID shown at top of the Keys page)", type: "text", secret: true },
      { name: "asc_key_p8", label: "Contents of the downloaded .p8 file (open it with TextEdit, copy everything)", type: "textarea", secret: true },
    ],
    validate: (v) => {
      if (!/^[A-Z0-9]{10}$/.test(v.asc_key_id ?? "")) return "Key ID should be exactly 10 letters/digits.";
      if (!UUID_RE.test(v.asc_issuer_id ?? "")) return "Issuer ID should be a UUID like 69a6de78-…";
      if (!v.asc_key_p8?.includes("BEGIN PRIVATE KEY")) return "The .p8 content should include '-----BEGIN PRIVATE KEY-----'. Open the file in a text editor and copy all of it.";
      return null;
    },
  }),
  step("play-service-account", "3. Credentials", {
    requires: ["play-console-account"],
    inputs: [
      { name: "play_service_account_json", label: "Contents of the service-account JSON key file", type: "textarea", secret: true },
    ],
    validate: (v) => {
      try {
        const parsed = JSON.parse(v.play_service_account_json ?? "");
        return parsed.type === "service_account" && parsed.private_key ? null : "This JSON doesn't look like a service-account key (missing type/private_key).";
      } catch {
        return "That's not valid JSON — copy the entire file contents.";
      }
    },
  }),

  // ── Phase 4: Install on your phone ──────────────────────────────────────
  step("android-install", "4. Install on your phone", { requires: ["expo-account-token"] }),
  step("ios-testflight", "4. Install on your phone", { requires: ["asc-api-key"] }),

  // ── Phase 5: Optional features ──────────────────────────────────────────
  step("google-signin-oauth", "5. Optional features", {
    optional: true,
    inputs: [
      { name: "google_web_client_id", label: "Web client ID", type: "text", secret: true },
      { name: "google_ios_client_id", label: "iOS client ID", type: "text", secret: true },
    ],
    validate: (v) =>
      (v.google_web_client_id ?? "").endsWith(".apps.googleusercontent.com")
        ? null
        : "Client IDs end with .apps.googleusercontent.com",
  }),
  step("apple-signin", "5. Optional features", { optional: true, requires: ["apple-developer-account"] }),

  // ── Phase 6: Backend hosting ────────────────────────────────────────────
  step("backend-hosting", "6. Backend hosting", { optional: true }),
  step("gcp-deploy", "6. Backend hosting", {
    optional: true,
    requires: ["backend-hosting"],
    inputs: [
      {
        name: "gcp_project_id",
        label: "Google Cloud project ID (optional — the chat agent uses it when deploying)",
        type: "text",
        secret: false,
        placeholder: "e.g. my-app-prod-4821",
      },
    ],
    validate: (v) =>
      !v.gcp_project_id || /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(v.gcp_project_id)
        ? null
        : "Project IDs are 6–30 characters: lowercase letters, digits and hyphens, starting with a letter.",
  }),

  // ── Phase 7: Store visuals ──────────────────────────────────────────────
  step("store-icon", "7. Store visuals", {}),
  step("store-screenshots", "7. Store visuals", {}),
  step("store-visuals-generate", "7. Store visuals", { requires: ["store-icon", "store-screenshots"] }),
];

export function getStep(id: string): WizardStepDef | undefined {
  return WIZARD_STEPS.find((s) => s.id === id);
}
