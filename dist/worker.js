import { spawn } from "node:child_process";
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { DEFAULT_CONFIG, PLUGIN_ID, PLUGIN_VERSION } from "./constants.js";

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function splitCsv(value) {
  return asString(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCommand(commandText) {
  const trimmed = asString(commandText, DEFAULT_CONFIG.hermesCommand);
  // Paperclip config normally stores just "hermes" or an absolute path. This lightweight
  // parser intentionally avoids shell execution; quoted paths with args are not supported.
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return { command: parts[0], baseArgs: parts.slice(1) };
}

function sanitizeToolsets(toolsets, config, { forceTerminal = false } = {}) {
  const requested = splitCsv(toolsets || config.defaultToolsets);
  const filtered = requested.filter((name) => {
    if (name !== "terminal") return true;
    return forceTerminal || config.allowTerminalToolset === true;
  });
  return [...new Set(filtered)].join(",");
}

function boundedText(buffer, maxBytes) {
  if (buffer.length <= maxBytes) return buffer;
  return `${buffer.slice(0, maxBytes)}\n\n[paperclip-plugin-hermes-bridge: output truncated at ${maxBytes} bytes]`;
}

function runHermes(config, args, options = {}) {
  const { command, baseArgs } = parseCommand(config.hermesCommand);
  const timeoutMs = asNumber(options.timeoutMs, asNumber(config.timeoutMs, DEFAULT_CONFIG.timeoutMs));
  const maxOutputBytes = asNumber(config.maxOutputBytes, DEFAULT_CONFIG.maxOutputBytes);
  const cwd = asString(options.cwd, asString(config.defaultCwd, DEFAULT_CONFIG.defaultCwd));
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command, [...baseArgs, ...args], {
      cwd,
      env: {
        ...process.env,
        HERMES_SOURCE: config.sourceTag || DEFAULT_CONFIG.sourceTag,
        NO_COLOR: process.env.NO_COLOR || "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 5000).unref?.();
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout = boundedText(stdout + chunk.toString("utf8"), maxOutputBytes);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = boundedText(stderr + chunk.toString("utf8"), maxOutputBytes);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: null,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        command,
        args,
        cwd,
      });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        exitCode: code,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        command,
        args,
        cwd,
      });
    });
  });
}

function chatArgs(config, prompt, params = {}, options = {}) {
  const args = ["chat", "-q", prompt, "-Q", "--source", config.sourceTag || DEFAULT_CONFIG.sourceTag];
  const toolsets = sanitizeToolsets(params.toolsets, config, options);
  const skills = asString(params.skills, config.defaultSkills);
  if (toolsets) args.push("--toolsets", toolsets);
  if (skills) args.push("--skills", skills);
  if (params.model) args.push("--model", String(params.model));
  if (params.provider) args.push("--provider", String(params.provider));
  return args;
}

function wrapPrompt(title, body) {
  return `${title}\n\nYou are being called from Paperclip through the Hermes Bridge plugin. Be concise but complete. If you use tools, verify results before finalizing. Do not modify Paperclip core or agent instruction files unless the prompt explicitly asks.\n\n${body}`;
}

async function runChatTool(ctx, config, params, prompt, options = {}) {
  const result = await runHermes(config, chatArgs(config, prompt, params, options), {
    cwd: params.cwd,
    timeoutMs: params.timeoutMs,
  });
  if (!result.ok) {
    ctx.logger.warn("Hermes tool call failed", {
      tool: options.toolName,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stderr: result.stderr.slice(0, 2000),
    });
  }
  return { data: result };
}

const plugin = definePlugin({
  async setup(ctx) {
    const rawConfig = await ctx.config.get();
    const config = { ...DEFAULT_CONFIG, ...(rawConfig || {}) };

    ctx.logger.info("Hermes Bridge plugin loaded", {
      pluginId: PLUGIN_ID,
      version: PLUGIN_VERSION,
      hermesCommand: config.hermesCommand,
      defaultToolsets: config.defaultToolsets,
      allowTerminalToolset: config.allowTerminalToolset,
    });

    ctx.tools.register(
      "hermes_status",
      {
        displayName: "Hermes Status",
        description: "Check whether Hermes CLI is reachable from Paperclip.",
        parametersSchema: { type: "object", properties: {} },
      },
      async () => {
        const version = await runHermes(config, ["--version"], { timeoutMs: 30000 });
        const skills = await runHermes(config, ["skills", "list"], { timeoutMs: 60000 });
        return {
          data: {
            pluginId: PLUGIN_ID,
            version: PLUGIN_VERSION,
            config: {
              hermesCommand: config.hermesCommand,
              defaultCwd: config.defaultCwd,
              defaultToolsets: config.defaultToolsets,
              defaultSkills: config.defaultSkills,
              allowTerminalToolset: config.allowTerminalToolset,
            },
            hermesVersion: version,
            skillsList: skills,
          },
        };
      },
    );

    ctx.tools.register(
      "hermes_delegate",
      {
        displayName: "Delegate to Hermes",
        description: "Run a bounded Hermes Agent one-shot task from Paperclip.",
        parametersSchema: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            cwd: { type: "string" },
            skills: { type: "string" },
            toolsets: { type: "string" },
            model: { type: "string" },
            provider: { type: "string" },
            timeoutMs: { type: "number" },
          },
          required: ["prompt"],
        },
      },
      async (params) => {
        const p = params || {};
        if (!asString(p.prompt)) return { error: "prompt is required" };
        return runChatTool(ctx, config, p, asString(p.prompt), { toolName: "hermes_delegate" });
      },
    );

    ctx.tools.register(
      "hermes_skill_improve",
      {
        displayName: "Create or Improve Hermes Skill",
        description: "Ask Hermes to create, review, or improve a reusable Hermes skill.",
        parametersSchema: {
          type: "object",
          properties: {
            skillName: { type: "string" },
            action: { type: "string" },
            goal: { type: "string" },
            evidence: { type: "string" },
            category: { type: "string" },
          },
          required: ["skillName", "goal", "evidence"],
        },
      },
      async (params) => {
        const p = params || {};
        const prompt = wrapPrompt(
          "Hermes skill lifecycle request",
          `Action: ${asString(p.action, "improve")}\nSkill name: ${asString(p.skillName)}\nCategory: ${asString(p.category, "") || "unspecified"}\nGoal: ${asString(p.goal)}\n\nEvidence / lessons / workflow:\n${asString(p.evidence)}\n\nDecide whether this belongs in a Hermes skill. If yes, use Hermes skill tools to create or patch the skill. If not, explain why it should not be saved. Prefer reusable procedures, pitfalls, verification steps, and exact commands. Do not save temporary task progress, PR numbers, issue numbers, or stale details.`,
        );
        return runChatTool(
          ctx,
          config,
          { ...p, skills: "hermes-agent,hermes-agent-skill-authoring", toolsets: "skills,file" },
          prompt,
          { toolName: "hermes_skill_improve" },
        );
      },
    );

    ctx.tools.register(
      "hermes_memory_record",
      {
        displayName: "Record Hermes Memory",
        description: "Ask Hermes to save a durable user/environment fact to memory.",
        parametersSchema: {
          type: "object",
          properties: {
            target: { type: "string" },
            content: { type: "string" },
            reason: { type: "string" },
          },
          required: ["content"],
        },
      },
      async (params) => {
        const p = params || {};
        const target = asString(p.target, "memory") === "user" ? "user" : "memory";
        const prompt = wrapPrompt(
          "Hermes memory request",
          `Target memory store: ${target}\nProposed durable fact: ${asString(p.content)}\nReason it matters later: ${asString(p.reason, "not provided")}\n\nUse the Hermes memory tool only if this is a durable declarative fact that should survive future sessions. Reject stale task progress, completed-work logs, issue/PR IDs, temporary TODOs, or anything likely stale within a week. If saved, report exactly what was saved.`,
        );
        return runChatTool(
          ctx,
          config,
          { ...p, skills: "", toolsets: "memory" },
          prompt,
          { toolName: "hermes_memory_record" },
        );
      },
    );

    ctx.tools.register(
      "hermes_session_recall",
      {
        displayName: "Hermes Session Recall",
        description: "Ask Hermes to search past sessions for relevant context.",
        parametersSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      },
      async (params) => {
        const p = params || {};
        const prompt = wrapPrompt(
          "Hermes session recall request",
          `Search past Hermes sessions for: ${asString(p.query)}\nLimit: ${asNumber(p.limit, 3)}\n\nUse session_search. Return the relevant context, what is uncertain, and what Paperclip should do next.`,
        );
        return runChatTool(
          ctx,
          config,
          { ...p, skills: "", toolsets: "session_search" },
          prompt,
          { toolName: "hermes_session_recall" },
        );
      },
    );

    ctx.tools.register(
      "hermes_quality_check",
      {
        displayName: "Hermes Quality Check",
        description: "Ask Hermes to review whether work is truly done.",
        parametersSchema: {
          type: "object",
          properties: {
            artifact: { type: "string" },
            requirements: { type: "string" },
            evidence: { type: "string" },
          },
          required: ["artifact", "requirements"],
        },
      },
      async (params) => {
        const p = params || {};
        const prompt = wrapPrompt(
          "Hermes quality-management check",
          `Artifact/change/plan to review:\n${asString(p.artifact)}\n\nRequirements / acceptance criteria:\n${asString(p.requirements)}\n\nEvidence available:\n${asString(p.evidence, "No evidence supplied.")}\n\nCheck whether everything is actually done right. Look for missing tests, unverified claims, unsafe side effects, stale assumptions, skill/memory updates that should be made, and whether the next Paperclip action should be proceed, request fixes, block, or ask the user. Do not modify files unless explicitly requested; this is a review by default.`,
        );
        return runChatTool(
          ctx,
          config,
          { ...p, skills: "systematic-debugging,requesting-code-review,hermes-agent", toolsets: "file,session_search,skills" },
          prompt,
          { toolName: "hermes_quality_check" },
        );
      },
    );
  },
});

runWorker(plugin);
