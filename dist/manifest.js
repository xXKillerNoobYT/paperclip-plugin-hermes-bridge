import { DEFAULT_CONFIG, PLUGIN_ID, PLUGIN_VERSION } from "./constants.js";

const manifest = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Hermes Bridge",
  description:
    "Expose Hermes Agent skills, memory, session recall, and quality-management workflows to Paperclip agents as a third-party plugin. Does not replace agent files or patch Paperclip core.",
  author: "IA / Hermes",
  categories: ["connector", "automation", "agent-tools"],
  capabilities: [
    "agent.tools.register",
    "activity.log.write",
    "plugin.state.read",
    "plugin.state.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      hermesCommand: {
        type: "string",
        title: "Hermes command",
        description: "Executable used to run Hermes. Use an absolute path if Paperclip cannot find hermes on PATH.",
        default: DEFAULT_CONFIG.hermesCommand,
      },
      defaultToolsets: {
        type: "string",
        title: "Default Hermes toolsets",
        description: "Comma-separated toolsets granted to hermes_delegate. Keep this narrow for safety.",
        default: DEFAULT_CONFIG.defaultToolsets,
      },
      defaultSkills: {
        type: "string",
        title: "Default Hermes skills",
        description: "Comma-separated Hermes skills loaded for delegated Hermes runs.",
        default: DEFAULT_CONFIG.defaultSkills,
      },
      defaultCwd: {
        type: "string",
        title: "Default working directory",
        description: "Working directory for Hermes child processes.",
        default: DEFAULT_CONFIG.defaultCwd,
      },
      timeoutMs: {
        type: "number",
        title: "Hermes process timeout (ms)",
        description: "Maximum runtime for a single Hermes child process.",
        default: DEFAULT_CONFIG.timeoutMs,
      },
      maxOutputBytes: {
        type: "number",
        title: "Max output bytes",
        description: "Upper bound for captured stdout/stderr per tool call.",
        default: DEFAULT_CONFIG.maxOutputBytes,
      },
      allowTerminalToolset: {
        type: "boolean",
        title: "Allow Hermes terminal toolset",
        description: "If false, terminal is stripped from requested toolsets unless a tool explicitly needs it.",
        default: DEFAULT_CONFIG.allowTerminalToolset,
      },
    },
  },
  tools: [
    {
      name: "hermes_status",
      displayName: "Hermes Status",
      description: "Check whether Hermes CLI is reachable from Paperclip and report the configured bridge settings.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: "hermes_delegate",
      displayName: "Delegate to Hermes",
      description: "Run a bounded Hermes Agent one-shot task from Paperclip with optional skills/toolsets/model/cwd.",
      parametersSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Self-contained task for Hermes." },
          cwd: { type: "string", description: "Optional working directory." },
          skills: { type: "string", description: "Comma-separated Hermes skills to preload." },
          toolsets: { type: "string", description: "Comma-separated Hermes toolsets to allow." },
          model: { type: "string", description: "Optional Hermes model override." },
          provider: { type: "string", description: "Optional Hermes provider override." },
          timeoutMs: { type: "number", description: "Optional timeout override in ms." },
        },
        required: ["prompt"],
      },
    },
    {
      name: "hermes_skill_improve",
      displayName: "Create or Improve Hermes Skill",
      description: "Ask Hermes to create, review, or improve a reusable Hermes skill based on Paperclip work evidence.",
      parametersSchema: {
        type: "object",
        properties: {
          skillName: { type: "string", description: "Skill name or proposed skill name." },
          action: { type: "string", description: "create, improve, or review." },
          goal: { type: "string", description: "What the skill should help future agents do." },
          evidence: { type: "string", description: "Concrete workflow, errors, commands, or lessons learned." },
          category: { type: "string", description: "Optional skill category." },
        },
        required: ["skillName", "goal", "evidence"],
      },
    },
    {
      name: "hermes_memory_record",
      displayName: "Record Hermes Memory",
      description: "Ask Hermes to save a durable user/environment fact to memory after filtering out stale task progress.",
      parametersSchema: {
        type: "object",
        properties: {
          target: { type: "string", description: "user or memory." },
          content: { type: "string", description: "Durable declarative fact to remember." },
          reason: { type: "string", description: "Why this will still matter later." },
        },
        required: ["content"],
      },
    },
    {
      name: "hermes_session_recall",
      displayName: "Hermes Session Recall",
      description: "Ask Hermes to search past sessions for relevant context before a Paperclip agent asks the user to repeat themselves.",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query. Use OR between alternatives for broad recall." },
          limit: { type: "number", description: "Max sessions to summarize." },
        },
        required: ["query"],
      },
    },
    {
      name: "hermes_quality_check",
      displayName: "Hermes Quality Check",
      description: "Ask Hermes to review whether work is truly done: requirements, tests, safety, missing verification, and follow-up risks.",
      parametersSchema: {
        type: "object",
        properties: {
          artifact: { type: "string", description: "Description of code/change/plan being checked." },
          requirements: { type: "string", description: "Acceptance criteria or user request." },
          evidence: { type: "string", description: "Tests run, diffs, logs, or observed behavior." },
        },
        required: ["artifact", "requirements"],
      },
    },
  ],
};

export default manifest;
