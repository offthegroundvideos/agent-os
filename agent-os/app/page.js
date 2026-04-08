"use client";
import { useState, useEffect, useRef } from "react";
import { routeMessage as sharedRouteMessage } from "../lib/router";
import GHLPanel from "../components/GHLPanel";
import LandingPageBuilder from "../components/LandingPageBuilder";
import LearningPanel from "../components/LearningPanel";
import CommsMonitor from "../components/CommsMonitor";
import ProcessManager from "../components/ProcessManager";
import ChapterPanel from "../components/ChapterPanel";
import FootageLibrary from "../components/FootageLibrary";
import ViralResearchPanel from "../components/ViralResearchPanel";
import KpiPanel from "../components/KpiPanel";
import WorkflowControlPanel from "../components/WorkflowControlPanel";
import ContentOSPanel from "../components/ContentOSPanel";
import FunnelDashboardPanel from "../components/FunnelDashboardPanel";
import ContentCalendarPanel from "../components/ContentCalendarPanel";
import PublishQueuePanel from "../components/PublishQueuePanel";
import PublishIntegrationsPanel from "../components/PublishIntegrationsPanel";
import DeerFlowPanel from "../components/DeerFlowPanel";
import CloudflareOpsPanel from "../components/CloudflareOpsPanel";
import AuraPipelineModal from "../components/AuraPipelineModal";

const AGENTS = {
  alex: { name: "Alex", role: "Market Intelligence", color: "#3b82f6", icon: "🔍", shortcut: "/alex" },
  maya: { name: "Maya", role: "Creative Director", color: "#ec4899", icon: "✍️", shortcut: "/maya" },
  jordan: { name: "Jordan", role: "Growth Strategist", color: "#f59e0b", icon: "📈", shortcut: "/jordan" },
  dev: { name: "Dev", role: "Tech Lead", color: "#10b981", icon: "💻", shortcut: "/dev" },
  sam: { name: "Sam", role: "Social Media Director", color: "#8b5cf6", icon: "📱", shortcut: "/sam" },
  luna: { name: "Luna", role: "Lead Qualifier", color: "#06b6d4", icon: "🎯", shortcut: "/luna" },
  iris: { name: "Iris", role: "Visual Strategist", color: "#f97316", icon: "📸", shortcut: "/iris" },
  rex: { name: "Rex", role: "Sales Agent", color: "#84cc16", icon: "💼", shortcut: "/rex" },
  nova: { name: "Nova", role: "Client Success", color: "#e879f9", icon: "🌟", shortcut: "/nova" },
  pixel: { name: "Pixel", role: "Brand and Product", color: "#f472b6", icon: "🎨", shortcut: "/pixel" },
  ceo: { name: "Chief", role: "CEO — Executive Command", color: "#fbbf24", icon: "👔", shortcut: "/ceo" },
  cto: { name: "Arch", role: "CTO — Technical Command", color: "#22d3ee", icon: "🏗️", shortcut: "/cto" },
};

const SHORTCUTS_HELP = [
  { cmd: "/alex [task]", desc: "Research tasks" },
  { cmd: "/maya [task]", desc: "Content writing" },
  { cmd: "/jordan [task]", desc: "Strategy & growth" },
  { cmd: "/dev [task]", desc: "Coding tasks" },
  { cmd: "/sam [task]", desc: "Social media" },
  { cmd: "/luna [task]", desc: "Lead qualification" },
  { cmd: "/iris [task]", desc: "Shoot planning" },
  { cmd: "/rex [task]", desc: "Sales & proposals" },
  { cmd: "/nova [task]", desc: "Client success" },
  { cmd: "/pixel [task]", desc: "Brand & product" },
  { cmd: "/ceo [task]", desc: "Executive command" },
  { cmd: "/cto [task]", desc: "Tech & infra" },
  { cmd: "Run pipeline on [topic]", desc: "Run selected pipeline type" },
];

const EMPTY_PIPELINE_BRIEF = {
  clientName: "",
  niche: "",
  offer: "",
  targetAudience: "",
  geography: "",
  primaryGoal: "",
  platforms: "",
  notes: "",
};

function buildPipelinePromptFromBrief(brief = {}) {
  const lines = [
    brief.clientName ? `Client: ${brief.clientName}` : "",
    brief.niche ? `Niche: ${brief.niche}` : "",
    brief.offer ? `Primary offer: ${brief.offer}` : "",
    brief.targetAudience ? `Target audience: ${brief.targetAudience}` : "",
    brief.geography ? `Service area or geography: ${brief.geography}` : "",
    brief.primaryGoal ? `Primary business goal: ${brief.primaryGoal}` : "",
    brief.platforms ? `Priority platforms: ${brief.platforms}` : "",
    brief.notes ? `Specific research and execution notes: ${brief.notes}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

function buildPipelineBriefFromClient(client = {}, seed = "") {
  const onboarding = client?.onboarding_packet || {};
  const trimmedSeed = String(seed || "").trim();
  return {
    ...EMPTY_PIPELINE_BRIEF,
    clientName: client?.name || "",
    niche: trimmedSeed || client?.niche || onboarding?.niche || "",
    offer: client?.primary_offer || onboarding?.offerName || "",
    targetAudience: client?.target_audience || onboarding?.audience || "",
    geography: client?.service_area || [client?.city, client?.state].filter(Boolean).join(", "),
    primaryGoal: onboarding?.campaignGoal || "",
    platforms: Array.isArray(onboarding?.platforms) ? onboarding.platforms.join(", ") : "",
    notes: trimmedSeed || client?.research_summary || onboarding?.strategyNotes || "",
  };
}

function Dot({ color, pulse }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
      {pulse && (
        <span style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: color, opacity: 0.4,
          animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
        }} />
      )}
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "block" }} />
    </span>
  );
}

function inferAlexComposeMode(message = "") {
  const lower = String(message || "").toLowerCase().trim();
  if (!lower) return "fast";
  const heavyTerms = [
    "research", "analyze", "compare", "deep", "full plan", "full strategy", "roadmap",
    "architecture", "audit", "proposal", "funnel", "30/60/90", "business review",
    "technical command", "system health", "platform split", "competitor", "viral",
  ];
  const isHeavy = heavyTerms.some((term) => lower.includes(term));
  const shortEnough = lower.length <= 220 && !lower.includes("\n");
  return shortEnough && !isHeavy ? "fast" : "standard";
}

function AgentCard({ agentId, agent, active, messageCount, lastActive, onSelect, isTyping, compact = false }) {
  return (
    <div
      onClick={() => onSelect(agentId)}
      style={{
        minWidth: compact ? 154 : undefined,
        width: compact ? 154 : "auto",
        background: active ? `linear-gradient(180deg, ${agent.color}20, rgba(255,255,255,0.03))` : "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
        border: "1px solid " + (active ? agent.color + "55" : "rgba(255,255,255,0.06)"),
        borderRadius: 14, padding: 14, cursor: "pointer",
        transition: "all 0.2s",
        boxShadow: active ? "0 12px 30px " + agent.color + "18, inset 0 1px 0 rgba(255,255,255,0.04)" : "inset 0 1px 0 rgba(255,255,255,0.03)",
        transform: active ? "translateY(-1px)" : "translateY(0px)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{agent.icon}</span>
          <div>
            <div style={{
              fontFamily: "Orbitron, sans-serif", fontSize: 12, fontWeight: 700,
              color: active ? agent.color : "#e2e2e8", letterSpacing: "0.05em",
            }}>{agent.name}</div>
            <div style={{ fontSize: 9, color: "#6f7483", marginTop: 1, lineHeight: 1.4 }}>{agent.role}</div>
          </div>
        </div>
        <Dot color={isTyping ? "#fbbf24" : agent.color} pulse={isTyping} />
      </div>
      <div style={{
        display: "flex", gap: 12,
        borderTop: "1px solid rgba(255,255,255,0.05)",
        paddingTop: 8, marginTop: 4,
      }}>
        <div>
          <div style={{ fontSize: 9, color: "#6a7080", letterSpacing: "0.12em" }}>MSGS</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: agent.color }}>{messageCount}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#6a7080", letterSpacing: "0.12em" }}>LAST ACTIVE</div>
          <div style={{ fontSize: 9, color: "#a0a5b3" }}>
            {lastActive ? new Date(lastActive).toLocaleTimeString() : "Never"}
          </div>
        </div>
      </div>
      {active && (
        <div style={{ marginTop: 8, fontSize: 9, color: agent.color, letterSpacing: "0.15em" }}>
          ▶ ACTIVE
        </div>
      )}
    </div>
  );
}

function ChatMessage({ msg, compact = false }) {
  const isUser = msg.role === "user";
  const agent = msg.agentId ? AGENTS[msg.agentId] : null;
  const responseModeLabel = msg.chatMode === "fast"
    ? "FAST"
    : msg.chatMode === "standard"
      ? "DEEP"
      : null;
  return (
    <div style={{
      display: "flex", justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 18, animation: "slide-in 0.24s ease",
    }}>
      <div style={{
        maxWidth: compact ? "100%" : isUser ? "76%" : "82%",
        background: isUser
          ? "linear-gradient(180deg, rgba(245,158,11,0.18), rgba(245,158,11,0.08))"
          : (agent ? `radial-gradient(circle at top left, ${agent.color}14, transparent 44%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.018))` : "#88888812"),
        border: "1px solid " + (isUser ? "rgba(245,158,11,0.24)" : (agent ? agent.color + "28" : "#33333333")),
        borderRadius: 20, padding: "15px 17px 14px",
        boxShadow: isUser
          ? "0 18px 36px rgba(245,158,11,0.08), inset 0 1px 0 rgba(255,255,255,0.04)"
          : "0 18px 36px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.04)",
        backdropFilter: "blur(12px)",
        animation: "transcript-glow 5s ease-in-out infinite",
      }}>
        {!isUser && agent && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
            paddingBottom: 9,
            borderBottom: "1px solid rgba(255,255,255,0.05)",
          }}>
            <div style={{
              fontSize: 10, color: agent.color,
              fontFamily: "Orbitron, sans-serif",
              letterSpacing: "0.14em",
            }}>
              {agent.icon} {agent.name.toUpperCase()}
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}>
              {responseModeLabel && (
                <span style={{
                  fontSize: 9,
                  color: "#9fc2ff",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  padding: "4px 7px",
                  borderRadius: 999,
                  border: "1px solid rgba(59,130,246,0.2)",
                  background: "rgba(59,130,246,0.08)",
                }}>
                  {responseModeLabel}
                </span>
              )}
              {msg.delegated && (
                <span style={{
                  fontSize: 9,
                  color: "#f5b24b",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  padding: "4px 7px",
                  borderRadius: 999,
                  border: "1px solid rgba(245,158,11,0.2)",
                  background: "rgba(245,158,11,0.08)",
                }}>
                  DEERFLOW
                </span>
              )}
              <span style={{
                fontSize: 9,
                color: "#7d8798",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                display: compact ? "none" : "block",
              }}>
                {agent.role}
              </span>
            </div>
          </div>
        )}
        {isUser && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, paddingBottom: 9, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ fontSize: 10, color: "#f59e0b", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              YOU → {msg.routedTo ? (AGENTS[msg.routedTo] ? AGENTS[msg.routedTo].name.toUpperCase() : "AUTO") : "AUTO"}
            </span>
            <span style={{ fontSize: 9, color: "#8e97a8", letterSpacing: "0.12em", textTransform: "uppercase", display: compact ? "none" : "inline" }}>
              operator input
            </span>
          </div>
        )}
        <div style={{
          fontSize: 13, color: "#edf2fb", lineHeight: 1.78,
          whiteSpace: "pre-wrap", wordBreak: "break-word", textWrap: "pretty",
        }}>
          {msg.content}
        </div>
        <div style={{ fontSize: 9, color: "#6f7483", marginTop: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {new Date(msg.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

function getPipelineStepsMap(pipelineType, pipelineTypes) {
  const selected = pipelineTypes?.[pipelineType] || pipelineTypes?.content;
  const agentIds = selected?.steps || [];
  return agentIds.map((agentId) => ({
    agentId,
    label: AGENTS[agentId]?.role || agentId,
  }));
}

function PipelineModal({ pipeline, onClose, onStop, streamingTokens, onMinimize, pipelineTypes, onOpenLandingPage, onOpenGhlPages }) {
  const visibleSteps = getPipelineStepsMap(pipeline?.pipelineType, pipelineTypes);
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 24,
    }}>
      <div style={{
        background: "#0d0d14",
        border: "1px solid rgba(245,158,11,0.3)",
        borderRadius: 4, width: "100%", maxWidth: 860,
        maxHeight: "90vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 0 60px rgba(245,158,11,0.1)",
      }}>
        <div style={{
          padding: "14px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{
              fontFamily: "Orbitron, sans-serif", fontSize: 13, fontWeight: 700,
              color: "#f59e0b", letterSpacing: "0.14em",
            }}>PIPELINE EXECUTION</div>
            <div style={{ fontSize: 11, color: "#52525e", marginTop: 2 }}>{pipeline.topic}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onMinimize} style={{
                  background: "rgba(245,158,11,0.1)",
                  border: "1px solid rgba(245,158,11,0.3)",
                  color: "#f59e0b", padding: "4px 14px",
                  borderRadius: 2, cursor: "pointer",
                  fontSize: 11, fontFamily: "Orbitron, sans-serif",
                  letterSpacing: "0.1em", marginRight: 4,
                }}>— MIN</button>
              {pipeline && pipeline.status === "running" && (
                <button onClick={onStop} style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.4)",
                  color: "#ef4444", padding: "4px 14px",
                  borderRadius: 2, cursor: "pointer",
                  fontSize: 11, fontFamily: "Orbitron, sans-serif",
                  letterSpacing: "0.1em",
                }}>⏹ STOP</button>
              )}
              <button onClick={onClose} style={{
                background: "transparent", border: "1px solid #333",
                color: "#888", padding: "4px 12px", borderRadius: 2,
                cursor: "pointer", fontSize: 11, fontFamily: "JetBrains Mono",
              }}>✕ Close</button>
            </div>
        </div>

        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", gap: 0, alignItems: "center" }}>
            {visibleSteps.map((step, i) => {
              const agent = AGENTS[step.agentId];
              const result = pipeline?.steps && pipeline.steps[step.agentId];
              const isCurrent = pipeline.currentStep === step.agentId;
              const isDone = result && result.status === "complete";
              const isError = result && result.status === "error";
              return (
                <div key={step.agentId} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <div style={{
                    flex: 1, padding: "10px 8px",
                    background: isDone ? agent.color + "18" : isCurrent ? agent.color + "12" : "rgba(255,255,255,0.02)",
                    border: "1px solid " + (isDone ? agent.color + "55" : isCurrent ? agent.color + "44" : "rgba(255,255,255,0.06)"),
                    borderRadius: 3, textAlign: "center",
                  }}>
                    <div style={{ fontSize: 18 }}>{agent.icon}</div>
                    <div style={{
                      fontFamily: "Orbitron, sans-serif", fontSize: 9, fontWeight: 700,
                      color: isDone ? agent.color : isCurrent ? agent.color : "#555", marginTop: 4,
                    }}>{agent.name}</div>
                    <div style={{ fontSize: 9, color: "#444", marginTop: 2 }}>{step.label}</div>
                    <div style={{ marginTop: 4 }}>
                      {isDone && <span style={{ fontSize: 10, color: "#10b981" }}>✓ Done</span>}
                      {isCurrent && !isDone && <span style={{ fontSize: 10, color: agent.color }}>⟳ Working</span>}
                      {isError && <span style={{ fontSize: 10, color: "#ef4444" }}>✕ Error</span>}
                      {!isDone && !isCurrent && !isError && <span style={{ fontSize: 10, color: "#333" }}>○ Waiting</span>}
                    </div>
                  </div>
                  {i < visibleSteps.length - 1 && (
                    <div style={{ width: 20, textAlign: "center", color: "#333", fontSize: 12 }}>→</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {(pipeline.handoffs || []).length > 0 && (
            <div style={{
              marginBottom: 16,
              padding: 14,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(245,158,11,0.16)",
              borderRadius: 4,
            }}>
              <div style={{
                fontFamily: "Orbitron, sans-serif",
                fontSize: 10,
                color: "#f59e0b",
                letterSpacing: "0.1em",
                marginBottom: 10,
              }}>
                LIVE HANDOFFS
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {(pipeline.handoffs || []).slice(-6).map((handoff, index) => (
                  <div key={`${handoff.from}-${handoff.to}-${index}`} style={{ fontSize: 11, color: "#bbb", lineHeight: 1.6 }}>
                    <span style={{ color: AGENTS[handoff.from]?.color || "#999" }}>{AGENTS[handoff.from]?.name || handoff.from}</span>
                    {" -> "}
                    <span style={{ color: AGENTS[handoff.to]?.color || "#999" }}>{handoff.toName || AGENTS[handoff.to]?.name || handoff.to}</span>
                    {" · "}
                    <span style={{ color: "#777" }}>{handoff.wordCount || 0} words</span>
                    {handoff.hasStructuredHandoff ? <span style={{ color: "#10b981" }}> · structured</span> : <span style={{ color: "#f59e0b" }}> · narrative</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {visibleSteps.map(step => {
            const result = pipeline?.steps && pipeline.steps[step.agentId];
            if (!result) return null;
            const agent = AGENTS[step.agentId];
            return (
              <div key={step.agentId} style={{ marginBottom: 20 }}>
                <div style={{
                  fontFamily: "Orbitron, sans-serif", fontSize: 10,
                  color: agent.color, letterSpacing: "0.1em", marginBottom: 8,
                }}>
                  {agent.icon} {agent.name.toUpperCase()} — {step.label.toUpperCase()}
                </div>
                <div style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid " + agent.color + "22",
                  borderRadius: 3, padding: 14,
                  fontSize: 12, color: "#ccc", lineHeight: 1.7,
                  whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto",
                  position: "relative",
                }}>
                  {result.output || result.error || "..."}
                </div>
              </div>
            );
          })}
          {pipeline.status === "running" && pipeline.currentStep && streamingTokens && streamingTokens[pipeline.currentStep] !== null && (
            <div style={{
              marginTop: 12,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid " + (AGENTS[pipeline.currentStep]?.color || "#888") + "33",
              borderRadius: 6, padding: 16,
            }}>
              <div style={{
                fontFamily: "Orbitron, sans-serif", fontSize: 10,
                color: AGENTS[pipeline.currentStep]?.color || "#888",
                letterSpacing: "0.1em", marginBottom: 10,
                display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{
                    display: "inline-block", width: 6, height: 6,
                    borderRadius: "50%",
                    background: AGENTS[pipeline.currentStep]?.color || "#888",
                    animation: "ping 1s infinite",
                  }} />
                {AGENTS[pipeline.currentStep]?.icon} {AGENTS[pipeline.currentStep]?.name} IS THINKING...
              </div>
              {pipeline.stepStatus?.[pipeline.currentStep] && (
                <div style={{
                  fontSize: 11,
                  color: "#a1a1aa",
                  marginBottom: 10,
                  lineHeight: 1.5,
                }}>
                  {pipeline.stepStatus[pipeline.currentStep]}
                </div>
              )}
              <div style={{
                fontSize: 12, color: "#888", lineHeight: 1.7,
                whiteSpace: "pre-wrap", maxHeight: 200,
                overflow: "auto", fontFamily: "JetBrains Mono",
              }}>
                {streamingTokens[pipeline.currentStep] || "..."}
                <span style={{
                  display: "inline-block", width: 2, height: 14,
                  background: AGENTS[pipeline.currentStep]?.color || "#888",
                  marginLeft: 2, verticalAlign: "middle",
                  animation: "ping 1s infinite",
                }} />
              </div>
            </div>
          )}
          {pipeline.status === "complete" && (
            <div style={{
              textAlign: "center", color: "#10b981", fontSize: 12,
              padding: 14, border: "1px solid #10b98133", borderRadius: 3, background: "#10b98108",
            }}>
              ✓ Pipeline complete — all outputs saved to agent workspaces
              {pipeline.calendarEntryCount ? ` · ${pipeline.calendarEntryCount} calendar entr${pipeline.calendarEntryCount === 1 ? "y" : "ies"} created` : ""}
              <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <button
                  onClick={() => onOpenLandingPage?.(pipeline.assetId || "")}
                  style={{
                    padding: "8px 14px",
                    background: "rgba(16,185,129,0.12)",
                    border: "1px solid rgba(16,185,129,0.35)",
                    borderRadius: 3,
                    color: "#10b981",
                    fontFamily: "Orbitron, sans-serif",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                  }}
                >
                  BUILD LANDING PAGE
                </button>
                <button
                  onClick={() => onOpenGhlPages?.(pipeline.assetId || "")}
                  style={{
                    padding: "8px 14px",
                    background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.35)",
                    borderRadius: 3,
                    color: "#f59e0b",
                    fontFamily: "Orbitron, sans-serif",
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                  }}
                >
                  OPEN GHL PAGE BRIEF
                </button>
              </div>
            </div>
          )}
          {pipeline.status === "stopped" && (
            <div style={{
              textAlign: "center", color: "#ef4444", fontSize: 12,
              padding: 14, border: "1px solid rgba(239,68,68,0.3)", borderRadius: 3,
              background: "rgba(239,68,68,0.08)",
            }}>
              ⏹ Pipeline stopped by user
            </div>
          )}
          {pipeline.status === "stopping" && (
            <div style={{
              textAlign: "center", color: "#f59e0b", fontSize: 12,
              padding: 14, border: "1px solid rgba(245,158,11,0.3)", borderRadius: 3,
              background: "rgba(245,158,11,0.08)",
            }}>
              ⟳ Stopping after current step completes...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MissionControl() {
  const [activeAgent, setActiveAgent] = useState("alex");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [typingAgent, setTypingAgent] = useState(null);
  const [memorySummary, setMemorySummary] = useState({});
  const [pipeline, setPipeline] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [time, setTime] = useState(new Date());

  const TEAM = {
    jack: { name: "Jack", full: "Jack Riggs", color: "#f59e0b", icon: "🎬", role: "Creative Director" },
    jake: { name: "Jake", full: "Jake Evans", color: "#3b82f6", icon: "💻", role: "Developer" },
    swope: { name: "Swope", full: "Swope", color: "#10b981", icon: "⚙", role: "Backend Dev · Editor" },
    teja: { name: "Teja", full: "Teja", color: "#8b5cf6", icon: "🎞", role: "Video · Editor · Dev" },
    michelle: { name: "Michelle", full: "Michelle Elmore", color: "#f472b6", icon: "🎨", role: "Photographer · Product · Ads" },
  };
  const [model, setModel] = useState("qwen2.5:14b");
  const [alexChatMode, setAlexChatMode] = useState("fast");
  const [alexChatModeLocked, setAlexChatModeLocked] = useState(false);
  const [showGHL, setShowGHL] = useState(false);
  const [showLandingPage, setShowLandingPage] = useState(false);
  const [ghlInitialTab, setGhlInitialTab] = useState("clients");
  const [ghlAssetId, setGhlAssetId] = useState("");
  const [landingPageAssetId, setLandingPageAssetId] = useState("");
  const [showLearning, setShowLearning] = useState(false);
  const [showComms, setShowComms] = useState(false);
  const [showProcesses, setShowProcesses] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [showFootage, setShowFootage] = useState(false);
  const [showViralResearch, setShowViralResearch] = useState(false);
  const [showKpis, setShowKpis] = useState(false);
  const [showFunnelDashboard, setShowFunnelDashboard] = useState(false);
  const [showWorkflowControls, setShowWorkflowControls] = useState(false);
  const [showContentOS, setShowContentOS] = useState(false);
  const [showContentCalendar, setShowContentCalendar] = useState(false);
  const [showPublishQueue, setShowPublishQueue] = useState(false);
  const [showPublishIntegrations, setShowPublishIntegrations] = useState(false);
  const [showDeerFlow, setShowDeerFlow] = useState(false);
  const [showCloudflareOps, setShowCloudflareOps] = useState(false);
  const [activeUser, setActiveUser] = useState(null);
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);

  const [streamingTokens, setStreamingTokens] = useState({});
  const [pipelineMinimized, setPipelineMinimized] = useState(false);
  const [selectedPipelineType, setSelectedPipelineType] = useState("content");
  const [viewportWidth, setViewportWidth] = useState(1440);

  const PIPELINE_TYPES = {
    content: { id: "content", label: "Content", icon: "✍️", color: "#ec4899", description: "Research → Scripts → Social → Strategy", steps: ["alex","maya","sam","jordan"] },
    production: { id: "production", label: "Production", icon: "🎬", color: "#f97316", description: "Research → Shoot Plan → Scripts → Social", steps: ["alex","iris","maya","sam"] },
    sales: { id: "sales", label: "Sales", icon: "💼", color: "#84cc16", description: "Qualify → Proposal → Client Plan", steps: ["luna","rex","nova"] },
    full: { id: "full", label: "Full Agency", icon: "⚡", color: "#8b5cf6", description: "Complete package — research to proposal", steps: ["alex","iris","maya","sam","jordan","rex"] },
  };
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const agentAbortRef = useRef(null);
  const agentPollRef = useRef(null);
  const autoAttachedPipelineAssetRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  const [agentRunning, setAgentRunning] = useState(false);
  const [showPipelinePrompt, setShowPipelinePrompt] = useState(false);
  const [pipelineInput, setPipelineInput] = useState("");
  const [pipelineBrief, setPipelineBrief] = useState(EMPTY_PIPELINE_BRIEF);
  const [pipelineActiveClient, setPipelineActiveClient] = useState(null);
  const [autoJobsStatus, setAutoJobsStatus] = useState([]);
  const [autoJobsMode, setAutoJobsMode] = useState("manual");
  const [autoJobsRunning, setAutoJobsRunning] = useState(false);

  const routeMessage = (msg) => {
    const routed = sharedRouteMessage(msg);
    if (routed?.method === "default" && activeAgent) {
      return { agentId: activeAgent, cleanMsg: routed.message || msg };
    }
    return { agentId: routed.agentId, cleanMsg: routed.message || msg };
  };

  const currentComposeRoute = input.trim()
    ? routeMessage(input.trim())
    : { agentId: activeAgent, cleanMsg: input };
  const showAlexModeControl = currentComposeRoute?.agentId === "alex" || activeAgent === "alex";
  const suggestedAlexMode = currentComposeRoute?.agentId === "alex"
    ? inferAlexComposeMode(input.trim())
    : "fast";

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (!messages.length) {
      lastMessageCountRef.current = 0;
      return;
    }
    const hasNewMessage = messages.length > lastMessageCountRef.current;
    lastMessageCountRef.current = messages.length;
    if (!hasNewMessage) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: lastMessageCountRef.current > 1 ? "smooth" : "auto",
      block: "end",
    });
  }, [messages.length]);

  useEffect(() => {
    if (!showPipelinePrompt) return;
    const composed = buildPipelinePromptFromBrief(pipelineBrief);
    if (pipelineInput !== composed) setPipelineInput(composed);
  }, [pipelineBrief, pipelineInput, showPipelinePrompt]);

  useEffect(() => {
    if (!showAlexModeControl) return;
    if (currentComposeRoute?.agentId !== "alex") return;
    if (!input.trim()) {
      if (!alexChatModeLocked && alexChatMode !== "fast") setAlexChatMode("fast");
      return;
    }
    if (alexChatModeLocked) return;
    if (alexChatMode !== suggestedAlexMode) setAlexChatMode(suggestedAlexMode);
  }, [
    alexChatMode,
    alexChatModeLocked,
    currentComposeRoute?.agentId,
    input,
    showAlexModeControl,
    suggestedAlexMode,
  ]);

  useEffect(() => { loadMemorySummary(); }, []);

  useEffect(() => {
    if (pipeline?.status !== "complete" || !pipeline?.assetId) return;
    if (autoAttachedPipelineAssetRef.current === pipeline.assetId) return;
    autoAttachedPipelineAssetRef.current = pipeline.assetId;
    autoAttachPipelinePacketToActiveClient(pipeline.assetId);
  }, [pipeline?.status, pipeline?.assetId]);

  useEffect(() => {
    const loadAutoJobSettings = async () => {
      try {
        const res = await fetch("/api/autojobs?action=settings");
        const settings = await res.json();
        setAutoJobsMode(settings?.mode === "idle" ? "idle" : "manual");
      } catch {}
    };
    loadAutoJobSettings();
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (!e.target.closest("[data-tools-menu]")) setShowToolsMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Auto-jobs scheduler — checks every 5 minutes for due background tasks
  useEffect(() => {
    if (autoJobsMode !== "idle") return;
    const checkJobs = async () => {
      try {
        const res = await fetch("/api/autojobs");
        const status = await res.json();
        setAutoJobsStatus(status);
        const due = status.filter(j => j.isDue);
        if (due.length > 0 && !autoJobsRunning && !loading && !pipeline) {
          setAutoJobsRunning(true);
          try {
            await fetch("/api/autojobs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "run-due" }),
            });
            // Refresh status after running
            const updated = await fetch("/api/autojobs");
            setAutoJobsStatus(await updated.json());
            loadMemorySummary();
          } catch (e) { console.error("Auto-job error:", e); }
          finally { setAutoJobsRunning(false); }
        }
      } catch {}
    };
    checkJobs();
    const interval = setInterval(checkJobs, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoJobsMode, loading, pipeline]);

  const runAutoJob = async (agentId) => {
    setAutoJobsRunning(true);
    try {
      const res = await fetch("/api/autojobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-one", agentId }),
      });
      const result = await res.json();
      if (result.success) {
        setMessages(prev => [...prev, {
          role: "assistant", agentId, content: `🤖 **Auto-task complete: ${result.jobName}**\n\n${result.output}`,
          timestamp: new Date().toISOString(), auto: true,
        }]);
      }
      const updated = await fetch("/api/autojobs");
      setAutoJobsStatus(await updated.json());
      loadMemorySummary();
    } catch (e) { console.error("Auto-job error:", e); }
    finally { setAutoJobsRunning(false); }
  };

  const toggleAutoJobMode = async () => {
    const nextMode = autoJobsMode === "idle" ? "manual" : "idle";
    try {
      const res = await fetch("/api/autojobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-mode", mode: nextMode }),
      });
      const settings = await res.json();
      setAutoJobsMode(settings?.mode === "idle" ? "idle" : "manual");
      const updated = await fetch("/api/autojobs");
      setAutoJobsStatus(await updated.json());
    } catch (e) {
      console.error("Auto-job mode update failed:", e);
    }
  };

  const loadMemorySummary = async () => {
    try {
      const res = await fetch("/api/memory?action=summary");
      const data = await res.json();
      const map = {};
      data.forEach(d => { map[d.agentId] = d; });
      setMemorySummary(map);
    } catch(e) {}
  };

  const autoAttachPipelinePacketToActiveClient = async (assetId) => {
    if (!assetId) return;
    try {
      const activeRes = await fetch("/api/clients?action=active");
      const activeData = await activeRes.json();
      if (!activeRes.ok || !activeData?.active?.id) {
        setPipeline(prev => prev ? ({
          ...prev,
          ghlAutoAttach: {
            status: "skipped",
            message: "No active GHL client selected. Pipeline packet stayed local.",
          },
        }) : prev);
        return;
      }

      const attachRes = await fetch("/api/ghl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "attachResearchPacket",
          clientId: activeData.active.id,
          data: { assetId },
        }),
      });
      const attachData = await attachRes.json();
      if (!attachRes.ok || attachData.error) {
        throw new Error(attachData.error || "Failed to attach pipeline packet to GHL");
      }

      setPipeline(prev => prev ? ({
        ...prev,
        ghlAutoAttach: {
          status: "attached",
          clientName: attachData.client?.name || activeData.active.name,
          message: attachData.message || "Pipeline packet attached to the active GHL client.",
        },
      }) : prev);
    } catch (error) {
      setPipeline(prev => prev ? ({
        ...prev,
        ghlAutoAttach: {
          status: "error",
          message: error.message,
        },
      }) : prev);
    }
  };

  const openPipelineBrief = async (seed = "") => {
    const trimmed = String(seed || "").trim();
    let nextBrief = {
      ...EMPTY_PIPELINE_BRIEF,
      niche: trimmed,
      notes: trimmed,
    };
    setPipelineActiveClient(null);

    try {
      const res = await fetch("/api/clients?action=active");
      const data = await res.json();
      if (res.ok && data?.active) {
        setPipelineActiveClient(data.active);
        nextBrief = buildPipelineBriefFromClient(data.active, trimmed);
      }
    } catch {}

    setPipelineInput(buildPipelinePromptFromBrief(nextBrief));
    setPipelineBrief(nextBrief);
    setShowPipelinePrompt(true);
  };

  const submitPipelineBrief = () => {
    const prompt = buildPipelinePromptFromBrief(pipelineBrief).trim();
    if (!prompt) return;
    setPipelineInput(prompt);
    setShowPipelinePrompt(false);
    setPipelineActiveClient(null);
    runPipeline(prompt, selectedPipelineType);
  };

  const detectPipelineIntent = (userInput) => {
    const pipelinePatterns = [
      /^run\s+(full\s+)?pipeline\s+on\s+/i,
      /^pipeline\s+on\s+/i,
      /^run\s+(the\s+)?(content|production|sales|full)\s+pipeline\s+(on|for|about)\s+/i,
      /^start\s+(a\s+)?(full\s+)?pipeline\s+(on|for|about)\s+/i,
      /^(do|run)\s+(a\s+)?(full|complete|entire)\s+(pipeline|workflow|process)\s+(on|for|about)\s+/i,
    ];
    const pipelineMatch = pipelinePatterns.find((pattern) => pattern.test(userInput));
    const lower = userInput.toLowerCase();
    let detectedType = selectedPipelineType;
    if (lower.includes("sales")) detectedType = "sales";
    else if (lower.includes("production")) detectedType = "production";
    else if (lower.includes("full") || lower.includes("complete") || lower.includes("entire")) detectedType = "full";
    else if (lower.includes("content")) detectedType = "content";

    if (pipelineMatch) {
      return {
        matched: true,
        topic: userInput.replace(pipelineMatch, "").trim(),
        detectedType,
      };
    }

    if (lower.includes("pipeline") || lower.includes("workflow")) {
      return {
        matched: true,
        topic: userInput,
        detectedType,
      };
    }

    return { matched: false, topic: "", detectedType: selectedPipelineType };
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userInput = input.trim();
    setInput("");
    setAlexChatModeLocked(false);

    // Detect pipeline triggers — flexible phrasing
    const pipelineIntent = detectPipelineIntent(userInput);
    if (pipelineIntent.matched) {
      setSelectedPipelineType(pipelineIntent.detectedType);
      openPipelineBrief(pipelineIntent.topic);
      return;
    }

    const { agentId, cleanMsg } = routeMessage(userInput);
    setMessages(prev => [...prev, {
      role: "user", content: userInput,
      timestamp: new Date().toISOString(), routedTo: agentId,
    }]);
    setLoading(true);
    setTypingAgent(agentId);

   setActiveAgent(agentId);
    	agentAbortRef.current = new AbortController();



   	setAgentRunning(true);
   let currentProcessId = "agent-" + agentId + "-" + Date.now();
    let pollCount = 0;
    let stoppedByPoll = false;
    agentPollRef.current = setInterval(async () => {
      pollCount++;
      if (pollCount > 60) { clearInterval(agentPollRef.current); return; } // Max 60 seconds
      try {
        const r = await fetch("/api/processes");
        const procs = await r.json();
        console.log("Polling:", currentProcessId, procs.map(p => p.id + "=" + p.status));
        const match = procs.find(p =>
          p.id === currentProcessId &&
          (p.status === "killed" || p.status === "stopping" || p.status === "stopped")
        );
        console.log("Looking for exact:", currentProcessId, "Match:", match ? "FOUND" : "not found");
        if (match) {
          stoppedByPoll = true;
          clearInterval(agentPollRef.current);
          agentPollRef.current = null;
          if (agentAbortRef.current) {
            agentAbortRef.current.abort();
            agentAbortRef.current = null;
          }
          setLoading(false);
          setTypingAgent(null);
          setAgentRunning(false);
          setMessages(prev => [...prev, {
            role: "assistant",
            content: "⏹ Task stopped by user.",
            agentId,
            timestamp: new Date().toISOString(),
            stopped: true,
          }]);
        }
      } catch {}
    }, 1000);
    try {
      const res = await fetch("/api/agent", {
 	       method: "POST",
     	    signal: agentAbortRef.current.signal,
    	     headers: { "Content-Type": "application/json" },
     	    body: JSON.stringify({
            agentId,
            message: cleanMsg,
            model,
            processId: currentProcessId,
            chatModeOverride: agentId === "alex" ? alexChatMode : undefined,
          }),
      });



      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Use the exact processId the server registered
      if (data.processId) { currentProcessId = data.processId; }
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.stopped ? "⏹ Task stopped by user." : data.reply,
        agentId,
        timestamp: new Date().toISOString(),
        stopped: data.stopped || false,
        chatMode: data.chatMode || null,
        model: data.model || null,
        delegated: data.delegated || false,
      }]);
      loadMemorySummary();
    } catch (err) {
      if (err.name === "AbortError") {
        if (!stoppedByPoll) {
          setMessages(prev => [...prev, {
            role: "assistant",
            content: "⏹ Task stopped by user.",
            agentId, timestamp: new Date().toISOString(),
            stopped: true,
          }]);
        }
      } else {
        setMessages(prev => [...prev, {
          role: "assistant", content: "Error: " + err.message,
          agentId, timestamp: new Date().toISOString(),
        }]);
      }
    } finally {
      clearInterval(agentPollRef.current);
      agentPollRef.current = null;
      setLoading(false);
      setTypingAgent(null);
      setAgentRunning(false);
      agentAbortRef.current = null;
    }
  };

  const stopAgent = () => {
    if (agentAbortRef.current) {
      agentAbortRef.current.abort();
      agentAbortRef.current = null;
    }
  };

  const stopPipeline = async () => {
    if (!pipeline?.processId) return;
    try {
      await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", processId: pipeline.processId }),
      });
      setPipeline(prev => ({ ...prev, status: "stopping" }));
    } catch (e) {
      console.error("Stop failed:", e);
    }
  };

  const stopAgentProcess = async (processId) => {
    // Abort frontend fetch if it matches current agent call
    if (processId && processId.startsWith("agent-") && agentAbortRef.current) {
      agentAbortRef.current.abort();
      agentAbortRef.current = null;
    }
    try {
      await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "forceKill", processId }),
      });
    } catch {}
  };

  const handleReopenProcess = (process) => {
    setShowProcesses(false);
    if (process.type === 'pipeline') {
      const isStopped = process.status === 'stopped' || process.status === 'killed' || process.status === 'failed';
      if (isStopped && process.pipelineTopic) {
        // Resume pipeline from where it left off
        resumePipeline(process);
      } else if (pipelineMinimized) {
        setPipelineMinimized(false);
      } else if (!pipeline) {
        const topic = process.description.replace(/^Pipeline:\s*/i, '');
        setPipeline({ topic, status: 'running', steps: {}, currentStep: null, processId: process.id });
      }
    } else if (process.type === 'agent') {
      const agentId = process.id.split('-')[1];
      if (agentId && AGENTS[agentId]) setActiveAgent(agentId);
    }
  };

  const stopAllProcesses = async () => {
    try {
      await fetch("/api/processes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stopAll" }),
      });
      setPipeline(prev => prev ? { ...prev, status: "stopping" } : null);
    } catch (e) {
      console.error("Stop all failed:", e);
    }
  };

  const applyPipelineEvent = (data) => {
    if (data.type === "step_start") {
      setPipeline(prev => prev ? {
        ...prev,
        currentStep: data.agentId,
        steps: {
          ...(prev.steps || {}),
          [data.agentId]: {
            ...(prev.steps?.[data.agentId] || {}),
            status: "running",
            output: prev.steps?.[data.agentId]?.output || "",
            model: data.model || prev.steps?.[data.agentId]?.model || null,
          },
        },
        stepStatus: {
          ...(prev.stepStatus || {}),
          [data.agentId]: data.message || `Starting ${data.agentName}...`,
        },
      } : prev);
      setStreamingTokens(prev => ({ ...prev, [data.agentId]: "" }));
      return;
    }
    if (data.type === "status" || data.type === "retry") {
      setPipeline(prev => prev ? {
        ...prev,
        stepStatus: {
          ...(prev.stepStatus || {}),
          [data.agentId]: data.message || prev.stepStatus?.[data.agentId] || "",
        },
      } : prev);
      return;
    }
    if (data.type === "token") {
      setPipeline(prev => prev ? ({
        ...prev,
        steps: {
          ...(prev.steps || {}),
          [data.agentId]: {
            ...(prev.steps?.[data.agentId] || {}),
            status: "running",
            output: (prev.steps?.[data.agentId]?.output || "") + data.token,
          },
        },
      }) : prev);
      setStreamingTokens(prev => ({
        ...prev,
        [data.agentId]: (prev[data.agentId] || "") + data.token
      }));
      return;
    }
    if (data.type === "start") {
      setPipeline(prev => prev ? ({
        ...prev,
        processId: data.processId,
        assetId: data.assetId || prev.assetId || null,
      }) : prev);
      return;
    }
    if (data.type === "stopped") {
      setPipeline(prev => prev ? ({ ...prev, status: "stopped", currentStep: null }) : prev);
      loadMemorySummary();
      return;
    }
    if (data.type === "handoff") {
      setPipeline(prev => prev ? ({
        ...prev,
        handoffs: [...(prev.handoffs || []), data],
      }) : prev);
      return;
    }
    if (data.type === "step_complete") {
      setPipeline(prev => prev ? ({
        ...prev,
        steps: {
          ...(prev.steps || {}),
          [data.agentId]: {
            ...(prev.steps?.[data.agentId] || {}),
            status: "complete",
            output: data.output,
            model: data.model || prev.steps?.[data.agentId]?.model || null,
          },
        },
        stepStatus: { ...(prev.stepStatus || {}), [data.agentId]: "" },
      }) : prev);
      setStreamingTokens(prev => ({ ...prev, [data.agentId]: null }));
      return;
    }
    if (data.type === "step_error") {
      setPipeline(prev => prev ? ({
          ...prev,
          status: "error",
          currentStep: null,
          steps: {
            ...(prev.steps || {}),
            [data.agentId]: {
              ...(prev.steps?.[data.agentId] || {}),
              status: "error",
              error: data.error,
              output: prev.steps?.[data.agentId]?.output || "",
            },
          },
          stepStatus: { ...(prev.stepStatus || {}), [data.agentId]: data.error || "Pipeline step failed." },
        }) : prev);
        return;
      }
    if (data.type === "complete") {
      setPipeline(prev => prev ? ({
        ...prev,
        status: "complete",
        currentStep: null,
        calendarEntryIds: data.calendarEntryIds || [],
        calendarEntryCount: data.calendarEntryCount || 0,
      }) : prev);
      loadMemorySummary();
      return;
    }
    if (data.type === "error") {
      setPipeline(prev => prev ? ({ ...prev, status: "error", currentStep: null, error: data.error }) : prev);
    }
  };

  const consumePipelineStream = async (response) => {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const eventBlock of events) {
        const dataLine = eventBlock
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        try {
          const data = JSON.parse(dataLine.slice(6));
          applyPipelineEvent(data);
        } catch (e) {
          console.error("Pipeline event parse failed:", e);
        }
      }
    }

    if (buffer.trim()) {
      const dataLine = buffer
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (dataLine) {
        try {
          applyPipelineEvent(JSON.parse(dataLine.slice(6)));
        } catch (e) {
          console.error("Pipeline tail parse failed:", e);
        }
      }
    }
  };

  const runPipeline = async (topic, pipelineType = "content") => {
    const ptSteps = {};
    (PIPELINE_TYPES[pipelineType]?.steps || []).forEach((agentId) => { ptSteps[agentId] = null; });
    setStreamingTokens({});
    setPipeline({
      topic,
      status: "running",
      steps: ptSteps,
      stepStatus: {},
      handoffs: [],
      currentStep: null,
      processId: null,
      pipelineType,
    });
    try {
        const res = await fetch("/api/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, pipelineType }),
        });
      await consumePipelineStream(res);
    } catch (err) {
      setPipeline(prev => ({ ...prev, status: "error", error: err.message }));
    }
  };

  const resumePipeline = async (process) => {
    const topic = process.pipelineTopic;
    const pType = process.pipelineType || 'content';
    const resumeFrom = process.completedStepIndex || 0;
    const steps = PIPELINE_TYPES[pType]?.steps || PIPELINE_TYPES['content'].steps;

    // Rebuild step state: mark completed steps, null for remaining
    const ptSteps = {};
    steps.forEach((s, idx) => {
      if (idx < resumeFrom) {
        ptSteps[s.agentId] = { status: 'complete', output: pipeline?.steps?.[s.agentId]?.output || '(completed previously)' };
      } else {
        ptSteps[s.agentId] = null;
      }
    });

    // Collect prior outputs from current pipeline state if available
    const priorResults = {};
    if (pipeline?.steps) {
      Object.entries(pipeline.steps).forEach(([id, data]) => {
        if (data?.output) priorResults[id] = data.output;
      });
    }

      setPipeline({
        topic,
        status: 'running',
        steps: ptSteps,
        stepStatus: {},
        handoffs: [],
        currentStep: null,
        processId: process.id,
        pipelineType: pType,
      });
    setPipelineMinimized(false);
    setStreamingTokens({});

    try {
        const res = await fetch("/api/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, pipelineType: pType, resumeFrom, resumeProcessId: process.id, priorResults }),
        });
      await consumePipelineStream(res);
    } catch (err) {
      setPipeline(prev => ({ ...prev, status: "error", error: err.message }));
    }
  };

  const clearAgentMemory = async (agentId) => {
    await fetch("/api/memory", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    loadMemorySummary();
  };

  const suggestions = [
    "Research the top productivity tools for remote teams",
    "/maya Write a blog about morning routines for entrepreneurs",
    "/dev Build a simple React todo component",
    "Run full pipeline on the top 5 productivity mistakes remote teams make",
  ];

  const isMobile = viewportWidth <= 900;
  const isCompact = viewportWidth <= 1180;
  const shellHeight = isMobile ? "auto" : "calc(100vh - 82px)";
  const visibleSuggestions = isMobile ? suggestions.slice(0, 2) : suggestions;
  const showAlexModePanel = showAlexModeControl && (!isMobile || !!input.trim());

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top left, rgba(245,158,11,0.12), transparent 28%), radial-gradient(circle at top right, rgba(34,211,238,0.1), transparent 24%), linear-gradient(180deg, #050508 0%, #080a11 45%, #06070c 100%)",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
        backgroundSize: "72px 72px",
        maskImage: "linear-gradient(180deg, rgba(0,0,0,0.55), transparent 85%)",
        opacity: 0.22,
      }} />
      <div style={{
        position: "absolute",
        top: -120,
        left: -120,
        width: 360,
        height: 360,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(245,158,11,0.16), transparent 65%)",
        filter: "blur(30px)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute",
        top: 80,
        right: -140,
        width: 420,
        height: 420,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(34,211,238,0.14), transparent 68%)",
        filter: "blur(34px)",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      <style>{`
        @keyframes float-bar {
          0%, 100% { transform: translateX(-50%) translateY(0px); }
          50% { transform: translateX(-50%) translateY(-4px); }
        }
        @keyframes slow-pulse {
          0%, 100% { opacity: 0.82; }
          50% { opacity: 1; }
        }
        @keyframes slide-in {
          0% { opacity: 0; transform: translateY(10px) scale(0.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes transcript-glow {
          0%, 100% { box-shadow: 0 0 0 rgba(255,255,255,0); }
          50% { box-shadow: 0 0 28px rgba(255,255,255,0.04); }
        }
      `}</style>

      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: isMobile ? "12px 14px" : "10px 20px",
        display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 16,
        flexWrap: isMobile ? "wrap" : "nowrap",
        background: "linear-gradient(180deg, rgba(8,10,16,0.82), rgba(8,10,16,0.64))", backdropFilter: "blur(18px)",
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 16px 40px rgba(0,0,0,0.24)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34,
            border: "1px solid rgba(245,158,11,0.5)", borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            boxShadow: "0 0 24px rgba(245,158,11,0.18), inset 0 1px 0 rgba(255,255,255,0.06)",
            background: "linear-gradient(180deg, rgba(245,158,11,0.16), rgba(245,158,11,0.04))",
          }}>⚡</div>
          <div>
            <div style={{
              fontFamily: "Orbitron, sans-serif", fontSize: 15, fontWeight: 900,
              color: "#f59e0b", letterSpacing: "0.1em",
            }}>SUPERWIZARD5000</div>
            <div style={{ fontSize: 9, color: "#666d7d", letterSpacing: "0.2em" }}>MISSION CONTROL OS</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: isMobile ? 0 : "auto", width: isMobile ? "100%" : "auto", minWidth: 0, flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end" }}>
          <select value={model} onChange={e => setModel(e.target.value)} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#e2e2e8", padding: "4px 8px", fontSize: 11, borderRadius: 3,
            fontFamily: "JetBrains Mono", cursor: "pointer",
            flex: isMobile ? "1 1 100%" : "0 0 auto",
            width: isMobile ? "100%" : "auto",
            minWidth: 0,
          }}>
            <option value="qwen2.5-ctx32k">qwen2.5-ctx32k</option>
            <option value="deepseek-r1-ctx32k">deepseek-r1-ctx32k</option>
            <option value="qwen2.5:14b">qwen2.5:14b</option>
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6, width: isMobile ? "100%" : "auto" }}>
            <Dot color="#10b981" pulse={true} />
            <span style={{ fontSize: 10, color: "#10b981", letterSpacing: "0.1em" }}>12 AGENTS</span>
          </div>

          {/* Team Switcher */}
          <div style={{ position: "relative", width: isMobile ? "100%" : "auto" }}>
            <button
              onClick={() => setShowUserPicker(!showUserPicker)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 14px",
                background: activeUser ? TEAM[activeUser]?.color + "18" : "rgba(255,255,255,0.04)",
                border: "1px solid " + (activeUser ? TEAM[activeUser]?.color + "55" : "rgba(255,255,255,0.1)"),
                borderRadius: 6, cursor: "pointer",
                transition: "all 0.2s",
                width: isMobile ? "100%" : "auto",
                justifyContent: isMobile ? "space-between" : "flex-start",
              }}
            >
              {activeUser ? (
                <>
                  <span style={{ fontSize: 16 }}>{TEAM[activeUser]?.icon}</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{
                      fontFamily: "Orbitron, sans-serif", fontSize: 10,
                      fontWeight: 700, color: TEAM[activeUser]?.color,
                      letterSpacing: "0.05em",
                    }}>{TEAM[activeUser]?.name}</div>
                    <div style={{ fontSize: 8, color: "#555" }}>{TEAM[activeUser]?.role}</div>
                  </div>
                  <span style={{ fontSize: 10, color: "#444" }}>▾</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 14 }}>👤</span>
                  <span style={{
                    fontFamily: "Orbitron, sans-serif", fontSize: 10,
                    color: "#666", letterSpacing: "0.05em",
                  }}>WHO IS WORKING?</span>
                  <span style={{ fontSize: 10, color: "#444" }}>▾</span>
                </>
              )}
            </button>

            {showUserPicker && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0,
                background: "#0d0d14",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, padding: 8,
                zIndex: 200, minWidth: isMobile ? "min(280px, calc(100vw - 28px))" : 220,
                width: isMobile ? "min(280px, calc(100vw - 28px))" : "auto",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}>
                <div style={{
                  fontSize: 9, color: "#444", letterSpacing: "0.15em",
                  padding: "4px 8px 8px", fontFamily: "Orbitron, sans-serif",
                }}>WHO IS AT THE KEYBOARD?</div>
                {Object.entries(TEAM).map(([id, member]) => (
                  <div
                    key={id}
                    onClick={async () => {
                      setActiveUser(id);
                      setShowUserPicker(false);
                      // Auto start chapter session
                      try {
                        await fetch("/api/chapters", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "start", memberId: id, goals: "" }),
                        });
                      } catch {}
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", borderRadius: 6,
                      cursor: "pointer",
                      background: activeUser === id ? TEAM[id].color + "18" : "transparent",
                      border: "1px solid " + (activeUser === id ? TEAM[id].color + "33" : "transparent"),
                      marginBottom: 4, transition: "all 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = TEAM[id].color + "12"}
                    onMouseLeave={e => e.currentTarget.style.background = activeUser === id ? TEAM[id].color + "18" : "transparent"}
                  >
                    <span style={{ fontSize: 20 }}>{member.icon}</span>
                    <div>
                      <div style={{
                        fontFamily: "Orbitron, sans-serif", fontSize: 11,
                        fontWeight: 700, color: member.color,
                      }}>{member.full}</div>
                      <div style={{ fontSize: 9, color: "#555", marginTop: 1 }}>{member.role}</div>
                    </div>
                    {activeUser === id && (
                      <div style={{
                        marginLeft: "auto", fontSize: 9,
                        color: member.color, fontFamily: "Orbitron, sans-serif",
                      }}>● ACTIVE</div>
                    )}
                  </div>
                ))}
                {activeUser && (
                  <div
                    onClick={async () => {
                      // Close current session before switching
                      try {
                        await fetch("/api/chapters", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "close",
                            notes: "Session ended by team switcher",
                            nextSteps: "",
                          }),
                        });
                      } catch {}
                      setActiveUser(null);
                      setShowUserPicker(false);
                    }}
                    style={{
                      padding: "8px 12px", borderRadius: 6,
                      cursor: "pointer", marginTop: 4,
                      border: "1px solid rgba(239,68,68,0.2)",
                      background: "rgba(239,68,68,0.06)",
                      fontSize: 10, color: "#ef4444",
                      fontFamily: "Orbitron, sans-serif",
                      letterSpacing: "0.05em", textAlign: "center",
                    }}
                  >
                    ✕ End Session
                  </div>
                )}
              </div>
            )}
          </div>
   {/*        <button onClick={() => setShowGHL(true)} style={{
            padding: "6px 14px",
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: 3, color: "#f59e0b",
            fontFamily: "Orbitron, sans-serif",
            fontSize: 10, letterSpacing: "0.1em",
            cursor: "pointer",
          }}>GHL →</button>

          <button onClick={() => setShowLandingPage(true)} style={{ padding: "6px 14px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 3, color: "#10b981", fontFamily: "Orbitron, sans-serif", fontSize: 10, letterSpacing: "0.1em", cursor: "pointer", marginLeft: 8 }}>PAGE →</button>
 */}

          {!isMobile && (
          <>
          <button onClick={() => setShowLearning(true)} style={{
            padding: "6px 14px",
            background: "rgba(139,92,246,0.1)",
            border: "1px solid rgba(139,92,246,0.3)",
            borderRadius: 3, color: "#8b5cf6",
            fontFamily: "Orbitron, sans-serif",
            fontSize: 10, letterSpacing: "0.1em",
            cursor: "pointer", marginLeft: isMobile ? 0 : 8,
            flex: isMobile ? "1 1 calc(50% - 6px)" : "0 0 auto",
            minWidth: isMobile ? "calc(50% - 6px)" : "auto",
          }}>🧠 LEARN</button>
          <button onClick={() => setShowComms(true)} style={{
            padding: "6px 14px",
            background: "rgba(0,207,255,0.1)",
            border: "1px solid rgba(0,207,255,0.3)",
            borderRadius: 3, color: "#00cfff",
            fontFamily: "Orbitron, sans-serif",
            fontSize: 10, letterSpacing: "0.1em",
            cursor: "pointer", marginLeft: isMobile ? 0 : 8,
            flex: isMobile ? "1 1 calc(50% - 6px)" : "0 0 auto",
            minWidth: isMobile ? "calc(50% - 6px)" : "auto",
          }}>📡 COMMS</button>
          <button onClick={stopAllProcesses} style={{
            padding: "6px 14px",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 3, color: "#ef4444",
            fontFamily: "Orbitron, sans-serif",
            fontSize: 10, letterSpacing: "0.1em",
            cursor: "pointer", marginLeft: isMobile ? 0 : 8,
            flex: isMobile ? "1 1 calc(50% - 6px)" : "0 0 auto",
            minWidth: isMobile ? "calc(50% - 6px)" : "auto",
          }}>⏹ STOP ALL</button>
          <button onClick={() => setShowProcesses(true)} style={{
            padding: "6px 14px",
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: 3, color: "#f59e0b",
            fontFamily: "Orbitron, sans-serif",
            fontSize: 10, letterSpacing: "0.1em",
            cursor: "pointer", marginLeft: isMobile ? 0 : 8,
            flex: isMobile ? "1 1 calc(50% - 6px)" : "0 0 auto",
            minWidth: isMobile ? "calc(50% - 6px)" : "auto",
          }}>⚙ PROCESSES</button>
          <button onClick={toggleAutoJobMode} style={{
            padding: "6px 14px",
            background: autoJobsMode === "idle" ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.03)",
            border: "1px solid " + (autoJobsMode === "idle" ? "rgba(16,185,129,0.3)" : "#333"),
            borderRadius: 3, color: autoJobsMode === "idle" ? "#10b981" : "#555",
            fontFamily: "Orbitron, sans-serif",
            fontSize: 10, letterSpacing: "0.1em",
            cursor: "pointer", marginLeft: isMobile ? 0 : 8,
            position: "relative",
            flex: isMobile ? "1 1 calc(50% - 6px)" : "0 0 auto",
            minWidth: isMobile ? "calc(50% - 6px)" : "auto",
          }}>
            {autoJobsRunning ? "⟳" : autoJobsMode === "idle" ? "●" : "○"} AUTO {autoJobsMode === "idle" ? "IDLE" : "MANUAL"}
            {autoJobsStatus.filter(j => j.isDue).length > 0 && autoJobsMode === "idle" && (
              <span style={{
                position: "absolute", top: -4, right: -4,
                background: "#10b981", color: "#000", fontSize: 8,
                borderRadius: "50%", width: 14, height: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800,
              }}>{autoJobsStatus.filter(j => j.isDue).length}</span>
            )}
          </button>
          </>
          )}

        {/*   <button onClick={() => setShowChapters(true)} style={{
            padding: "6px 14px",
            background: "rgba(245,158,11,0.1)",
            border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: 3, color: "#f59e0b",
            fontFamily: "Orbitron, sans-serif",
            fontSize: 10, letterSpacing: "0.1em",
            cursor: "pointer", marginLeft: 8,
          }}>📖 CHAPTERS</button> */}

          {/* <button onClick={() => setShowFootage(true)} style={{
            padding: "6px 14px",
            background: "rgba(249,115,22,0.1)",
            border: "1px solid rgba(249,115,22,0.3)",
            borderRadius: 3, color: "#f97316",
            fontFamily: "Orbitron, sans-serif",
            fontSize: 10, letterSpacing: "0.1em",
            cursor: "pointer", marginLeft: 8,
          }}>🎬 FOOTAGE</button> */}
          
          {/* Tools Dropdown */}
          <div style={{ position: "relative", width: isMobile ? "100%" : "auto", flex: isMobile ? "1 1 100%" : "0 0 auto" }} data-tools-menu="true">
            <button
              onClick={() => setShowToolsMenu(!showToolsMenu)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px",
                background: showToolsMenu ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 3, color: "#f59e0b",
                fontFamily: "Orbitron, sans-serif",
                fontSize: 10, letterSpacing: "0.1em",
                cursor: "pointer",
                width: isMobile ? "100%" : "auto",
                justifyContent: isMobile ? "center" : "flex-start",
              }}
            >
              🛠 TOOLS ▾
            </button>
            {showToolsMenu && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", left: isMobile ? "auto" : 0, right: isMobile ? 0 : "auto",
                background: "#0d0d14",
                border: "1px solid rgba(245,158,11,0.3)",
                borderRadius: 6, padding: 6,
                zIndex: 200, minWidth: isMobile ? "min(280px, calc(100vw - 28px))" : 160,
                width: isMobile ? "min(280px, calc(100vw - 28px))" : "auto",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
              }}>
                {[
                  ...(isMobile ? [
                    { label: "LEARN", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.3)", onClick: () => { setShowLearning(true); setShowToolsMenu(false); } },
                    { label: "COMMS", color: "#00cfff", bg: "rgba(0,207,255,0.1)", border: "rgba(0,207,255,0.3)", onClick: () => { setShowComms(true); setShowToolsMenu(false); } },
                    { label: "STOP ALL", color: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.3)", onClick: () => { stopAllProcesses(); setShowToolsMenu(false); } },
                    { label: autoJobsMode === "idle" ? "AUTO IDLE" : "AUTO MANUAL", color: autoJobsMode === "idle" ? "#10b981" : "#a1a1aa", bg: autoJobsMode === "idle" ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.04)", border: autoJobsMode === "idle" ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.12)", onClick: () => { toggleAutoJobMode(); setShowToolsMenu(false); } },
                    { label: "PROCESSES", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", onClick: () => { setShowProcesses(true); setShowToolsMenu(false); } },
                  ] : []),
                  { label: "GHL →", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", onClick: () => { setShowGHL(true); setShowToolsMenu(false); } },
                  { label: "PAGE →", color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.3)", onClick: () => { setShowLandingPage(true); setShowToolsMenu(false); } },
                  { label: "VIRAL RESEARCH", color: "#3b82f6", bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.3)", onClick: () => { setShowViralResearch(true); setShowToolsMenu(false); } },
                  { label: "CONTENT OS", color: "#22d3ee", bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.3)", onClick: () => { setShowContentOS(true); setShowToolsMenu(false); } },
                  { label: "CONTENT CAL", color: "#3b82f6", bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.3)", onClick: () => { setShowContentCalendar(true); setShowToolsMenu(false); } },
                  { label: "PUBLISH Q", color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.3)", onClick: () => { setShowPublishQueue(true); setShowToolsMenu(false); } },
                  { label: "PUBLISH OPS", color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)", onClick: () => { setShowPublishIntegrations(true); setShowToolsMenu(false); } },
                  { label: "VIDEO EDITOR", color: "#f97316", bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.34)", onClick: () => { window.location.href = "/video-editor"; setShowToolsMenu(false); } },
                  { label: "CLOUDFLARE OPS", color: "#22d3ee", bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.3)", onClick: () => { setShowCloudflareOps(true); setShowToolsMenu(false); } },
                  { label: "DEERFLOW OPS", color: "#22d3ee", bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.3)", onClick: () => { setShowDeerFlow(true); setShowToolsMenu(false); } },
                  { label: "FUNNEL OPS", color: "#e97b2c", bg: "rgba(233,123,44,0.1)", border: "rgba(233,123,44,0.3)", onClick: () => { setShowFunnelDashboard(true); setShowToolsMenu(false); } },
                  { label: "SUCCESS KPIS", color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.3)", onClick: () => { setShowKpis(true); setShowToolsMenu(false); } },
                  { label: "WORKFLOW CTRL", color: "#22d3ee", bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.3)", onClick: () => { setShowWorkflowControls(true); setShowToolsMenu(false); } },
                  { label: "📖 CHAPTERS", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.3)", onClick: () => { setShowChapters(true); setShowToolsMenu(false); } },
                  { label: "🎬 FOOTAGE", color: "#f97316", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.3)", onClick: () => { setShowFootage(true); setShowToolsMenu(false); } },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={item.onClick}
                    style={{
                      display: "block", width: "100%",
                      padding: "8px 12px", marginBottom: 4,
                      background: item.bg,
                      border: "1px solid " + item.border,
                      borderRadius: 3, color: item.color,
                      fontFamily: "Orbitron, sans-serif",
                      fontSize: 10, letterSpacing: "0.1em",
                      cursor: "pointer", textAlign: "left",
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                  >{item.label}</button>
                ))}
              </div>
            )}
          </div>
          
          <div style={{ display: "none" }}>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: isMobile ? "auto" : "hidden", overflowX: "hidden", flexDirection: isMobile ? "column" : "row", position: "relative", zIndex: 1, padding: isMobile ? "10px 10px 90px" : "10px 10px 12px", gap: 10, minWidth: 0 }}>
        <div style={{
          width: isMobile ? "100%" : 210, border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column",
          background: "linear-gradient(180deg, rgba(13,16,24,0.82), rgba(9,11,17,0.82))",
          height: shellHeight,
          borderRadius: 18,
          backdropFilter: "blur(18px)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
          order: isMobile ? 2 : 0,
          minWidth: 0,
        }}>
          






	<div style={{ flex: 1, overflowY: isMobile ? "visible" : "auto", overflowX: isMobile ? "auto" : "hidden", padding: isMobile ? 10 : 12, display: "flex", flexDirection: isMobile ? "row" : "column", gap: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.2em", marginBottom: 4, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.04)", width: isMobile ? "100%" : "auto", flexBasis: isMobile ? "100%" : "auto" }}>{isMobile ? "AGENTS" : "AGENT ROSTER"}</div>
            {Object.entries(AGENTS).map(([id, agent]) => (
              <AgentCard key={id} agentId={id} agent={agent} active={activeAgent === id} messageCount={memorySummary[id] ? memorySummary[id].messageCount : 0} lastActive={memorySummary[id] ? memorySummary[id].lastActive : null} isTyping={typingAgent === id} onSelect={setActiveAgent} compact={isMobile} />
            ))}
          </div>
          {!isMobile && (
          <div style={{ flexShrink: 0, padding: 12, display: "flex", flexDirection: isMobile ? "row" : "column", justifyContent: "flex-end", gap: 8 }}>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.2em", marginBottom: 4 }}>PIPELINE</div>
            <button onClick={() => openPipelineBrief("")}
 style={{ width: isMobile ? "auto" : "100%", flex: isMobile ? 1 : "0 0 auto", padding: "9px 0", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 3, color: "#f59e0b", fontFamily: "Orbitron, sans-serif", fontSize: 9, letterSpacing: "0.1em", cursor: "pointer" }}>▶ FULL PIPELINE</button>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.2em", marginTop: 6, marginBottom: 4 }}>MEMORY</div>
            <button onClick={() => clearAgentMemory(activeAgent)} style={{ width: isMobile ? "auto" : "100%", flex: isMobile ? 1 : "0 0 auto", padding: "7px 0", background: "transparent", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 3, color: "#ef4444", fontFamily: "JetBrains Mono", fontSize: 10, cursor: "pointer" }}>Clear {AGENTS[activeAgent] ? AGENTS[activeAgent].name : ""} Memory</button>
          </div>
          )}
        </div>

        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 22,
          background: "linear-gradient(180deg, rgba(11,13,21,0.82), rgba(9,11,17,0.82))",
          backdropFilter: "blur(18px)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
          order: isMobile ? 1 : 0,
          minHeight: isMobile ? "70vh" : 0,
          minWidth: 0,
        }}>
          <div style={{
            padding: "18px 22px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)",
            display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr auto", alignItems: "center", gap: 16,
            background: AGENTS[activeAgent]
              ? `radial-gradient(circle at top left, ${AGENTS[activeAgent].color}22, transparent 34%), linear-gradient(180deg, rgba(16,18,28,0.94), rgba(10,12,19,0.82))`
              : "linear-gradient(180deg, rgba(16,18,28,0.94), rgba(10,12,19,0.82))",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                border: "1px solid rgba(255,255,255,0.12)",
                background: AGENTS[activeAgent]
                  ? `linear-gradient(180deg, ${AGENTS[activeAgent].color}28, rgba(255,255,255,0.03))`
                  : "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
                boxShadow: AGENTS[activeAgent]
                  ? `0 18px 32px ${AGENTS[activeAgent].color}1f, inset 0 1px 0 rgba(255,255,255,0.08)`
                  : "0 18px 32px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.08)",
              }}>
                {AGENTS[activeAgent] ? AGENTS[activeAgent].icon : ""}
              </div>
              <div style={{ minWidth: 0 }}>
              <span style={{
                fontFamily: "Orbitron, sans-serif", fontSize: 13, fontWeight: 800,
                color: AGENTS[activeAgent] ? AGENTS[activeAgent].color : "#cfd6e4", letterSpacing: "0.12em",
              }}>{AGENTS[activeAgent] ? AGENTS[activeAgent].name : ""}</span>
              <span style={{ fontSize: 10, color: "#8c97aa", marginLeft: 10, letterSpacing: "0.14em", textTransform: "uppercase", padding: "5px 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                {AGENTS[activeAgent] ? AGENTS[activeAgent].role : ""}
              </span>
              <div style={{ marginTop: 8, fontSize: 11, color: "#6f7b90", lineHeight: 1.65, maxWidth: 640 }}>
                {typingAgent && typingAgent === activeAgent
                  ? `${AGENTS[typingAgent] ? AGENTS[typingAgent].name : "Agent"} is shaping the next move right now.`
                  : "Use the center canvas to direct specialist work, route a pipeline, or turn strategy into pages, publish jobs, and tracked leads."}
              </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: isMobile ? "flex-start" : "flex-end", flexWrap: "wrap" }}>
              {isMobile && (
                <button
                  onClick={() => openPipelineBrief("")}
                  style={{
                    background: "linear-gradient(180deg, rgba(245,158,11,0.2), rgba(245,158,11,0.1))",
                    border: "1px solid rgba(245,158,11,0.32)",
                    color: "#f5b24b",
                    padding: "10px 14px",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontSize: 10,
                    fontFamily: "Orbitron, sans-serif",
                    letterSpacing: "0.1em",
                    boxShadow: "0 14px 30px rgba(245,158,11,0.12)",
                  }}
                >
                  FULL PIPELINE
                </button>
              )}
              {typingAgent && (
                <span style={{ fontSize: 10, color: "#f5b24b", letterSpacing: "0.12em", textTransform: "uppercase", padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.08)" }}>
                  {AGENTS[typingAgent] ? AGENTS[typingAgent].name : ""} live
                </span>
              )}
              {!isMobile && (
                <button
                  onClick={() => setShowShortcuts(!showShortcuts)}
                  style={{
                    background: showShortcuts ? "rgba(245,158,11,0.16)" : "rgba(255,255,255,0.03)", border: "1px solid " + (showShortcuts ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.08)"),
                    color: showShortcuts ? "#f5b24b" : "#98a2b3", padding: "8px 13px", borderRadius: 999,
                    cursor: "pointer", fontSize: 10, fontFamily: "JetBrains Mono", letterSpacing: "0.08em",
                  }}
                >{showShortcuts ? "HIDE SHORTCUTS" : "SHOW SHORTCUTS"}</button>
              )}
            </div>
          </div>

          {showShortcuts && (
            <div style={{
              padding: "12px 18px 14px", background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              display: "grid", gridTemplateColumns: isMobile ? "1fr" : isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))", gap: 8,
            }}>
              {SHORTCUTS_HELP.map((s, i) => (
                <div key={i} style={{ fontSize: 10, padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
                  <span style={{ color: "#f59e0b" }}>{s.cmd}</span>
                  <span style={{ color: "#697488", marginLeft: 6 }}>→ {s.desc}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px 14px" : "18px 22px" }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", padding: isMobile ? "26px 10px 22px" : "50px 20px" }}>
              <div style={{
                fontFamily: "Orbitron, sans-serif", fontSize: isMobile ? 18 : 22, fontWeight: 900,
                color: "rgba(245,158,11,0.25)", letterSpacing: "0.1em", marginBottom: 10,
              }}>SUPERWIZARD5000</div>
                <div style={{ fontSize: 12, color: "#5d6272", marginBottom: isMobile ? 8 : 10, maxWidth: 520, marginInline: "auto", lineHeight: 1.7 }}>
                  Run the agency from one surface: research what is winning, build the content system, generate the page, and route the lead into a tracked funnel.
                </div>
                <div style={{ fontSize: 11, color: "#343847", marginBottom: isMobile ? 14 : 24, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Start with a specialist or launch a full pipeline
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {visibleSuggestions.map((s, i) => (
                    <button key={i} onClick={() => setInput(s)} style={{
                      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
                      color: "#858b9d", padding: isMobile ? "9px 12px" : "10px 14px", borderRadius: 999,
                      cursor: "pointer", fontSize: 11, fontFamily: "JetBrains Mono",
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => <ChatMessage key={i} msg={msg} compact={isMobile} />)}
            {loading && (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "12px 14px",
                marginBottom: 14,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.06)",
                background: typingAgent && AGENTS[typingAgent]
                  ? `linear-gradient(180deg, ${AGENTS[typingAgent].color}12, rgba(255,255,255,0.02))`
                  : "linear-gradient(180deg, rgba(245,158,11,0.1), rgba(255,255,255,0.02))",
              }}>
                <div>
                  <div style={{
                    fontSize: 10,
                    color: typingAgent && AGENTS[typingAgent] ? AGENTS[typingAgent].color : "#f5b24b",
                    fontFamily: "Orbitron, sans-serif",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}>
                    {typingAgent && AGENTS[typingAgent] ? `${AGENTS[typingAgent].name} live response` : "Agent live response"}
                  </div>
                  <div style={{ marginTop: 5, fontSize: 11, color: "#758195", lineHeight: 1.6 }}>
                    Streaming the next move into the command canvas.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: typingAgent && AGENTS[typingAgent] ? AGENTS[typingAgent].color : "#f59e0b",
                      animation: "ping 1s " + (i * 0.2) + "s infinite",
                      boxShadow: typingAgent && AGENTS[typingAgent] ? `0 0 16px ${AGENTS[typingAgent].color}66` : "0 0 16px rgba(245,158,11,0.35)",
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{
            padding: "16px 18px 14px", borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "radial-gradient(circle at top left, rgba(245,158,11,0.08), transparent 28%), linear-gradient(180deg, rgba(8,9,14,0.72), rgba(7,8,13,0.94))", flexShrink: 0,
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {showAlexModePanel && (
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  padding: isMobile ? "8px 10px" : "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(59,130,246,0.18)",
                  background: "linear-gradient(180deg, rgba(59,130,246,0.08), rgba(15,23,42,0.18))",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: isMobile ? "100%" : 0 }}>
                    <span style={{ fontSize: 10, color: "#8eb8ff", fontFamily: "Orbitron, sans-serif", letterSpacing: "0.12em" }}>
                      ALEX RESPONSE MODE
                    </span>
                    <span style={{ fontSize: 10, color: "#7d8797", lineHeight: 1.5 }}>
                      Fast Answer keeps it concise. Deep Research gives Alex the heavier analysis lane.
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: isMobile ? 0 : "auto" }}>
                    {[
                      { id: "fast", label: "Fast Answer", hint: "Quick reads, lighter context" },
                      { id: "standard", label: "Deep Research", hint: "More context, slower but deeper" },
                    ].map((modeOption) => {
                      const selected = alexChatMode === modeOption.id;
                      const recommended = suggestedAlexMode === modeOption.id && currentComposeRoute?.agentId === "alex" && !!input.trim();
                      return (
                        <button
                          key={modeOption.id}
                          type="button"
                          onClick={() => {
                            setAlexChatMode(modeOption.id);
                            setAlexChatModeLocked(true);
                          }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            padding: "10px 12px",
                            minWidth: isMobile ? "calc(50% - 4px)" : 154,
                            borderRadius: 12,
                            border: "1px solid " + (selected ? "rgba(96,165,250,0.52)" : "rgba(255,255,255,0.08)"),
                            background: selected
                              ? "linear-gradient(180deg, rgba(59,130,246,0.2), rgba(59,130,246,0.09))"
                              : "rgba(255,255,255,0.02)",
                            color: selected ? "#dbeafe" : "#8d97a7",
                            cursor: "pointer",
                            textAlign: "left",
                            boxShadow: selected ? "0 12px 28px rgba(59,130,246,0.18)" : "none",
                            transition: "all 0.18s ease",
                          }}
                        >
                          <span style={{ fontSize: 11, fontFamily: "Orbitron, sans-serif", letterSpacing: "0.06em" }}>
                            {modeOption.label}
                          </span>
                          <span style={{ fontSize: 10, color: selected ? "#bfdbfe" : "#6f7889", lineHeight: 1.4 }}>
                            {modeOption.hint}
                          </span>
                          {recommended && (
                            <span style={{ fontSize: 9, color: selected ? "#dbeafe" : "#93c5fd", lineHeight: 1.4, letterSpacing: "0.08em" }}>
                              RECOMMENDED FOR THIS PROMPT
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pipeline type tabs */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {Object.entries(PIPELINE_TYPES).map(([id, pt]) => (
                  <div
                    key={id}
                    onClick={() => setSelectedPipelineType(id)}
                    style={{
                      padding: "7px 13px", borderRadius: 999,
                      cursor: "pointer", fontSize: 10,
                      background: selectedPipelineType === id ? pt.color + "20" : "rgba(255,255,255,0.02)",
                      border: "1px solid " + (selectedPipelineType === id ? pt.color + "55" : "rgba(255,255,255,0.08)"),
                      color: selectedPipelineType === id ? pt.color : "#778195",
                      fontFamily: "Orbitron, sans-serif",
                      letterSpacing: "0.07em",
                      transition: "all 0.18s ease",
                    }}
                  >
                    {pt.icon} {pt.label}
                    {selectedPipelineType === id && (
                      <span style={{ fontSize: 8, color: "#8a94a7", marginLeft: 6 }}>
                        {pt.steps.length} agents
                      </span>
                    )}
                  </div>
                ))}
                <div style={{ marginLeft: isMobile ? 0 : "auto", width: isMobile ? "100%" : "auto", fontSize: 9, color: "#5f687a", alignSelf: "center", fontStyle: "italic" }}>
                  {PIPELINE_TYPES[selectedPipelineType]?.description}
                </div>
              </div>

              {isMobile && (
                <button
                  onClick={() => openPipelineBrief(input.trim())}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 14,
                    border: "1px solid rgba(245,158,11,0.26)",
                    background: "linear-gradient(180deg, rgba(245,158,11,0.12), rgba(15,17,24,0.38))",
                    color: "#f5b24b",
                    fontFamily: "Orbitron, sans-serif",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    cursor: "pointer",
                    textAlign: "center",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                  }}
                >
                  OPEN FULL PIPELINE BRIEF
                </button>
              )}

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : agentRunning ? "1fr auto auto" : "1fr auto", gap: 10, alignItems: "stretch", padding: 10, borderRadius: 18, border: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Type a task, /alex, /maya, /dev... or: Run full pipeline on [topic]"
                  style={{
                    flex: 1, background: input.startsWith("/") ? "rgba(245,158,11,0.06)" : "rgba(6,8,13,0.64)",
                    border: "1px solid " + (input.startsWith("/") ? "rgba(245,158,11,0.28)" : "rgba(255,255,255,0.06)"),
                    borderRadius: 14, outline: "none", color: "#edf2fb",
                    fontSize: 13, fontFamily: "JetBrains Mono",
                    padding: "14px 16px", transition: "border-color 0.2s",
                    minHeight: 52,
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  style={{
                    padding: "0 22px",
                    background: loading ? "rgba(245,158,11,0.12)" : "linear-gradient(180deg, rgba(245,158,11,0.26), rgba(245,158,11,0.14))",
                    border: "1px solid rgba(245,158,11,0.42)", borderRadius: 14,
                    color: "#f8bb5e", fontFamily: "Orbitron, sans-serif",
                    fontSize: 10, letterSpacing: "0.12em",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.55 : 1, flexShrink: 0, minWidth: isMobile ? "100%" : 122, minHeight: 52,
                    boxShadow: loading ? "none" : "0 18px 36px rgba(245,158,11,0.14)",
                  }}
                >{loading ? "LIVE..." : "SEND →"}</button>
                {agentRunning && (
                  <button
                    onClick={async () => {
                      clearInterval(agentPollRef.current);
                      agentPollRef.current = null;
                      if (agentAbortRef.current) {
                        agentAbortRef.current.abort();
                        agentAbortRef.current = null;
                      }
                      setLoading(false);
                      setTypingAgent(null);
                      setAgentRunning(false);
                      try {
                        await fetch("/api/processes", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "stopAll" }),
                        });
                      } catch {}
                    }}
                    style={{
                      padding: "0 18px",
                      background: "rgba(239,68,68,0.14)",
                      border: "1px solid rgba(239,68,68,0.34)",
                      borderRadius: 14, color: "#ef7373",
                      fontFamily: "Orbitron, sans-serif",
                      fontSize: 10, letterSpacing: "0.12em",
                      cursor: "pointer", flexShrink: 0, minWidth: isMobile ? "100%" : 104, minHeight: 52,
                    }}>
                    STOP
                  </button>
                )}
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: "#5b6475", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span>Auto-routes specialist work by default. Use `/shortcuts` or slash commands to direct it manually.</span>
              {showAlexModeControl ? (
                <span style={{ color: "#778195" }}>
                  {`Alex is set to ${alexChatMode === "fast" ? "Fast Answer" : "Deep Research"} â€¢ Enter to send`}
                </span>
              ) : null}
              <span style={{ color: "#778195" }}>Enter to send • Shift+Enter reserved for future multi-line input</span>
            </div>
          </div>
        </div>

        <div style={{
        width: isMobile ? "100%" : 190, border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column",
          background: "linear-gradient(180deg, rgba(13,16,24,0.82), rgba(9,11,17,0.82))",
          height: shellHeight,
          borderRadius: 18,
          backdropFilter: "blur(18px)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
          order: isMobile ? 3 : 0,
          minWidth: 0,
        }}>
                   {/* Scrollable stats section */}
          <div style={{ flex: 1, overflowY: isMobile ? "visible" : "auto", padding: 14, borderBottom: "1px solid rgba(255,255,255,0.06)", display: isMobile ? "grid" : "block", gridTemplateColumns: isMobile ? "1fr 1fr" : undefined, gap: isMobile ? 12 : 0 }}>
            <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.2em", marginBottom: 12, gridColumn: isMobile ? "1 / -1" : "auto" }}>AGENT STATS</div>
            {Object.entries(AGENTS).map(([id, agent]) => (
              <div key={id} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: agent.color }}>{agent.name}</span>
                  <span style={{ fontSize: 10, color: "#555" }}>
                    {memorySummary[id] ? memorySummary[id].messageCount : 0} msgs
                  </span>
                </div>
                <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2, background: agent.color,
                    width: Math.min(100, (memorySummary[id] ? memorySummary[id].messageCount : 0) * 5) + "%",
                    transition: "width 0.5s ease",
                  }} />
                </div>
              </div>
            ))}
          </div>

          {/* System status */}
          <div style={{ flexShrink: 0, padding: 14, gridColumn: isMobile ? "1 / -1" : "auto" }}>
            <div style={{
              fontSize: 9, color: "#333", lineHeight: 1.9,
            }}>
              <div style={{ color: "#444", letterSpacing: "0.2em", marginBottom: 4 }}>SYSTEM</div>
              <div>Model: {model}</div>
              <div style={{ color: "#10b981" }}>● GPU Active</div>
              <div>Port: 4000</div>
              {autoJobsMode === "idle" && (
                <div style={{ color: autoJobsRunning ? "#f59e0b" : "#10b981", marginTop: 4 }}>
                  {autoJobsRunning ? "⟳ Auto-jobs running..." : "● Auto-jobs idle mode"}
                </div>
              )}
            </div>
          </div>

      </div>      
</div>

{showPipelinePrompt && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000,
          padding: isMobile ? 12 : 24,
        }}>
          <div style={{
            background: "#0d0d14",
            border: "1px solid rgba(245,158,11,0.4)",
            borderRadius: 8,
            width: isMobile ? "calc(100vw - 24px)" : 500,
            maxWidth: "100%",
            maxHeight: isMobile ? "calc(100vh - 24px)" : "min(90vh, 920px)",
            boxShadow: "0 0 60px rgba(245,158,11,0.1)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>
            <div style={{
              padding: isMobile ? "18px 18px 12px" : "32px 32px 18px",
              overflowY: "auto",
              flex: 1,
              minHeight: 0,
            }}>
            <div style={{
              fontFamily: "Orbitron, sans-serif", fontSize: 14,
              fontWeight: 700, color: "#f59e0b",
              letterSpacing: "0.1em", marginBottom: 6,
            }}>▶ FULL PIPELINE</div>
            <div style={{ fontSize: 11, color: "#444", marginBottom: 20 }}>
              Fill out the client brief so the pipeline researches the exact niche, audience, offer, and business goal.
            </div>
            {pipelineActiveClient && (
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                marginBottom: 16,
                background: "rgba(59,130,246,0.08)",
                border: "1px solid rgba(59,130,246,0.22)",
                borderRadius: 4,
                flexWrap: "wrap",
              }}>
                <div>
                  <div style={{ fontSize: 10, color: "#60a5fa", fontFamily: "Orbitron, sans-serif", letterSpacing: "0.12em" }}>
                    USING ACTIVE CLIENT
                  </div>
                  <div style={{ fontSize: 12, color: "#dbeafe", marginTop: 4 }}>
                    {pipelineActiveClient.name}
                    {pipelineActiveClient.niche ? ` • ${pipelineActiveClient.niche}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "#7da3d8", lineHeight: 1.5, textAlign: isMobile ? "left" : "right" }}>
                  The brief below was prefilled from this client’s onboarding data.
                </div>
              </div>
            )}

            {/* Pipeline type selector */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {Object.entries(PIPELINE_TYPES).map(([id, pt]) => (
                <div
                  key={id}
                  onClick={() => setSelectedPipelineType(id)}
                  style={{
                    padding: "5px 12px", borderRadius: 4,
                    cursor: "pointer", fontSize: 10,
                    background: selectedPipelineType === id ? pt.color + "20" : "transparent",
                    border: "1px solid " + (selectedPipelineType === id ? pt.color + "55" : "rgba(255,255,255,0.08)"),
                    color: selectedPipelineType === id ? pt.color : "#444",
                    fontFamily: "Orbitron, sans-serif",
                    letterSpacing: "0.05em",
                    transition: "all 0.15s",
                  }}
                >
                  {pt.icon} {pt.label}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 9, color: "#444", marginBottom: 16, fontStyle: "italic" }}>
              {PIPELINE_TYPES[selectedPipelineType]?.description}
            </div>

            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: "#666", letterSpacing: "0.14em", marginBottom: 5 }}>CLIENT NAME</div>
                  <input
                    autoFocus
                    value={pipelineBrief.clientName}
                    onChange={e => setPipelineBrief(prev => ({ ...prev, clientName: e.target.value }))}
                    placeholder="Jack Riggs Dog Training"
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 4,
                      color: "#e2e2e8",
                      fontSize: 12,
                      fontFamily: "JetBrains Mono",
                      padding: "11px 12px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#666", letterSpacing: "0.14em", marginBottom: 5 }}>NICHE *</div>
                  <input
                    value={pipelineBrief.niche}
                    onChange={e => setPipelineBrief(prev => ({ ...prev, niche: e.target.value }))}
                    placeholder="Dog training for busy families"
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(245,158,11,0.22)",
                      borderRadius: 4,
                      color: "#e2e2e8",
                      fontSize: 12,
                      fontFamily: "JetBrains Mono",
                      padding: "11px 12px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: "#666", letterSpacing: "0.14em", marginBottom: 5 }}>PRIMARY OFFER</div>
                  <input
                    value={pipelineBrief.offer}
                    onChange={e => setPipelineBrief(prev => ({ ...prev, offer: e.target.value }))}
                    placeholder="Private obedience program"
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 4,
                      color: "#e2e2e8",
                      fontSize: 12,
                      fontFamily: "JetBrains Mono",
                      padding: "11px 12px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#666", letterSpacing: "0.14em", marginBottom: 5 }}>TARGET AUDIENCE</div>
                  <input
                    value={pipelineBrief.targetAudience}
                    onChange={e => setPipelineBrief(prev => ({ ...prev, targetAudience: e.target.value }))}
                    placeholder="First-time dog owners with reactive dogs"
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 4,
                      color: "#e2e2e8",
                      fontSize: 12,
                      fontFamily: "JetBrains Mono",
                      padding: "11px 12px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: "#666", letterSpacing: "0.14em", marginBottom: 5 }}>GEOGRAPHY</div>
                  <input
                    value={pipelineBrief.geography}
                    onChange={e => setPipelineBrief(prev => ({ ...prev, geography: e.target.value }))}
                    placeholder="Orange County, CA"
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 4,
                      color: "#e2e2e8",
                      fontSize: 12,
                      fontFamily: "JetBrains Mono",
                      padding: "11px 12px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "#666", letterSpacing: "0.14em", marginBottom: 5 }}>PRIMARY GOAL</div>
                  <input
                    value={pipelineBrief.primaryGoal}
                    onChange={e => setPipelineBrief(prev => ({ ...prev, primaryGoal: e.target.value }))}
                    placeholder="Booked consultations from Instagram and local search"
                    style={{
                      width: "100%",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 4,
                      color: "#e2e2e8",
                      fontSize: 12,
                      fontFamily: "JetBrains Mono",
                      padding: "11px 12px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 9, color: "#666", letterSpacing: "0.14em", marginBottom: 5 }}>PRIORITY PLATFORMS</div>
                <input
                  value={pipelineBrief.platforms}
                  onChange={e => setPipelineBrief(prev => ({ ...prev, platforms: e.target.value }))}
                  placeholder="Instagram Reels, TikTok, YouTube Shorts"
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 4,
                    color: "#e2e2e8",
                    fontSize: 12,
                    fontFamily: "JetBrains Mono",
                    padding: "11px 12px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: 9, color: "#666", letterSpacing: "0.14em", marginBottom: 5 }}>RESEARCH NOTES / CONTEXT</div>
                <textarea
                  value={pipelineBrief.notes}
                  onChange={e => setPipelineBrief(prev => ({ ...prev, notes: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey && buildPipelinePromptFromBrief(pipelineBrief).trim()) {
                      e.preventDefault();
                      submitPipelineBrief();
                    }
                  }}
                  placeholder="Competitors, positioning, objections, style notes, content wins, page goals..."
                  style={{
                    width: "100%", height: 92,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(245,158,11,0.2)",
                    borderRadius: 4, color: "#e2e2e8",
                    fontSize: 12, fontFamily: "JetBrains Mono",
                    padding: "12px 16px", outline: "none",
                    resize: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{
                padding: 12,
                background: "rgba(59,130,246,0.08)",
                border: "1px solid rgba(59,130,246,0.2)",
                borderRadius: 4,
              }}>
                <div style={{ fontSize: 9, color: "#60a5fa", letterSpacing: "0.14em", marginBottom: 6 }}>
                  PIPELINE BRIEF PREVIEW
                </div>
                <div style={{
                  fontSize: 11,
                  color: "#cbd5e1",
                  lineHeight: 1.65,
                  whiteSpace: "pre-wrap",
                  minHeight: 44,
                }}>
                  {buildPipelinePromptFromBrief(pipelineBrief) || "Fill in the niche or client notes to generate the pipeline brief."}
                </div>
              </div>
            </div>

            </div>

            <div style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              flexDirection: isMobile ? "column-reverse" : "row",
              padding: isMobile ? "12px 18px 18px" : "0 32px 32px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              background: "linear-gradient(180deg, rgba(13,13,20,0.96), rgba(10,11,17,0.98))",
              flexShrink: 0,
            }}>
              <button
                onClick={() => setShowPipelinePrompt(false)}
                style={{
                  padding: "10px 24px", background: "transparent",
                  border: "1px solid #333", borderRadius: 4,
                  color: "#555", fontFamily: "Orbitron, sans-serif",
                  fontSize: 10, letterSpacing: "0.1em", cursor: "pointer",
                }}>CANCEL</button>
              <button
                onClick={() => {
                  if (!pipelineInput.trim()) return;
                  setShowPipelinePrompt(false);
                  runPipeline(pipelineInput.trim(), selectedPipelineType);
                }}
                disabled={!pipelineInput.trim()}
                style={{
                  padding: "10px 32px",
                  background: pipelineInput.trim() ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.05)",
                  border: "1px solid " + (pipelineInput.trim() ? "rgba(245,158,11,0.6)" : "rgba(245,158,11,0.2)"),
                  borderRadius: 4, color: "#f59e0b",
                  fontFamily: "Orbitron, sans-serif",
                  fontSize: 10, letterSpacing: "0.1em",
                  cursor: pipelineInput.trim() ? "pointer" : "not-allowed",
                }}>▶ RUN PIPELINE</button>
            </div>
          </div>
        </div>
      )}

      {pipeline && !pipelineMinimized && (
        <AuraPipelineModal
          pipeline={pipeline}
          agents={AGENTS}
          onClose={() => setPipeline(null)}
          onStop={stopPipeline}
          streamingTokens={streamingTokens}
          onMinimize={() => setPipelineMinimized(true)}
          pipelineTypes={PIPELINE_TYPES}
          onOpenLandingPage={(assetId) => {
            setLandingPageAssetId(assetId || "");
            setShowLandingPage(true);
          }}
          onOpenGhlPages={(assetId) => {
            setGhlAssetId(assetId || "");
            setGhlInitialTab("pages");
            setShowGHL(true);
          }}
        />
      )}
      {showGHL && <GHLPanel onClose={() => setShowGHL(false)} initialTab={ghlInitialTab} initialAssetId={ghlAssetId} />}
      {showLandingPage && <LandingPageBuilder onClose={() => setShowLandingPage(false)} initialAssetId={landingPageAssetId} />}
      {showLearning && <LearningPanel onClose={() => setShowLearning(false)} />}
      {showComms && <CommsMonitor onClose={() => setShowComms(false)} />}
      {showProcesses && <ProcessManager onClose={() => setShowProcesses(false)} onStopAgent={stopAgentProcess} onReopen={handleReopenProcess} />}
      {showChapters && <ChapterPanel onClose={() => setShowChapters(false)} />}
      {showFootage && <FootageLibrary onClose={() => setShowFootage(false)} />}
      {showViralResearch && <ViralResearchPanel onClose={() => setShowViralResearch(false)} />}
      {showContentOS && <ContentOSPanel onClose={() => setShowContentOS(false)} />}
      {showContentCalendar && <ContentCalendarPanel onClose={() => setShowContentCalendar(false)} />}
      {showPublishQueue && <PublishQueuePanel onClose={() => setShowPublishQueue(false)} />}
      {showPublishIntegrations && <PublishIntegrationsPanel onClose={() => setShowPublishIntegrations(false)} />}
      {showCloudflareOps && <CloudflareOpsPanel onClose={() => setShowCloudflareOps(false)} />}
      {showDeerFlow && <DeerFlowPanel onClose={() => setShowDeerFlow(false)} />}
      {showFunnelDashboard && <FunnelDashboardPanel onClose={() => setShowFunnelDashboard(false)} />}
      {showKpis && <KpiPanel onClose={() => setShowKpis(false)} />}
      {showWorkflowControls && <WorkflowControlPanel onClose={() => setShowWorkflowControls(false)} />}

      {/* Floating minimized pipeline bar */}
      {pipeline && pipelineMinimized && (
        <div style={{
          position: "fixed", bottom: 20, left: isMobile ? 12 : "50%",
          right: isMobile ? 12 : "auto",
          transform: isMobile ? "none" : "translateX(-50%)",
          background: "linear-gradient(180deg, rgba(13,13,20,0.95), rgba(8,10,16,0.95))",
          border: "1px solid rgba(245,158,11,0.24)",
          borderRadius: 999, padding: "12px 18px",
          display: "flex", alignItems: "center", gap: 16, flexWrap: isMobile ? "wrap" : "nowrap",
          zIndex: 999, boxShadow: "0 18px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
          backdropFilter: "blur(18px)",
          minWidth: isMobile ? "auto" : 400,
          animation: "slide-in 0.25s ease, float-bar 4s ease-in-out infinite",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: pipeline.status === "running" ? "#f59e0b" :
                          pipeline.status === "complete" ? "#10b981" : "#ef4444",
              animation: pipeline.status === "running" ? "ping 1s infinite" : "none",
            }} />
            <span style={{
              fontFamily: "Orbitron, sans-serif", fontSize: 10,
              color: "#f59e0b", letterSpacing: "0.1em",
            }}>PIPELINE</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "#e7eaf2", fontWeight: 600 }}>
              {pipeline.topic?.substring(0, 35)}{pipeline.topic?.length > 35 ? "..." : ""}
            </div>
            <div style={{ fontSize: 9, color: "#7c8291", marginTop: 3, letterSpacing: "0.04em" }}>
              {pipeline.status === "running"
                ? "Running: " + (AGENTS[pipeline.currentStep]?.name || "...")
                : pipeline.status === "complete"
                ? "✓ Complete"
                : pipeline.status === "stopped"
                ? "⏹ Stopped"
                : pipeline.status}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setPipelineMinimized(false)} style={{
              background: "rgba(245,158,11,0.14)",
              border: "1px solid rgba(245,158,11,0.28)",
              color: "#f59e0b", padding: "6px 12px",
              borderRadius: 999, cursor: "pointer",
              fontSize: 10, fontFamily: "Orbitron, sans-serif",
            }}>▲ EXPAND</button>
            {pipeline.status === "running" && (
              <button onClick={stopPipeline} style={{
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#ef4444", padding: "6px 12px",
                borderRadius: 999, cursor: "pointer",
                fontSize: 10, fontFamily: "JetBrains Mono",
              }}>⏹</button>
            )}
            <button onClick={() => { setPipeline(null); setPipelineMinimized(false); }} style={{
              background: "transparent",
              border: "1px solid #333",
              color: "#666", padding: "6px 10px",
              borderRadius: 999, cursor: "pointer",
              fontSize: 10, fontFamily: "JetBrains Mono",
            }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
