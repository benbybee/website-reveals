"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import type {
  Client,
  Task,
  TaskPriority,
} from "@/lib/types/client-tasks";
import { TASK_PRIORITIES, PREDEFINED_TAGS } from "@/lib/types/client-tasks";

interface AddTaskModalProps {
  clients: Client[];
  defaultClientId?: string;
  onClose: () => void;
  onCreated: (task: Task) => void;
}

export default function AddTaskModal({
  clients,
  defaultClientId,
  onClose,
  onCreated,
}: AddTaskModalProps) {
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [clientSearch, setClientSearch] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [timeEstimate, setTimeEstimate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const overlayRef = useRef<HTMLDivElement>(null);
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  // Close client dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        clientDropdownRef.current &&
        !clientDropdownRef.current.contains(e.target as Node)
      ) {
        setClientDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedClient = clients.find((c) => c.id === clientId);

  const filteredClients = clients.filter((c) => {
    const q = clientSearch.toLowerCase();
    if (!q) return true;
    return (
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      c.company_name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function addCustomTag() {
    const tag = customTagInput.trim();
    if (tag && !selectedTags.includes(tag)) {
      setSelectedTags((prev) => [...prev, tag]);
    }
    setCustomTagInput("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!clientId) {
      setError("Please select a client.");
      return;
    }
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        client_id: clientId,
        title: title.trim(),
        priority,
        tags: selectedTags,
      };
      if (description.trim()) body.description = description.trim();
      if (dueDate) body.due_date = dueDate;
      if (timeEstimate) body.time_estimate_minutes = Number(timeEstimate);

      const res = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }

      const task: Task = await res.json();
      onCreated(task);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          background: "#fff",
          borderRadius: 6,
          padding: 28,
          boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 600,
            fontFamily: "var(--font-serif)",
            marginBottom: 20,
            marginTop: 0,
          }}
        >
          Add New Task
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Client */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Client</label>
            <div ref={clientDropdownRef} style={{ position: "relative" }}>
              <input
                type="text"
                placeholder={
                  selectedClient
                    ? `${selectedClient.first_name} ${selectedClient.last_name} — ${selectedClient.company_name}`
                    : "Search clients…"
                }
                value={clientDropdownOpen ? clientSearch : ""}
                onFocus={() => {
                  setClientDropdownOpen(true);
                  setClientSearch("");
                }}
                onChange={(e) => setClientSearch(e.target.value)}
                style={inputStyle}
              />
              {!clientDropdownOpen && selectedClient && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    fontSize: 14,
                    fontFamily: "var(--font-sans)",
                    pointerEvents: "none",
                  }}
                >
                  {selectedClient.first_name} {selectedClient.last_name}{" "}
                  <span style={{ color: "#888886", marginLeft: 6 }}>
                    — {selectedClient.company_name}
                  </span>
                </div>
              )}
              {clientDropdownOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "#fff",
                    border: "1.5px solid #d8d6cf",
                    borderRadius: 3,
                    maxHeight: 180,
                    overflowY: "auto",
                    zIndex: 10,
                  }}
                >
                  {filteredClients.length === 0 && (
                    <div
                      style={{
                        padding: "8px 12px",
                        fontSize: 13,
                        color: "#888886",
                      }}
                    >
                      No clients found
                    </div>
                  )}
                  {filteredClients.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setClientId(c.id);
                        setClientDropdownOpen(false);
                        setClientSearch("");
                      }}
                      style={{
                        padding: "8px 12px",
                        fontSize: 14,
                        cursor: "pointer",
                        background: c.id === clientId ? "#f0efea" : "transparent",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#f0efea")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          c.id === clientId ? "#f0efea" : "transparent")
                      }
                    >
                      {c.first_name} {c.last_name}{" "}
                      <span style={{ color: "#888886" }}>
                        — {c.company_name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description…"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {/* Priority */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              style={inputStyle}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Tags</label>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 8,
              }}
            >
              {PREDEFINED_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    style={{
                      fontSize: 11,
                      background: active ? "#ff3d00" : "#f0efea",
                      color: active ? "#fff" : "inherit",
                      borderRadius: 2,
                      padding: "3px 8px",
                      cursor: "pointer",
                      border: "1px solid transparent",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
              {selectedTags
                .filter(
                  (t) =>
                    !(PREDEFINED_TAGS as readonly string[]).includes(t)
                )
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    style={{
                      fontSize: 11,
                      background: "#ff3d00",
                      color: "#fff",
                      borderRadius: 2,
                      padding: "3px 8px",
                      cursor: "pointer",
                      border: "1px solid transparent",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {tag} &times;
                  </button>
                ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomTag();
                  }
                }}
                placeholder="Custom tag…"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={addCustomTag}
                style={{
                  fontSize: 12,
                  padding: "6px 12px",
                  background: "#f0efea",
                  border: "1.5px solid #d8d6cf",
                  borderRadius: 3,
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                }}
              >
                Add
              </button>
            </div>
          </div>

          {/* Due Date + Time Estimate row */}
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Time Estimate (min)</label>
              <input
                type="number"
                min={0}
                value={timeEstimate}
                onChange={(e) => setTimeEstimate(e.target.value)}
                placeholder="e.g. 60"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                color: "#d32f2f",
                fontSize: 13,
                marginBottom: 12,
                fontFamily: "var(--font-sans)",
              }}
            >
              {error}
            </div>
          )}

          {/* Buttons */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 8,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 20px",
                fontSize: 14,
                background: "transparent",
                border: "1.5px solid #d8d6cf",
                borderRadius: 3,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "8px 20px",
                fontSize: 14,
                background: loading ? "#ff8a65" : "#ff3d00",
                color: "#fff",
                border: "none",
                borderRadius: 3,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "var(--font-sans)",
                fontWeight: 500,
              }}
            >
              {loading ? "Creating…" : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "#888886",
  fontFamily: "var(--font-mono)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1.5px solid #d8d6cf",
  borderRadius: 3,
  padding: "8px 12px",
  fontSize: 14,
  fontFamily: "var(--font-sans)",
  outline: "none",
  boxSizing: "border-box",
};
