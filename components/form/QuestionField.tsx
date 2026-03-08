"use client";

import { Question } from "@/lib/form-steps";
import { DnsSelector } from "./DnsSelector";

interface QuestionFieldProps {
  question: Question;
  value: unknown;
  onChange: (val: unknown) => void;
  sessionToken?: string | null;
  hasError?: boolean;
}

function Label({ q }: { q: Question }) {
  return (
    <label
      style={{
        display: "block",
        fontFamily: "var(--font-sans)",
        fontSize: "14px",
        fontWeight: 500,
        color: "#111110",
        marginBottom: "8px",
      }}
    >
      {q.label}
      {q.required && (
        <span style={{ color: "#ff3d00", marginLeft: "4px", fontSize: "12px" }}>*</span>
      )}
    </label>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <p
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        color: "#888886",
        marginBottom: "8px",
        letterSpacing: "0.02em",
      }}
    >
      {text}
    </p>
  );
}

export function QuestionField({ question, value, onChange, sessionToken, hasError }: QuestionFieldProps) {
  const errorBorder = hasError ? "1.5px solid #ff3d00" : undefined;
  const strVal = (value as string) || "";

  switch (question.type) {
    case "dns-selector":
      return (
        <div>
          <Label q={question} />
          <DnsSelector value={strVal} onChange={onChange} />
        </div>
      );

    case "textarea":
      return (
        <div>
          <Label q={question} />
          {question.hint && <Hint text={question.hint} />}
          <textarea
            className="field"
            style={{ minHeight: "100px", resize: "vertical", width: "100%" }}
            placeholder={question.placeholder}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );

    case "radio":
      return (
        <div>
          <Label q={question} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {question.options?.map((opt) => {
              const active = strVal === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange(opt)}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "3px",
                    fontSize: "13px",
                    fontFamily: "var(--font-sans)",
                    border: active ? "1.5px solid #ff3d00" : "1.5px solid #e8e6df",
                    background: active ? "#fff5f2" : "#ffffff",
                    color: active ? "#ff3d00" : "#888886",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {active && <span style={{ marginRight: "6px" }}>✓</span>}
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      );

    case "checkbox": {
      const arrVal = (value as string[]) || [];
      return (
        <div>
          <Label q={question} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "8px",
            }}
          >
            {question.options?.map((opt) => {
              const checked = arrVal.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    const next = checked ? arrVal.filter((v) => v !== opt) : [...arrVal, opt];
                    onChange(next);
                  }}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    borderRadius: "3px",
                    fontSize: "13px",
                    fontFamily: "var(--font-sans)",
                    border: checked ? "1.5px solid #ff3d00" : "1.5px solid #e8e6df",
                    background: checked ? "#fff5f2" : "#ffffff",
                    color: checked ? "#ff3d00" : "#888886",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    fontWeight: checked ? 500 : 400,
                  }}
                >
                  {checked && <span style={{ marginRight: "6px" }}>✓</span>}
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    case "file":
      return (
        <div>
          <Label q={question} />
          <label
            style={{
              position: "relative",
              display: "block",
              border: "2px dashed #e8e6df",
              borderRadius: "4px",
              padding: "36px 24px",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                fontSize: "28px",
                marginBottom: "8px",
                color: "#c8c6be",
              }}
            >
              ↑
            </div>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "13px",
                color: "#888886",
              }}
            >
              Click to upload or drag &amp; drop
            </p>
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                color: "#c8c6be",
                marginTop: "4px",
                letterSpacing: "0.06em",
              }}
            >
              PNG, JPG, PDF, AI, SVG, MP4
            </p>
            {strVal && (
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "#ff3d00",
                  marginTop: "8px",
                }}
              >
                ✓ {strVal}
              </p>
            )}
            <input
              type="file"
              multiple
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (!sessionToken || files.length === 0) return;
                for (const file of files) {
                  const fd = new FormData();
                  fd.append("file", file);
                  fd.append("token", sessionToken);
                  await fetch("/api/upload", { method: "POST", body: fd });
                }
                onChange(files.map((f) => f.name).join(", "));
              }}
            />
          </label>
        </div>
      );

    default:
      return (
        <div>
          <Label q={question} />
          <input
            type={question.type}
            className="field"
            style={{ width: "100%", ...(errorBorder ? { border: errorBorder } : {}) }}
            placeholder={question.placeholder}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
          />
          {hasError && (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#ff3d00", marginTop: "4px", letterSpacing: "0.02em" }}>
              This field is required
            </p>
          )}
        </div>
      );
  }
}
