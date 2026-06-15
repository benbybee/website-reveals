# Feature — AI Wizard & Telegram Approval

> LLM-assisted task estimation and inbound-message triage, with a human approval gate in Telegram. Detailed loop: [L6](../loops/ai-wizard-generation.md).

## Three uses of the model
1. **Task estimation** — `ai-estimate` (Trigger) reads a task + `ai_velocity_log` history → writes `complexity_score` + `estimated_completion_date`.
2. **Inbound triage** — inline Claude in `integrations/email/inbound` + `integrations/slack/events` turns a message into an `inbound_proposals(pending)` row with a `proposed_task` and `proposed_response`.
3. **AI wizard chat** — `ai-wizard/chat` streaming SSE for content help.

## The approval gate
The Telegram webhook (`integrations/telegram/webhook`) is the control surface: the admin runs `approve proposal <id>` / `reject proposal <id>` / `assign <id> <client>`; on approve, the proposal becomes a `tasks` row. Build-review notifications also flow here ("looks good" → mark task complete). The model parses intent; the **admin decision is the gate** (no task is created without it).

## Notifications hook
Completion/review/outcome events fan out via Resend + Telegram, audience-gated by `notification_settings` ([L7](../loops/notification.md)).

## Important gaps
- **G-AI1:** `ai-process-inbound` + `ai-telegram-command` Trigger tasks are **dead code** — inline handlers replaced them. Decide: delete or re-integrate.
- **G-AI2:** no automated evaluator on AI output; estimate accuracy logged but never scored back.
- **G-TG1:** Telegram commands run synchronously inline (can time out); no dedup on duplicate `approve`.
- No 429 backoff on Anthropic; no per-task/month AI cost aggregation. See [gap matrix](../gap-matrix.md).
