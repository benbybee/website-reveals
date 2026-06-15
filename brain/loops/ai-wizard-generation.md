# L6 — AI Wizard / Generation Loop

**Goal:** Use the LLM to (a) estimate task complexity/timeline and (b) turn inbound messages (email/Slack) into proposed client tasks an admin can approve.

**Executor:**
- Estimation: `ai-estimate` Trigger task (`src/trigger/ai-estimate.ts`) — Claude analyzes a task + `ai_velocity_log` history, writes `complexity_score` + `estimated_completion_date`.
- Intake: inline Claude in `app/api/integrations/email/inbound` and `.../slack/events` produces an `inbound_proposals` row. Admin acts via the Telegram webhook (`approve|reject|assign`), which can create the `tasks` row.

**Evaluator:**
- Intake proposals: **human approval gate** (L2 human) — admin approves/rejects in Telegram; an unclassified message is still surfaced with an "ℹ️ no client task detected" flag.
- Estimation: **NONE automated** (G-AI2). The model's `confidence` field is not used downstream; estimate accuracy is logged to `ai_velocity_log` but never scored back into the loop.

**Retry:** none — both paths are fire-and-forget; an LLM/API failure is logged and the request returns. No 429 backoff.

**Escalation / gate:** the Telegram admin approval IS the gate for proposals. Errors during task creation append an error suffix to the Telegram reply.

**Approval gate:** every AI-proposed task requires explicit admin approval before it becomes real work.

**Observability:** `inbound_proposals.status` (pending → awaiting_client → approved/rejected), `telegram_conversations`, `ai_velocity_log`.

**Runtime states:** proposal pending→evaluating(human)→succeeded/failed.

**Gaps:**
- **G-AI1 (Med):** `ai-process-inbound` and `ai-telegram-command` tasks are **defined but never dispatched** — inline handlers superseded them (dead code / incomplete refactor). Resolve by deleting or re-integrating.
- **G-AI2 (Med):** no automated quality evaluator on AI output; estimate accuracy never closes the loop.
- **G-TG1 (Low):** Telegram commands run synchronously inline (can time out the webhook); no concurrency control on duplicate `approve`.
- No 429/backoff on Anthropic; no per-task/month cost aggregation.
