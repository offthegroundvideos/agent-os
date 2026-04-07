# Agent OS Routing Policy

## Summary

Agent OS is the control room. DeerFlow is the deep-work execution lane.

The routing policy exists to keep:
- business workflows fast and context-rich inside Agent OS
- deep research and bounded coding delegated to DeerFlow

## Always Local In Agent OS

These tasks should stay inside Agent OS by default:

- all standard pipelines
- content calendar operations
- publish queue and publish ops
- funnel and attribution work
- landing page and GHL operations
- client-context-heavy workflow actions
- fast summaries and operational UI requests

These agents are local-first:

- Maya
- Jordan
- Sam
- Luna
- Iris
- Rex
- Nova
- Pixel
- CEO

Reason:
- they depend on current app state
- they feed downstream systems directly
- they benefit more from speed and domain continuity than deep delegation

## Auto-Dispatch To DeerFlow

These tasks should go to DeerFlow automatically:

- Alex deep research tasks
- Dev bounded coding tasks
- CTO bounded technical implementation or debugging tasks

Reason:
- these jobs benefit from longer execution
- these jobs benefit from inspect / execute / verify loops
- these jobs are usually supporting the operating system, not driving the UI directly

## Local-First Even For Alex, Dev, And CTO

These requests stay local even when sent to Alex, Dev, or CTO:

- show or open a panel
- summarize current state
- explain an existing workflow
- refresh or list operational data
- status checks
- lightweight chat questions

Reason:
- delegation adds unnecessary latency
- the answer depends on current Agent OS business state

## Decision Rules

### Alex
- DeerFlow: deep research, market mapping, platform analysis, competitor investigation, crawling, trend synthesis
- Agent OS: summaries, operational explanations, quick research interpretation

### Dev
- DeerFlow: bounded feature implementation, debugging, refactors, repo inspection, integration work
- Agent OS: technical status, simple explanations, local operational tasks

### CTO
- DeerFlow: bounded architectural fixes, technical debugging, implementation spikes
- Agent OS: system briefings, health checks, prioritization, operational recommendations

## Pipeline Rule

Pipelines stay in Agent OS.

Reason:
- handoffs
- learning
- comms tracking
- calendar writes
- publish queue creation
- funnel attribution

These are native operating-system workflows and should not be pushed into DeerFlow as a default execution lane.

## Current Implementation

The policy is encoded in:

- [C:\AI-Agents\agent-os\lib\routingPolicy.js](C:\AI-Agents\agent-os\lib\routingPolicy.js)
- [C:\AI-Agents\agent-os\lib\deerflowBridge.js](C:\AI-Agents\agent-os\lib\deerflowBridge.js)
- [C:\AI-Agents\agent-os\app\api\agent\route.js](C:\AI-Agents\agent-os\app\api\agent\route.js)
- [C:\AI-Agents\agent-os\app\api\deerflow\route.js](C:\AI-Agents\agent-os\app\api\deerflow\route.js)

## Future Expansion

Later, we can add a third lane:

- `ask before dispatching`

That would be appropriate for:
- expensive research requests
- broad CTO tasks
- risky coding tasks with unclear scope

For now, the system uses:
- always local
- auto DeerFlow
- local-first fallback
