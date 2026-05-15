# AI Wizard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI chat wizard as a 4th option on the questionnaire mode selector that conversationally gathers business info and pre-fills the appropriate form tier for review.

**Architecture:** A new `AiWizardChat` component renders a full-page chat UI. Messages stream from a new `/api/ai-wizard/chat` route that calls Claude with a system prompt containing all form field definitions. Claude's responses include structured JSON blocks for button options. On completion, the chat emits a `form_complete` signal that bulk-loads form data into the existing `useFormSession` hook, dropping the user into form review mode.

**Tech Stack:** Next.js 16, React 19, Anthropic SDK (already installed), inline styles (matching existing pattern — no Tailwind classes in components), streaming via ReadableStream.

**Design doc:** `docs/plans/2026-03-12-ai-wizard-design.md`

---

### Task 1: Add `bulkSetFormData` to useFormSession hook

**Files:**
- Modify: `lib/use-form-session.ts:86-92`

**Step 1: Add the bulkSetFormData method**

After the existing `resetMode` callback (~line 92), add:

```typescript
const bulkSetFormData = useCallback((m: QuestionnaireMode, data: Record<string, unknown>) => {
  setState((s) => ({
    ...s,
    mode: m,
    currentStep: 1,
    formData: { ...data, _mode: m },
    dnsProvider: (data.dns_provider as string) || "",
  }));
}, []);
```

**Step 2: Add it to the return object**

Add `bulkSetFormData` to the return statement alongside the other methods.

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors related to use-form-session.ts

**Step 4: Commit**

```bash
git add lib/use-form-session.ts
git commit -m "feat: add bulkSetFormData to useFormSession hook for AI wizard"
```

---

### Task 2: Add AI wizard card to ModeSelector

**Files:**
- Modify: `components/form/ModeSelector.tsx`

**Step 1: Update the component props**

Add `onStartAiWizard` callback prop:

```typescript
interface ModeSelectorProps {
  onSelect: (mode: QuestionnaireMode) => void;
  onStartAiWizard: () => void;
}
```

**Step 2: Add the AI wizard card after the 3 mode cards grid**

After the closing `</div>` of the mode cards grid (after `{MODES.map(...)}`), add a new section. This should be a full-width card below the 3-column grid but above the save-progress note.

The card should use the same styling patterns as existing cards:
- `#ffffff` background, `1.5px solid #ff3d00` border (highlighted), `border-radius: 6px`
- Layout: horizontal on desktop (icon/description left, bullets center, CTA right), stack on mobile
- Badge: "Recommended" using same positioning as "Most common" badge
- Time badge: "5–10 MIN" in mono uppercase
- Heading: "AI Assisted" in `var(--font-serif)` 1.45rem bold
- Description: "Have a conversation instead of filling out a form. Our AI asks the right questions and fills everything in for you."
- 3 bullets with orange dash prefix (matching existing bullet style):
  - "Chat naturally about your business"
  - "AI picks the right level of detail"
  - "Review and edit before submitting"
- Tradeoff text: "You'll review a pre-filled form before anything is submitted — nothing gets sent without your approval."
- CTA button: "Start Chat →" using `btn-orange` class

**Step 3: Move "Most common" badge from Standard to AI card**

Change Standard mode: remove `highlight: true`. The AI card has its own highlight treatment.

**Step 4: Update the function signature**

```typescript
export function ModeSelector({ onSelect, onStartAiWizard }: ModeSelectorProps) {
```

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors in FormShell.tsx about missing prop (we'll fix in Task 3)

**Step 6: Commit**

```bash
git add components/form/ModeSelector.tsx
git commit -m "feat: add AI Assisted card to ModeSelector"
```

---

### Task 3: Wire AI wizard into FormShell

**Files:**
- Modify: `components/form/FormShell.tsx`

**Step 1: Add AI wizard state and import**

Add state:
```typescript
const [aiWizardActive, setAiWizardActive] = useState(false);
```

Import the AiWizardChat component (we'll create it in Task 5, use a placeholder for now):
```typescript
import { AiWizardChat } from "./AiWizardChat";
```

**Step 2: Add the `bulkSetFormData` destructure**

Add `bulkSetFormData` to the destructured return from `useFormSession(initialToken)`.

**Step 3: Update the ModeSelector render**

Change the `if (!mode)` block to:

```typescript
if (!mode && !aiWizardActive) {
  return <ModeSelector onSelect={setMode} onStartAiWizard={() => setAiWizardActive(true)} />;
}

if (aiWizardActive) {
  return (
    <AiWizardChat
      onComplete={(m, data) => {
        bulkSetFormData(m, data);
        setAiWizardActive(false);
      }}
      onBack={() => setAiWizardActive(false)}
    />
  );
}
```

**Step 4: Commit (will have TS errors until Task 5 creates AiWizardChat)**

```bash
git add components/form/FormShell.tsx
git commit -m "feat: wire AI wizard state into FormShell"
```

---

### Task 4: Create AI system prompt module

**Files:**
- Create: `lib/ai-wizard-prompt.ts`

**Step 1: Build the system prompt**

This module exports a function that generates the system prompt containing all form field definitions. The prompt tells Claude:

1. **Role:** You're a friendly website intake specialist for Obsession Marketing.
2. **Goal:** Gather enough information through conversation to fill the questionnaire form.
3. **Strategy:**
   - Start with 1-2 broad questions ("Tell me about your business — what do you do, and who do you do it for?")
   - After the user responds, identify what info you have and what's missing
   - Ask targeted follow-ups, using button options for categorical questions
   - Use buttons when answers are likely categorical (residential/commercial, yes/no, industry-specific service lists)
   - Use free-form for open-ended questions (differentiators, brand personality, company story)
   - Keep conversation natural — 5-10 minutes max
4. **Structured output format:**
   - Normal text is just chat messages
   - To present button options, include a JSON block on its own line: `[BUTTONS:{"mode":"single","options":["A","B","C"],"allowOther":false}]`
   - For multi-select: `[BUTTONS:{"mode":"multi","options":["A","B","C"],"allowOther":true}]`
   - When you have enough info, emit: `[FORM_COMPLETE:{"mode":"standard","data":{...}}]`
5. **Tier decision rules:**
   - Has business basics + services → quick
   - Has + goals + audience + brand basics → standard
   - Has + deep positioning, content, competitive → in-depth
   - Always lean toward the highest tier the data supports
   - After ~8-12 exchanges, wrap up with what you have
6. **Field definitions:** Include the full field ID list for all 3 tiers with descriptions, organized by tier. Only include field IDs that are text/textarea/email/tel/radio/checkbox types (skip `file` and `dns-selector` — the AI can't handle uploads or DNS selection).

```typescript
import { FORM_STEPS, QUICK_STEPS, STANDARD_STEPS, FormStep } from "./form-steps";

function stepsToFieldList(steps: FormStep[]): string {
  return steps
    .flatMap((s) => s.questions)
    .filter((q) => !["file", "dns-selector"].includes(q.type))
    .map((q) => {
      let desc = `- ${q.id}: "${q.label}" (${q.type})`;
      if (q.options) desc += ` [options: ${q.options.join(", ")}]`;
      return desc;
    })
    .join("\n");
}

export function getSystemPrompt(): string {
  return `You are a friendly, conversational website intake specialist for Obsession Marketing. Your job is to gather information about a client's business through natural conversation, then fill out their website questionnaire form.

## Your Approach

1. START BROAD: Open with one warm, open-ended question that gets the client talking about their business. Something like "Hey! I'm here to help you fill out your website questionnaire through a quick chat. Tell me about your business — what do you do, and who do you do it for?"

2. LISTEN AND FOLLOW UP: Based on what they share, ask about gaps. Use BUTTON OPTIONS for categorical questions (yes/no, service types, industry-specific choices). Use free-form questions for things only they can articulate (differentiators, brand voice, company story).

3. GENERATE CONTEXTUAL BUTTONS: When asking about services, customer types, or other categorical info, dynamically generate button options based on what you know about their industry. For example, a pest control company gets ["Residential", "Commercial", "Both"] but a law firm gets ["Personal Injury", "Family Law", "Criminal Defense", "Corporate"].

4. KEEP IT NATURAL: Don't ask more than 1-2 questions per message. Acknowledge what they've said before asking the next thing. Aim for 5-10 minutes of conversation total.

5. WRAP UP: When you have enough info, tell them you're putting their questionnaire together and emit the completion signal.

## Structured Output Format

Your responses are plain text chat messages. To include interactive elements, use these markers ON THEIR OWN LINE:

For single-select buttons:
[BUTTONS:{"mode":"single","options":["Option A","Option B","Option C"],"allowOther":false}]

For multi-select buttons (user can pick multiple + optional "Other"):
[BUTTONS:{"mode":"multi","options":["Option A","Option B","Option C"],"allowOther":true}]

RULES FOR BUTTONS:
- Put the [BUTTONS:...] marker on its own line, after your question text
- Generate options dynamically based on the client's industry/context
- Use single-select for either/or questions (residential vs commercial, yes/no)
- Use multi-select for "pick all that apply" questions (services, contact methods)
- Set allowOther:true when the list might not cover everything (services, pests, practice areas)
- Do NOT use buttons for open-ended questions (differentiators, brand personality, company story)
- Keep option lists to 3-7 items — too many options is overwhelming

When you have enough information to fill the form, emit this on its own line:
[FORM_COMPLETE:{"mode":"quick|standard|in-depth","data":{...field_id: value...}}]

## Tier Decision Rules

Decide the form tier based on how much information you've gathered:

**Quick** (minimum — business basics + services):
Fields: ${stepsToFieldList(QUICK_STEPS).split("\n").length} fields
${stepsToFieldList(QUICK_STEPS)}

**Standard** (+ goals, audience, brand, positioning):
Fields: ${stepsToFieldList(STANDARD_STEPS).split("\n").length} fields
${stepsToFieldList(STANDARD_STEPS)}

**In-Depth** (+ competitive, inspiration, problems, content, navigation):
Fields: ${stepsToFieldList(FORM_STEPS).split("\n").length} fields
${stepsToFieldList(FORM_STEPS)}

Always lean toward the HIGHEST tier the gathered data supports. If you have enough for standard but the user gave rich detail on brand and positioning, push toward in-depth by asking a few more targeted questions.

After about 8-12 message exchanges (or if the user seems ready to wrap up), complete with whatever tier the data supports.

## Data Mapping Rules

When emitting FORM_COMPLETE:
- Map conversational answers to the exact field IDs listed above
- For radio fields, use one of the exact option strings listed
- For checkbox fields, use an array of the exact option strings
- For text/textarea/email/tel fields, use the string value
- Leave fields empty (omit them) if you don't have that information
- business_name and contact_email are REQUIRED — always gather these
- Combine related conversational info into the appropriate field (e.g., if they mentioned services across multiple messages, combine into all_services)

## Tone

- Friendly, professional, not overly casual
- Acknowledge their answers warmly but briefly before moving on
- Don't repeat back everything they said — show you understood with a brief acknowledgment
- When generating buttons, frame the question conversationally ("What kind of customers do you mainly serve?" not "SELECT CUSTOMER TYPE:")`;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add lib/ai-wizard-prompt.ts
git commit -m "feat: create AI wizard system prompt with field definitions"
```

---

### Task 5: Create the streaming API route

**Files:**
- Create: `app/api/ai-wizard/chat/route.ts`

**Step 1: Build the streaming endpoint**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { getSystemPrompt } from "@/lib/ai-wizard-prompt";

const anthropic = new Anthropic();

export async function POST(req: Request) {
  const { messages } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Messages array required", { status: 400 });
  }

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: getSystemPrompt(),
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      stream.on("text", (text) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text })}\n\n`));
      });
      stream.on("end", () => {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      });
      stream.on("error", (err) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`)
        );
        controller.close();
      });
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add app/api/ai-wizard/chat/route.ts
git commit -m "feat: create streaming AI wizard chat API route"
```

---

### Task 6: Create the AiWizardChat component

**Files:**
- Create: `components/form/AiWizardChat.tsx`

This is the largest task. The component needs:

**Step 1: Define types and props**

```typescript
"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { QuestionnaireMode } from "@/lib/form-steps";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ButtonsBlock {
  mode: "single" | "multi";
  options: string[];
  allowOther: boolean;
}

interface AiWizardChatProps {
  onComplete: (mode: QuestionnaireMode, data: Record<string, unknown>) => void;
  onBack: () => void;
}
```

**Step 2: Build message parsing utilities**

Parse AI messages to extract text segments and `[BUTTONS:{...}]` / `[FORM_COMPLETE:{...}]` markers:

```typescript
interface ParsedSegment {
  type: "text" | "buttons" | "form_complete";
  content: string;
  buttons?: ButtonsBlock;
  formData?: { mode: QuestionnaireMode; data: Record<string, unknown> };
}

function parseMessage(content: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const lines = content.split("\n");
  let textBuffer = "";

  for (const line of lines) {
    const btnMatch = line.match(/^\[BUTTONS:(.*)\]$/);
    const completeMatch = line.match(/^\[FORM_COMPLETE:(.*)\]$/);

    if (btnMatch) {
      if (textBuffer.trim()) {
        segments.push({ type: "text", content: textBuffer.trim() });
        textBuffer = "";
      }
      try {
        segments.push({ type: "buttons", content: line, buttons: JSON.parse(btnMatch[1]) });
      } catch { /* skip malformed */ }
    } else if (completeMatch) {
      if (textBuffer.trim()) {
        segments.push({ type: "text", content: textBuffer.trim() });
        textBuffer = "";
      }
      try {
        segments.push({ type: "form_complete", content: line, formData: JSON.parse(completeMatch[1]) });
      } catch { /* skip malformed */ }
    } else {
      textBuffer += line + "\n";
    }
  }

  if (textBuffer.trim()) {
    segments.push({ type: "text", content: textBuffer.trim() });
  }

  return segments;
}
```

**Step 3: Build the streaming fetch hook**

```typescript
function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (userMessage: string) => {
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: userMessage }];
    setMessages([...newMessages, { role: "assistant", content: "" }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai-wizard/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === "text") {
                  assistantContent += parsed.text;
                  setMessages([...newMessages, { role: "assistant", content: assistantContent }]);
                }
              } catch { /* skip */ }
            }
          }
        }
      }

      setMessages([...newMessages, { role: "assistant", content: assistantContent }]);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages([...newMessages, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
      }
    } finally {
      setStreaming(false);
    }
  }, [messages]);

  return { messages, streaming, sendMessage };
}
```

**Step 4: Build the ButtonChips sub-component**

Renders the tappable button options below an AI message. Matches existing QuestionField radio/checkbox styling:

- Single-select: click one → immediately sends as user message
- Multi-select: toggle chips, show "Done" button to confirm. "Other" chip expands inline text input.
- Styling: Same as QuestionField radio buttons — `#ffffff` bg, `1.5px solid #e8e6df` border, selected gets `#fff5f2` bg + `#ff3d00` border + checkmark

```typescript
function ButtonChips({
  buttons,
  onSelect,
  disabled,
}: {
  buttons: ButtonsBlock;
  onSelect: (value: string) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [showOther, setShowOther] = useState(false);

  if (buttons.mode === "single") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
        {buttons.options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt)}
            style={{
              padding: "8px 18px",
              borderRadius: "3px",
              fontSize: "13px",
              fontFamily: "var(--font-sans)",
              border: "1.5px solid #e8e6df",
              background: "#ffffff",
              color: "#555553",
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {opt}
          </button>
        ))}
        {buttons.allowOther && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowOther(true)}
            style={{
              padding: "8px 18px",
              borderRadius: "3px",
              fontSize: "13px",
              fontFamily: "var(--font-sans)",
              border: "1.5px dashed #e8e6df",
              background: "#faf9f5",
              color: "#888886",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            Other…
          </button>
        )}
        {showOther && (
          <div style={{ display: "flex", gap: "8px", width: "100%", marginTop: "4px" }}>
            <input
              className="field"
              style={{ flex: 1, padding: "8px 12px", fontSize: "13px" }}
              placeholder="Type your answer…"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && otherText.trim()) onSelect(otherText.trim()); }}
              autoFocus
            />
            <button
              className="btn-orange"
              style={{ padding: "8px 16px", fontSize: "13px" }}
              disabled={!otherText.trim()}
              onClick={() => onSelect(otherText.trim())}
            >
              Send
            </button>
          </div>
        )}
      </div>
    );
  }

  // Multi-select mode
  const handleDone = () => {
    const all = [...selected];
    if (otherText.trim()) all.push(otherText.trim());
    onSelect(all.join(", "));
  };

  return (
    <div style={{ marginTop: "12px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {buttons.options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(active ? selected.filter((s) => s !== opt) : [...selected, opt])}
              style={{
                padding: "8px 18px",
                borderRadius: "3px",
                fontSize: "13px",
                fontFamily: "var(--font-sans)",
                border: active ? "1.5px solid #ff3d00" : "1.5px solid #e8e6df",
                background: active ? "#fff5f2" : "#ffffff",
                color: active ? "#ff3d00" : "#555553",
                cursor: disabled ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                fontWeight: active ? 500 : 400,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {active && <span style={{ marginRight: "6px" }}>✓</span>}
              {opt}
            </button>
          );
        })}
        {buttons.allowOther && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowOther(!showOther)}
            style={{
              padding: "8px 18px",
              borderRadius: "3px",
              fontSize: "13px",
              fontFamily: "var(--font-sans)",
              border: showOther ? "1.5px solid #ff3d00" : "1.5px dashed #e8e6df",
              background: showOther ? "#fff5f2" : "#faf9f5",
              color: showOther ? "#ff3d00" : "#888886",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            Other…
          </button>
        )}
      </div>
      {showOther && (
        <input
          className="field"
          style={{ marginTop: "8px", padding: "8px 12px", fontSize: "13px" }}
          placeholder="Type additional option…"
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          autoFocus
        />
      )}
      {(selected.length > 0 || otherText.trim()) && (
        <button
          className="btn-orange"
          style={{ marginTop: "12px", padding: "8px 24px", fontSize: "13px" }}
          disabled={disabled}
          onClick={handleDone}
        >
          Done →
        </button>
      )}
    </div>
  );
}
```

**Step 5: Build the main AiWizardChat component**

The main component renders:
- Obsession wordmark at top
- Back button (← Back to options)
- Scrollable message area
- Sticky input at bottom

Layout and styling matches ModeSelector/FormShell patterns — `#faf9f5` background, `max-width: 680px`, centered.

```typescript
export function AiWizardChat({ onComplete, onBack }: AiWizardChatProps) {
  const { messages, streaming, sendMessage } = useAiChat();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [completedButtons, setCompletedButtons] = useState<Set<number>>(new Set());

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send initial greeting on mount
  const hasGreeted = useRef(false);
  useEffect(() => {
    if (!hasGreeted.current) {
      hasGreeted.current = true;
      // Trigger the AI to send its opening message
      sendMessage("Hi, I'd like help filling out the website questionnaire.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for form completion in latest assistant message
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant" && !streaming) {
      const segments = parseMessage(lastMsg.content);
      const complete = segments.find((s) => s.type === "form_complete");
      if (complete?.formData) {
        // Delay briefly so user sees the completion message
        setTimeout(() => {
          onComplete(complete.formData!.mode, complete.formData!.data);
        }, 2000);
      }
    }
  }, [messages, streaming, onComplete]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    setInput("");
    sendMessage(trimmed);
  };

  const handleButtonSelect = (messageIndex: number, value: string) => {
    setCompletedButtons((prev) => new Set(prev).add(messageIndex));
    sendMessage(value);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#faf9f5",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    }}>
      {/* Header */}
      <div style={{
        width: "100%",
        maxWidth: "680px",
        padding: "24px 24px 0",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <button
          onClick={onBack}
          className="btn-back"
          style={{ fontSize: "13px", padding: "8px 16px" }}
        >
          ← Back
        </button>
        <div style={{
          fontFamily: "var(--font-serif)",
          fontWeight: 700,
          fontSize: "16px",
          color: "#111110",
        }}>
          Obsession<span style={{ color: "#ff3d00" }}>.</span>
        </div>
      </div>

      {/* Chat title */}
      <div style={{
        width: "100%",
        maxWidth: "680px",
        padding: "32px 24px 16px",
      }}>
        <p style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#ff3d00",
          marginBottom: "8px",
        }}>
          AI Assisted Questionnaire
        </p>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontWeight: 700,
          fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
          color: "#111110",
          lineHeight: 1.2,
        }}>
          Let's build your brief together
        </h1>
      </div>

      {/* Messages area */}
      <div style={{
        flex: 1,
        width: "100%",
        maxWidth: "680px",
        padding: "16px 24px",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}>
        {messages.map((msg, i) => {
          if (msg.role === "user") {
            // Don't show the initial auto-greeting
            if (i === 0 && msg.content === "Hi, I'd like help filling out the website questionnaire.") return null;
            return (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{
                  maxWidth: "85%",
                  padding: "12px 16px",
                  borderRadius: "6px",
                  background: "#f3f1eb",
                  fontFamily: "var(--font-sans)",
                  fontSize: "14px",
                  color: "#111110",
                  lineHeight: 1.55,
                }}>
                  {msg.content}
                </div>
              </div>
            );
          }

          // Assistant message — parse for buttons
          const segments = parseMessage(msg.content);
          const isLastAssistant = i === messages.length - 1;

          return (
            <div key={i} style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{
                maxWidth: "85%",
                padding: "14px 18px",
                borderRadius: "6px",
                background: "#ffffff",
                border: "1.5px solid #e8e6df",
                fontFamily: "var(--font-sans)",
                fontSize: "14px",
                color: "#111110",
                lineHeight: 1.55,
              }}>
                {segments.map((seg, j) => {
                  if (seg.type === "text") {
                    return <p key={j} style={{ marginBottom: j < segments.length - 1 ? "8px" : 0 }}>{seg.content}</p>;
                  }
                  if (seg.type === "buttons" && seg.buttons) {
                    const buttonsDisabled = streaming || completedButtons.has(i) || !isLastAssistant;
                    return (
                      <ButtonChips
                        key={j}
                        buttons={seg.buttons}
                        onSelect={(val) => handleButtonSelect(i, val)}
                        disabled={buttonsDisabled}
                      />
                    );
                  }
                  if (seg.type === "form_complete") {
                    return (
                      <div key={j} style={{
                        marginTop: "12px",
                        padding: "12px 16px",
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: "4px",
                        fontFamily: "var(--font-sans)",
                        fontSize: "13px",
                        color: "#166534",
                      }}>
                        Preparing your questionnaire…
                      </div>
                    );
                  }
                  return null;
                })}
                {/* Streaming indicator */}
                {streaming && isLastAssistant && msg.content === "" && (
                  <div style={{ display: "flex", gap: "4px", padding: "4px 0" }}>
                    {[0, 1, 2].map((d) => (
                      <div key={d} style={{
                        width: "6px", height: "6px", borderRadius: "50%",
                        background: "#ff3d00", opacity: 0.4,
                        animation: `pulse 1.2s ease-in-out ${d * 0.2}s infinite`,
                      }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        width: "100%",
        maxWidth: "680px",
        padding: "16px 24px 32px",
        background: "#faf9f5",
        position: "sticky",
        bottom: 0,
      }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            className="field"
            style={{ flex: 1, fontSize: "14px" }}
            placeholder={streaming ? "Waiting for response…" : "Type your answer…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            disabled={streaming}
          />
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "4px",
              border: "none",
              background: input.trim() && !streaming ? "#ff3d00" : "#e8e6df",
              color: "#ffffff",
              fontSize: "18px",
              cursor: input.trim() && !streaming ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.12s",
              flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 6: Add the pulse animation to globals.css**

Add to `app/globals.css`:
```css
@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
```

**Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 8: Commit**

```bash
git add components/form/AiWizardChat.tsx app/globals.css
git commit -m "feat: create AiWizardChat component with streaming chat UI"
```

---

### Task 7: Add AI-filled banner to form review

**Files:**
- Modify: `components/form/FormShell.tsx`

**Step 1: Track whether form was AI-filled**

Add state:
```typescript
const [aiFilledMode, setAiFilledMode] = useState<QuestionnaireMode | null>(null);
```

Update the AI wizard completion handler to set this:
```typescript
onComplete={(m, data) => {
  bulkSetFormData(m, data);
  setAiWizardActive(false);
  setAiFilledMode(m);
}}
```

**Step 2: Render the banner**

Inside the form layout, before the StepCard, add:

```typescript
{aiFilledMode && (
  <div style={{
    maxWidth: "620px",
    margin: "0 auto 24px",
    padding: "14px 18px",
    background: "#fff5f2",
    border: "1px solid #ffcdc0",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontFamily: "var(--font-sans)",
    fontSize: "13px",
    color: "#111110",
  }}>
    <span style={{ fontSize: "16px", flexShrink: 0 }}>✨</span>
    <span>
      <strong>AI-filled</strong> — review your answers and edit anything before submitting.
    </span>
  </div>
)}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add components/form/FormShell.tsx
git commit -m "feat: add AI-filled review banner to form"
```

---

### Task 8: Verify ANTHROPIC_API_KEY is configured

**Files:**
- Check: `.env.local`

**Step 1: Check if the key exists**

Run: `grep ANTHROPIC_API_KEY .env.local`

If it exists, this task is done. If not, add a placeholder and warn the user:

```
ANTHROPIC_API_KEY=sk-ant-...
```

**Step 2: Commit (only if .env.example was updated)**

No commit needed for .env.local (gitignored).

---

### Task 9: End-to-end manual test

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Navigate to /start**

Verify:
- 4 cards appear (Quick, Standard, In-Depth, AI Assisted)
- AI Assisted card has "Recommended" badge and orange border
- Standard card no longer has "Most common" badge

**Step 3: Click "Start Chat →"**

Verify:
- Full-page chat UI appears with back button and wordmark
- AI sends opening message after a moment
- Typing indicator shows while streaming

**Step 4: Have a conversation**

- Answer the AI's questions using both typed text and button options
- Verify buttons render correctly (single-select sends immediately, multi-select has Done button)
- Verify "Other" option works on multi-select

**Step 5: Complete the conversation**

Verify:
- AI emits form completion signal
- "Preparing your questionnaire…" indicator appears
- Transitions to pre-filled form with AI-filled banner
- All fields are populated with data from the conversation
- Can edit fields and submit normally

**Step 6: Commit final verification**

```bash
git add -A
git commit -m "feat: AI wizard for questionnaire forms - complete"
```

---

## Summary

| Task | Description | Estimated Effort |
|------|-------------|-----------------|
| 1 | bulkSetFormData hook method | Small |
| 2 | AI wizard card on ModeSelector | Medium |
| 3 | Wire into FormShell | Small |
| 4 | System prompt module | Medium |
| 5 | Streaming API route | Medium |
| 6 | AiWizardChat component (largest) | Large |
| 7 | AI-filled banner | Small |
| 8 | Verify API key | Trivial |
| 9 | End-to-end test | Medium |

**Dependencies:** Task 1 → 3 → 7. Task 4 → 5. Task 2 is independent. Task 6 depends on 5. Task 9 depends on all.

**Parallelizable:** Tasks 1, 2, 4 can all run in parallel. Task 5 + 6 can start once 4 is done.
