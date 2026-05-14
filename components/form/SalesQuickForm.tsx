"use client";

import { useState, useCallback, useRef } from "react";
import { SALES_QUICK_STEPS } from "@/lib/form-steps";
import { FormLayout } from "./FormLayout";
import { StepCard } from "./StepCard";
import { QuestionField } from "./QuestionField";

const INITIAL_FORM_DATA: Record<string, unknown> = {
  _source: "sales",
  _mode: "quick",
};

export function SalesQuickForm() {
  const [token, setToken] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<Record<string, unknown>>(INITIAL_FORM_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [direction, setDirection] = useState(1);
  const [submittedFor, setSubmittedFor] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const steps = SALES_QUICK_STEPS;
  const step = steps[currentStep - 1];
  const totalSteps = steps.length;
  const isLastStep = currentStep === totalSteps;

  const scrollToTop = () => {
    topRef.current?.scrollIntoView({ behavior: "instant" });
  };

  const ensureToken = useCallback(async (): Promise<string> => {
    if (token) return token;
    const res = await fetch("/api/form/start", { method: "POST" });
    if (!res.ok) throw new Error("Could not create form session");
    const { token: newToken } = await res.json();
    setToken(newToken);
    return newToken;
  }, [token]);

  const saveStep = useCallback(
    async (t: string, step: number, data: Record<string, unknown>) => {
      const res = await fetch(`/api/form/${t}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_step: step,
          form_data: data,
          dns_provider: (data.dns_provider as string) || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save form data");
    },
    [],
  );

  const updateField = useCallback((id: string, value: unknown) => {
    setFormData((d) => ({ ...d, [id]: value }));
    setErrors((e) => e.filter((x) => x !== id));
  }, []);

  const resetForm = useCallback(() => {
    setToken(null);
    setCurrentStep(1);
    setFormData(INITIAL_FORM_DATA);
    setErrors([]);
    setDirection(1);
    setSubmittedFor(null);
    setSubmitError(null);
  }, []);

  const handleNext = useCallback(async () => {
    const missing = step.questions
      .filter((q) => q.required && !formData[q.id])
      .map((q) => q.id);
    if (missing.length > 0) {
      setErrors(missing);
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setErrors([]);
    setSubmitError(null);
    setDirection(1);
    scrollToTop();

    if (isLastStep) {
      setSubmitting(true);
      try {
        const t = await ensureToken();
        await saveStep(t, currentStep, formData);
        const res = await fetch(`/api/form/${t}/submit`, { method: "POST" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `Submission failed (${res.status})`);
        }
        setSubmittedFor((formData.business_name as string) || "the business");
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Submission failed");
      } finally {
        setSubmitting(false);
      }
    } else {
      const newStep = currentStep + 1;
      setCurrentStep(newStep);
      try {
        const t = await ensureToken();
        await saveStep(t, newStep, formData);
      } catch (err) {
        console.error("[sales-form] save failed:", err);
      }
    }
  }, [step, formData, isLastStep, currentStep, ensureToken, saveStep]);

  const handleBack = () => {
    setErrors([]);
    setSubmitError(null);
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep((s) => Math.max(1, s - 1));
      scrollToTop();
    }
  };

  if (submittedFor) {
    return (
      <FormLayout currentStep={totalSteps} totalSteps={totalSteps}>
        <div
          style={{
            background: "#ffffff",
            border: "1.5px solid #e8e6df",
            borderRadius: "6px",
            padding: "40px 32px",
            textAlign: "center",
            fontFamily: "var(--font-sans)",
          }}
        >
          <div style={{ fontSize: "44px", marginBottom: "16px" }}>✅</div>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontWeight: 700,
              fontSize: "clamp(1.5rem, 3vw, 1.9rem)",
              color: "#111110",
              marginBottom: "12px",
            }}
          >
            Submitted
          </h1>
          <p style={{ fontSize: "15px", color: "#555553", lineHeight: 1.6, marginBottom: "8px" }}>
            <strong>{submittedFor}</strong> is queued for build.
          </p>
          <p style={{ fontSize: "13px", color: "#888886", lineHeight: 1.6, marginBottom: "28px" }}>
            We&apos;ll email you when the site is ready for review.
          </p>
          <button onClick={resetForm} className="btn-orange" style={{ fontSize: "14px", padding: "12px 28px" }}>
            Submit another →
          </button>
        </div>
      </FormLayout>
    );
  }

  return (
    <>
      <div ref={topRef} />
      <FormLayout currentStep={currentStep} totalSteps={totalSteps}>
        <StepCard stepKey={currentStep} direction={direction} icon={step.icon} title={step.title} subtitle={step.subtitle}>
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            {step.questions.map((q) => (
              <QuestionField
                key={q.id}
                question={q}
                value={formData[q.id]}
                onChange={(v) => updateField(q.id, v)}
                sessionToken={token ?? undefined}
                hasError={errors.includes(q.id)}
              />
            ))}
          </div>

          {submitError && (
            <div
              style={{
                marginTop: "24px",
                padding: "12px 16px",
                background: "#fff5f2",
                border: "1px solid #ffcdc0",
                borderRadius: "4px",
                fontFamily: "var(--font-sans)",
                fontSize: "13px",
                color: "#b3300a",
              }}
            >
              {submitError}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "48px",
              paddingTop: "28px",
              borderTop: "1px solid #e8e6df",
            }}
          >
            <button
              onClick={handleBack}
              disabled={currentStep === 1}
              className="btn-back"
              style={{ opacity: currentStep === 1 ? 0.4 : 1, cursor: currentStep === 1 ? "not-allowed" : "pointer" }}
            >
              ← Back
            </button>

            <button
              onClick={handleNext}
              disabled={submitting}
              className="btn-orange"
              style={{ opacity: submitting ? 0.5 : 1, cursor: submitting ? "not-allowed" : "pointer" }}
            >
              {submitting ? "Submitting…" : isLastStep ? "Submit →" : "Next Step →"}
            </button>
          </div>
        </StepCard>
      </FormLayout>
    </>
  );
}
