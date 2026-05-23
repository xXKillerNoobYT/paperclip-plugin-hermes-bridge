export const PLUGIN_ID = "paperclip-plugin-hermes-bridge";
export const PLUGIN_VERSION = "0.1.0";

export const DEFAULT_CONFIG = {
  hermesCommand: "hermes",
  defaultToolsets: "skills,memory,session_search,file,terminal",
  defaultSkills: "hermes-agent",
  defaultCwd: process.env.HOME || "/tmp",
  timeoutMs: 300000,
  maxOutputBytes: 120000,
  allowTerminalToolset: false,
  sourceTag: "paperclip-plugin-hermes-bridge",
};
