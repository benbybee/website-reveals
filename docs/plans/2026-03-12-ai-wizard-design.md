# AI Wizard for Questionnaire Forms — Design Document

**Date:** 2026-03-12
**Status:** Approved

## Overview

Add an AI-assisted wizard as a 4th option on the questionnaire mode selector. Instead of manually filling out the quick, standard, or in-depth form, users chat conversationally with an AI that gathers their information and pre-fills the appropriate form for review before submission.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Target form tier | AI decides (quick/standard/in-depth) based on info gathered | Adapts to user engagement; leans toward in-depth but respects 5-10 min attention span |
| UI placement | 4th card on ModeSelector | Least disruptive; keeps manual forms intact |
| AI backend | Claude API (Anthropic) | Stack consistency; strong at conversational info gathering |
| Chat-to-form transition | Auto-fill form, show for review before submit | Builds trust; reuses existing form UI and submission pipeline |
| Chat UI | Full-page replacement (same as other modes) | Consistent UX; immersive for 5-10 min conversation |
| Conversation strategy | Hybrid — broad opener then targeted follow-ups | Lets talkative users front-load info; AI fills gaps with specifics |
| Dynamic options | AI generates button options on the fly based on industry | No predefined industry lists to maintain; Claude handles contextual options well |
| Visual design | Light theme matching existing design tokens | #faf9f5 background, #ffffff surfaces, #ff3d00 accents, Playfair/DM Sans/JetBrains Mono fonts |

## Architecture

```
ModeSelector (+ AI card)
  → User clicks "AI Assisted"
  → FormShell enters ai-wizard pseudo-mode
  → Full-page AiWizardChat component
  → Streams conversation via /api/ai-wizard/chat
  → Claude determines tier + fills fields
  → Transitions to existing form in review mode
  → User edits if needed → submits normally
```

## Component Design

### ModeSelector Changes

Add 4th card:
- Icon: sparkle emoji
- Time: "5-10 min"
- Name: "AI Assisted"
- Description: "Have a conversation instead of filling out a form. Our AI asks the right questions and fills everything in for you."
- Bullets: Chat naturally about your business / AI picks the right level of detail / Review and edit before submitting
- Tradeoff: "You'll review a pre-filled form before anything is submitted — nothing gets sent without your approval."
- CTA: "Start Chat →" with btn-orange styling
- Badge: "Recommended" (replaces Standard's "Most common")

New prop `onStartAiWizard` separate from `onSelect` (since "ai-wizard" isn't a QuestionnaireMode).

### FormShell Changes

New state: `aiWizardActive` boolean.

```
if (!mode && !aiWizardActive) → ModeSelector
if (aiWizardActive) → AiWizardChat
if (mode) → existing form flow (unchanged)
```

AI wizard completion callback: `onComplete(mode, formData)` — sets mode and bulk-loads form data, dropping user into step 1 for review.

### AiWizardChat Component

Full-page chat interface matching existing design tokens:

- Background: #faf9f5
- Chat container: max-width 680px, centered
- Obsession wordmark at top
- AI messages: #ffffff bg, #e8e6df border, left-aligned
- User messages: #f3f1eb bg, right-aligned
- Button options: rendered as tappable chips below AI messages
  - Single-select: btn-outline style, selected gets #ff3d00 border
  - Multi-select: chips with checkmark toggle + "Done" button
  - "Other" chip: expands inline text input when tapped
- Typing indicator: 3 animated dots in #ff3d00
- Input: sticky bottom, .field styling, orange send button
- Back button: btn-back class, returns to ModeSelector

### API Route: /api/ai-wizard/chat

- Method: POST
- Body: `{ messages: ChatMessage[] }`
- Response: Streaming via Anthropic SDK + Next.js ReadableStream

System prompt contains full field definitions from all 3 tiers. Claude uses structured JSON blocks within responses for UI controls:

```json
{"type": "buttons", "mode": "single", "options": ["Residential", "Commercial", "Both"], "allowOther": false}
```

```json
{"type": "buttons", "mode": "multi", "options": ["Termites", "Rodents", "Bed Bugs"], "allowOther": true}
```

Form completion signal:

```json
{"type": "form_complete", "mode": "standard", "data": {"business_name": "...", ...}}
```

## Conversation Strategy

1. **Opener**: Broad question to get user talking about their business
2. **Follow-up sweep**: Fill gaps with targeted questions, using button options for categorical answers
3. **Depth calibration**: Short answers → lean quick/standard. Engaged user → push toward in-depth. Never force.
4. **Tier decision**: business basics + services = quick. + goals/audience/brand = standard. + deep positioning/content = in-depth. Always lean highest supported.
5. **Completion**: Emit form_complete signal, transition to pre-filled form

## Form Review Transition

1. Parse mode and data from form_complete signal
2. Call onComplete(mode, data) in FormShell
3. Bulk-load formData via new bulkSetFormData() method on useFormSession hook
4. User lands on Step 1 of chosen tier, all fields pre-populated
5. Banner at top: "AI-filled — review your answers and edit anything before submitting."
6. Normal navigation and submission from here

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| Create | `components/form/AiWizardChat.tsx` | Chat UI component |
| Create | `app/api/ai-wizard/chat/route.ts` | Streaming Claude API route |
| Create | `lib/ai-wizard-prompt.ts` | System prompt + field definitions |
| Modify | `components/form/ModeSelector.tsx` | Add 4th AI card |
| Modify | `components/form/FormShell.tsx` | Add AI wizard state + transition |
| Modify | `lib/use-form-session.ts` | Add bulkSetFormData() method |
| Modify | `lib/form-steps.ts` | Export field ID lists for system prompt |
| Modify | `package.json` | Add @anthropic-ai/sdk dependency |

## Dependencies

- `@anthropic-ai/sdk` — streaming Claude API calls
- `ANTHROPIC_API_KEY` env var in .env.local
