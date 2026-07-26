import { run } from "./git";
import { getSetting, setSetting } from "./settings";

export type AgentId = "claude" | "codex" | "gemini";

export type AgentDef = {
  id: AgentId;
  label: string;
  vendor: string;
  cmd: string;
  /** full = streaming + per-project memory; basic = works, fewer niceties */
  capability: "full" | "basic";
  capabilityNote: string;
  installMarkdown: string;
};

export const AGENTS: AgentDef[] = [
  {
    id: "claude",
    label: "Claude Code",
    vendor: "Anthropic",
    cmd: "claude",
    capability: "full",
    capabilityNote: "Recommended — live streaming and per-project memory across messages.",
    installMarkdown: [
      "1. Install: `npm install -g @anthropic-ai/claude-code`",
      "2. Run `claude` once in a terminal and log in (Claude Pro/Max subscription or Anthropic API key).",
      "3. Come back here and hit Re-check.",
    ].join("\n"),
  },
  {
    id: "codex",
    label: "Codex CLI",
    vendor: "OpenAI",
    cmd: "codex",
    capability: "full",
    capabilityNote: "Works well — per-project memory across messages.",
    installMarkdown: [
      "1. Install: `npm install -g @openai/codex`",
      "2. Run `codex` once in a terminal and sign in (ChatGPT account or OpenAI API key).",
      "3. Come back here and hit Re-check.",
    ].join("\n"),
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    vendor: "Google",
    cmd: "gemini",
    capability: "basic",
    capabilityNote: "Basic support — each message starts a fresh session (no memory between messages yet).",
    installMarkdown: [
      "1. Install: `npm install -g @google/gemini-cli`",
      "2. Run `gemini` once in a terminal and sign in with your Google account.",
      "3. Come back here and hit Re-check.",
    ].join("\n"),
  },
];

export type AgentStatus = AgentDef & { detected: boolean; version: string | null };

export async function detectAgents(): Promise<AgentStatus[]> {
  return Promise.all(
    AGENTS.map(async (agent) => {
      try {
        const res = await Promise.race([
          run(agent.cmd, ["--version"]),
          new Promise<{ code: number; output: string }>((resolve) =>
            setTimeout(() => resolve({ code: 124, output: "" }), 10000)
          ),
        ]);
        const ok = res.code === 0;
        return { ...agent, detected: ok, version: ok ? res.output.trim().split("\n")[0] : null };
      } catch {
        return { ...agent, detected: false, version: null };
      }
    })
  );
}

export async function getSelectedAgent(): Promise<AgentId | null> {
  const v = await getSetting("coding_agent");
  return v === "claude" || v === "codex" || v === "gemini" ? v : null;
}

export async function setSelectedAgent(id: AgentId): Promise<void> {
  await setSetting("coding_agent", id, false);
}
