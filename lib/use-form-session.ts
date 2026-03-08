"use client";

import { useState, useEffect, useCallback } from "react";
import { QuestionnaireMode } from "./form-steps";

const LOCAL_KEY = "om_form_session";

interface SessionState {
  token: string | null;
  currentStep: number;
  formData: Record<string, unknown>;
  dnsProvider: string;
  mode: QuestionnaireMode | null;
}

export function useFormSession(initialToken?: string) {
  const [state, setState] = useState<SessionState>({
    token: initialToken || null,
    currentStep: 1,
    formData: {},
    dnsProvider: "",
    mode: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // On mount: load from server (if token) or localStorage
  useEffect(() => {
    async function load() {
      if (initialToken) {
        const res = await fetch(`/api/form/${initialToken}`);
        if (res.ok) {
          const data = await res.json();
          setState({
            token: initialToken,
            currentStep: data.current_step,
            formData: data.form_data,
            dnsProvider: data.dns_provider || "",
            mode: (data.form_data?._mode as QuestionnaireMode) || null,
          });
        }
      } else {
        const saved = localStorage.getItem(LOCAL_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            // Ensure mode is always synced from formData as source of truth
            if (!parsed.mode && parsed.formData?._mode) {
              parsed.mode = parsed.formData._mode;
            }
            setState(parsed);
          } catch {
            // ignore malformed storage
          }
        }
      }
      setLoading(false);
    }
    load();
  }, [initialToken]);

  // Persist to localStorage on every state change
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    }
  }, [state, loading]);

  const ensureToken = useCallback(async (): Promise<string> => {
    if (state.token) return state.token;
    const res = await fetch("/api/form/start", { method: "POST" });
    const { token } = await res.json();
    setState((s) => ({ ...s, token }));
    return token;
  }, [state.token]);

  const setMode = useCallback((m: QuestionnaireMode) => {
    setState((s) => ({
      ...s,
      mode: m,
      currentStep: 1,
      formData: { ...s.formData, _mode: m },
    }));
  }, []);

  const resetMode = useCallback(() => {
    setState((s) => {
      const { _mode, ...rest } = s.formData as Record<string, unknown> & { _mode?: unknown };
      void _mode;
      return { ...s, mode: null, currentStep: 1, formData: rest };
    });
  }, []);

  const updateField = useCallback((fieldId: string, value: unknown) => {
    setState((s) => ({
      ...s,
      formData: { ...s.formData, [fieldId]: value },
      ...(fieldId === "dns_provider" ? { dnsProvider: value as string } : {}),
    }));
  }, []);

  const saveToServer = useCallback(async (): Promise<string> => {
    setSaving(true);
    const token = await ensureToken();
    await fetch(`/api/form/${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_step: state.currentStep,
        form_data: state.formData,
        dns_provider: state.dnsProvider || null,
      }),
    });
    setSaving(false);
    return token;
  }, [state, ensureToken]);

  const nextStep = useCallback(async () => {
    const newStep = Math.min(state.currentStep + 1, 12);
    setState((s) => ({ ...s, currentStep: newStep }));
    const token = await ensureToken();
    await fetch(`/api/form/${token}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        current_step: newStep,
        form_data: state.formData,
        dns_provider: state.dnsProvider || null,
      }),
    });
  }, [state, ensureToken]);

  const prevStep = useCallback(() => {
    setState((s) => ({ ...s, currentStep: Math.max(s.currentStep - 1, 1) }));
  }, []);

  return {
    ...state,
    loading,
    saving,
    setMode,
    resetMode,
    updateField,
    saveToServer,
    nextStep,
    prevStep,
  };
}
