import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const AGENT_OS_URL = "http://localhost:4000";
const OLLAMA_URL = "http://localhost:11434";

// All available agents exposed by Agent OS
const ALL_AGENTS = z.enum(["alex", "maya", "jordan", "dev", "sam", "luna", "iris", "rex", "nova", "pixel", "ceo", "cto"]);

const server = new McpServer({
  name: "agent-os",
  version: "1.0.0",
});

// Tool 1 — Talk to any agent
// Timeout: 3 minutes. Reflection is background-only so this returns as soon as Ollama responds.
server.tool(
  "talk_to_agent",
  {
    agentId: ALL_AGENTS,
    message: z.string(),
    model: z.string().optional(),
  },
  async ({ agentId, message, model }) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000); // 3 min

    try {
      const res = await fetch(AGENT_OS_URL + "/api/agent", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, message, model: model || "qwen2.5:14b" }),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => res.status);
        return { content: [{ type: "text", text: `Agent OS error (${res.status}): ${err}` }] };
      }

      const data = await res.json();
      if (data.error) {
        return { content: [{ type: "text", text: `Error: ${data.error}` }] };
      }

      return {
        content: [{
          type: "text",
          text: `**${data.agentName}** responded:\n\n${data.reply}`,
        }],
      };
    } catch (err) {
      if (err.name === "AbortError") {
        return {
          content: [{
            type: "text",
            text: "Request timed out after 3 minutes. The model may be overloaded — try again or use a smaller model (e.g. qwen2.5:14b).",
          }],
        };
      }
      return { content: [{ type: "text", text: `Connection error: ${err.message}. Is Agent OS running on port 4000?` }] };
    } finally {
      clearTimeout(timeout);
    }
  }
);

// Tool 2 — Run pipeline (streams internally, returns summary when done)
server.tool(
  "run_pipeline",
  {
    topic: z.string(),
    model: z.string().optional(),
    pipelineType: z.enum(["content", "production", "sales", "full"]).optional(),
  },
  async ({ topic, model, pipelineType }) => {
    const controller = new AbortController();
    // Pipelines can take 10-30 minutes (multiple agent steps)
    const timeout = setTimeout(() => controller.abort(), 1800000); // 30 min

    try {
      const res = await fetch(AGENT_OS_URL + "/api/pipeline", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, model: model || "qwen2.5:14b", pipelineType }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const results = {};
      let finalTopic = topic;
      let lastError = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.replace("data: ", ""));
            if (data.type === "step_complete") results[data.agentId] = data.output;
            if (data.type === "complete") finalTopic = data.topic;
            if (data.type === "step_error" && data.fatal) lastError = data.message;
            if (data.type === "error") lastError = data.error;
          } catch {}
        }
      }

      if (lastError) {
        return { content: [{ type: "text", text: `Pipeline failed: ${lastError}` }] };
      }

      const summary = Object.entries(results).map(([agent, output]) =>
        `## ${agent.toUpperCase()}\n${output.substring(0, 800)}...`
      ).join("\n\n---\n\n");

      return {
        content: [{
          type: "text",
          text: `Pipeline complete for: **${finalTopic}**\n\n${summary}`,
        }],
      };
    } catch (err) {
      if (err.name === "AbortError") {
        return { content: [{ type: "text", text: "Pipeline timed out after 30 minutes." }] };
      }
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    } finally {
      clearTimeout(timeout);
    }
  }
);

// Tool 3 — Get agent memory and lessons
server.tool(
  "get_agent_memory",
  { agentId: ALL_AGENTS },
  async ({ agentId }) => {
    const res = await fetch(`${AGENT_OS_URL}/api/memory?agentId=${agentId}`);
    const data = await res.json();
    return {
      content: [{
        type: "text",
        text: `Memory for ${agentId}:\n\nMessages: ${data.conversations?.length || 0}\nLast active: ${data.lastActive || "Never"}\n\nRecent conversations:\n${
          data.conversations?.slice(-5).map(c =>
            `[${c.role}]: ${c.content.substring(0, 200)}`
          ).join("\n\n") || "None"
        }`,
      }],
    };
  }
);

// Tool 4 — Update agent instructions (saves to learning file, not source code)
server.tool(
  "update_agent_prompt",
  {
    agentId: ALL_AGENTS,
    newInstructions: z.string(),
  },
  async ({ agentId, newInstructions }) => {
    const fs = await import("fs");
    const learningFile = `C:/AI-Agents/agent-os/data/memory/${agentId}-claude-notes.txt`;
    const existing = fs.existsSync(learningFile)
      ? fs.readFileSync(learningFile, "utf-8")
      : "";
    const updated = existing + "\n\n[" + new Date().toISOString() + "]\n" + newInstructions;
    fs.writeFileSync(learningFile, updated);
    return {
      content: [{
        type: "text",
        text: `Instructions saved for ${agentId}. Will be applied on next task.\n\nAdded:\n${newInstructions}`,
      }],
    };
  }
);

// Tool 5 — Check agent communications
server.tool(
  "check_communications",
  {},
  async () => {
    const res = await fetch(AGENT_OS_URL + "/api/comms");
    const sessions = await res.json();
    if (!sessions.length) {
      return { content: [{ type: "text", text: "No pipeline sessions found. Run a pipeline first." }] };
    }
    const latest = sessions[0];
    const summary = `Latest pipeline: ${latest.topic}
Status: ${latest.status}
Duration: ${latest.duration || "unknown"}
Handoffs: ${latest.handoffs?.length || 0}

Handoff details:
${latest.handoffs?.map(h =>
  `${h.from} → ${h.to}: ${h.usedPreviousContext?.confidence || 0}% context use`
).join("\n") || "None"}`;
    return { content: [{ type: "text", text: summary }] };
  }
);

// Tool 6 — List available Ollama models
server.tool(
  "list_models",
  {},
  async () => {
    const res = await fetch(OLLAMA_URL + "/api/tags");
    const data = await res.json();
    const models = data.models?.map(m =>
      `- ${m.name} (${Math.round(m.size / 1e9 * 10) / 10}GB)`
    ).join("\n") || "No models found";
    return { content: [{ type: "text", text: "Available models:\n" + models }] };
  }
);

// Tool 7 — Build landing page
server.tool(
  "build_landing_page",
  {
    clientName: z.string(),
    niche: z.string(),
    headline: z.string().optional(),
    cta: z.string().optional(),
    color: z.string().optional(),
  },
  async ({ clientName, niche, headline, cta, color }) => {
    const res = await fetch(AGENT_OS_URL + "/api/landingpage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName, niche,
        headline: headline || "",
        cta: cta || "Book Your Free Strategy Call",
        color: color || "#f59e0b",
        darkMode: true,
        model: "qwen2.5:14b",
      }),
    });
    const data = await res.json();
    if (data.error) return { content: [{ type: "text", text: "Error: " + data.error }] };
    return {
      content: [{
        type: "text",
        text: `Landing page built!\n\nFilename: ${data.filename}\nSaved to: C:\\AI-Agents\\agent-os\\data\\workspace\\dev\\${data.filename}`,
      }],
    };
  }
);

// Tool 8 — Stop a process
server.tool(
  "stop_process",
  {
    processId: z.string().optional(),
    stopAll: z.boolean().optional(),
  },
  async ({ processId, stopAll }) => {
    const action = stopAll ? "stopAll" : "stop";
    await fetch(AGENT_OS_URL + "/api/processes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, processId }),
    });
    return {
      content: [{
        type: "text",
        text: stopAll ? "All processes stopped." : `Stop signal sent to process ${processId}.`,
      }],
    };
  }
);

// Tool 9 — List running processes
server.tool(
  "list_processes",
  {},
  async () => {
    const res = await fetch(AGENT_OS_URL + "/api/processes");
    const processes = await res.json();
    if (!processes.length) return { content: [{ type: "text", text: "No active processes." }] };
    const list = processes.map(p =>
      `[${p.status.toUpperCase()}] ${p.type}: ${p.description}\nID: ${p.id}\nStarted: ${new Date(p.startedAt).toLocaleTimeString()}`
    ).join("\n\n");
    return { content: [{ type: "text", text: list }] };
  }
);

// Tool 10 — Get pipeline output files by topic
// Searches every agent's workspace for files matching the topic slug
server.tool(
  "get_pipeline_output",
  {
    topic: z.string().describe("Topic or partial topic name to search for (e.g. 'lacrosse', 'highschool')"),
    agentId: ALL_AGENTS.optional().describe("Specific agent to retrieve output for (omit for full report)"),
  },
  async ({ topic, agentId }) => {
    const fs = await import("fs");
    const path = await import("path");

    const WORKSPACE = "C:/AI-Agents/agent-os/data/workspace";
    const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const agentsToSearch = agentId ? [agentId] : ["alex", "maya", "jordan", "dev", "sam", "luna", "iris", "rex", "nova", "pixel"];

    const found = [];

    for (const aid of agentsToSearch) {
      const dir = path.join(WORKSPACE, aid);
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.includes(slug) && f.endsWith(".md"));
      // Prefer full-pipeline file
      files.sort((a, b) => b.includes("full-pipeline") ? 1 : -1);
      for (const file of files.slice(0, 2)) {
        const content = fs.readFileSync(path.join(dir, file), "utf-8");
        found.push({ agent: aid, file, content });
      }
    }

    if (found.length === 0) {
      // List all available pipeline files to help user find what they need
      const allFiles = [];
      for (const aid of agentsToSearch) {
        const dir = path.join(WORKSPACE, aid);
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter(f => f.endsWith(".md")).slice(-5);
        files.forEach(f => allFiles.push(aid + "/" + f));
      }
      return {
        content: [{
          type: "text",
          text: `No pipeline output found for topic "${topic}" (searched for slug "${slug}").\n\nRecent pipeline files available:\n${allFiles.join("\n") || "None found"}`,
        }],
      };
    }

    // Return full-pipeline combined report if found, otherwise concatenate step files
    const fullReport = found.find(f => f.file.includes("full-pipeline"));
    if (fullReport) {
      return {
        content: [{
          type: "text",
          text: `Found combined pipeline report: ${fullReport.agent}/${fullReport.file}\n\n${fullReport.content}`,
        }],
      };
    }

    const combined = found.map(f => `### ${f.agent.toUpperCase()} — ${f.file}\n\n${f.content}`).join("\n\n---\n\n");
    return { content: [{ type: "text", text: combined }] };
  }
);

// Tool 11 — Get pipeline status (check if still running, completed, or failed)
server.tool(
  "get_pipeline_status",
  {
    topic: z.string().optional().describe("Topic to search for (searches recent sessions)"),
    sessionId: z.string().optional().describe("Exact session ID (e.g. pipeline-1234567890)"),
  },
  async ({ topic, sessionId }) => {
    try {
      const res = await fetch(AGENT_OS_URL + "/api/comms");
      const sessions = await res.json();

      let session = null;
      if (sessionId) {
        session = sessions.find(s => s.id === sessionId);
      } else if (topic) {
        const lower = topic.toLowerCase();
        session = sessions.find(s => s.topic && s.topic.toLowerCase().includes(lower));
      } else {
        session = sessions[0]; // Most recent
      }

      if (!session) {
        return {
          content: [{
            type: "text",
            text: `No session found${topic ? " for topic: " + topic : ""}.\n\nRecent sessions:\n${
              sessions.slice(0, 5).map(s => `- [${s.status}] "${s.topic}" (${s.id})`).join("\n") || "None"
            }`,
          }],
        };
      }

      const handoffSummary = session.handoffs?.map(h =>
        `  ${h.from} → ${h.to}: ${h.usedPreviousContext?.confidence || 0}% context usage`
      ).join("\n") || "  No handoffs recorded";

      const statusIcon = {
        complete: "✅",
        running: "⏳",
        stopped: "🛑",
        failed: "❌",
      }[session.status] || "❓";

      return {
        content: [{
          type: "text",
          text: `${statusIcon} Pipeline: "${session.topic}"
Status: ${session.status.toUpperCase()}
Session ID: ${session.id}
Started: ${session.startedAt}
${session.completedAt ? "Completed: " + session.completedAt : ""}
Duration: ${session.duration || "still running"}
Handoffs (${session.handoffs?.length || 0}):
${handoffSummary}

${session.status === "complete" ? "✅ Results saved. Use get_pipeline_output with topic \"" + session.topic + "\" to read the full report." : ""}
${session.status === "running" ? "⏳ Still running. Check back in a few minutes." : ""}
${session.status === "failed" ? "❌ Pipeline failed. Check step_error events for details." : ""}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: "Error fetching status: " + err.message }] };
    }
  }
);

// Tool 12 — Get agent learning / skill summary
server.tool(
  "get_agent_learning",
  { agentId: ALL_AGENTS },
  async ({ agentId }) => {
    const res = await fetch(`${AGENT_OS_URL}/api/reflect?agentId=${agentId}`);
    const data = await res.json();
    const wins = data.wins?.slice(-3).map(w => `✓ ${w.description}`).join("\n") || "None yet";
    const failures = data.failures?.slice(-3).map(f => `✗ ${f.description} → ${f.fix}`).join("\n") || "None yet";
    const refinements = data.refinements?.map(r => `→ ${r}`).join("\n") || "Not yet refined";
    return {
      content: [{
        type: "text",
        text: `Learning summary for ${agentId}:\n\nAvg score: ${data.avgScore || 0}/10\nTasks: ${data.taskCount || 0}\n\nWINS:\n${wins}\n\nFAILURES:\n${failures}\n\nSKILL UPGRADES:\n${refinements}`,
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
