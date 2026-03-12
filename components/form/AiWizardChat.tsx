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

/* ── Message parsing ── */

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
      } catch {
        /* skip malformed */
      }
    } else if (completeMatch) {
      if (textBuffer.trim()) {
        segments.push({ type: "text", content: textBuffer.trim() });
        textBuffer = "";
      }
      try {
        segments.push({
          type: "form_complete",
          content: line,
          formData: JSON.parse(completeMatch[1]),
        });
      } catch {
        /* skip malformed */
      }
    } else {
      textBuffer += line + "\n";
    }
  }

  if (textBuffer.trim()) {
    segments.push({ type: "text", content: textBuffer.trim() });
  }

  return segments;
}

/* ── Streaming chat hook ── */

function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (userMessage: string) => {
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
                    setMessages([
                      ...newMessages,
                      { role: "assistant", content: assistantContent },
                    ]);
                  }
                } catch {
                  /* skip */
                }
              }
            }
          }
        }

        setMessages([...newMessages, { role: "assistant", content: assistantContent }]);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages([
            ...newMessages,
            { role: "assistant", content: "Sorry, something went wrong. Please try again." },
          ]);
        }
      } finally {
        setStreaming(false);
      }
    },
    [messages]
  );

  return { messages, streaming, sendMessage };
}

/* ── ButtonChips sub-component ── */

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
              onKeyDown={(e) => {
                if (e.key === "Enter" && otherText.trim()) onSelect(otherText.trim());
              }}
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
              onClick={() =>
                setSelected(active ? selected.filter((s) => s !== opt) : [...selected, opt])
              }
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

/* ── Main AiWizardChat component ── */

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
    <div
      style={{
        minHeight: "100vh",
        background: "#faf9f5",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Header */}
      <div
        style={{
          width: "100%",
          maxWidth: "680px",
          padding: "24px 24px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <button onClick={onBack} className="btn-back" style={{ fontSize: "13px", padding: "8px 16px" }}>
          ← Back
        </button>
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 700,
            fontSize: "16px",
            color: "#111110",
          }}
        >
          Obsession<span style={{ color: "#ff3d00" }}>.</span>
        </div>
      </div>

      {/* Chat title */}
      <div
        style={{
          width: "100%",
          maxWidth: "680px",
          padding: "32px 24px 16px",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#ff3d00",
            marginBottom: "8px",
          }}
        >
          AI Assisted Questionnaire
        </p>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 700,
            fontSize: "clamp(1.25rem, 3vw, 1.75rem)",
            color: "#111110",
            lineHeight: 1.2,
          }}
        >
          Let&apos;s build your brief together
        </h1>
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          width: "100%",
          maxWidth: "680px",
          padding: "16px 24px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {messages.map((msg, i) => {
          if (msg.role === "user") {
            // Don't show the initial auto-greeting
            if (i === 0 && msg.content === "Hi, I'd like help filling out the website questionnaire.")
              return null;
            return (
              <div key={i} style={{ display: "flex", justifyContent: "flex-end" }}>
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "12px 16px",
                    borderRadius: "6px",
                    background: "#f3f1eb",
                    fontFamily: "var(--font-sans)",
                    fontSize: "14px",
                    color: "#111110",
                    lineHeight: 1.55,
                  }}
                >
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
              <div
                style={{
                  maxWidth: "85%",
                  padding: "14px 18px",
                  borderRadius: "6px",
                  background: "#ffffff",
                  border: "1.5px solid #e8e6df",
                  fontFamily: "var(--font-sans)",
                  fontSize: "14px",
                  color: "#111110",
                  lineHeight: 1.55,
                }}
              >
                {segments.map((seg, j) => {
                  if (seg.type === "text") {
                    return (
                      <p key={j} style={{ marginBottom: j < segments.length - 1 ? "8px" : 0 }}>
                        {seg.content}
                      </p>
                    );
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
                      <div
                        key={j}
                        style={{
                          marginTop: "12px",
                          padding: "12px 16px",
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          borderRadius: "4px",
                          fontFamily: "var(--font-sans)",
                          fontSize: "13px",
                          color: "#166534",
                        }}
                      >
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
                      <div
                        key={d}
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: "#ff3d00",
                          opacity: 0.4,
                          animation: `pulse 1.2s ease-in-out ${d * 0.2}s infinite`,
                        }}
                      />
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
      <div
        style={{
          width: "100%",
          maxWidth: "680px",
          padding: "16px 24px 32px",
          background: "#faf9f5",
          position: "sticky",
          bottom: 0,
        }}
      >
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            className="field"
            style={{ flex: 1, fontSize: "14px" }}
            placeholder={streaming ? "Waiting for response…" : "Type your answer…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
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
