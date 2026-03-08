"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getStepsForMode } from "@/lib/form-steps";
import { useFormSession } from "@/lib/use-form-session";
import { FormLayout } from "./FormLayout";
import { ModeSelector } from "./ModeSelector";
import { StepCard } from "./StepCard";
import { QuestionField } from "./QuestionField";
import { SaveModal } from "./SaveModal";

interface FormShellProps {
  initialToken?: string;
}

export function FormShell({ initialToken }: FormShellProps) {
  const router = useRouter();
  const {
    token,
    mode,
    setMode,
    resetMode,
    currentStep,
    formData,
    loading,
    saving,
    updateField,
    saveToServer,
    nextStep,
    prevStep,
  } = useFormSession(initialToken);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [direction, setDirection] = useState(1);
  const [errors, setErrors] = useState<string[]>([]);
  const topRef = useRef<HTMLDivElement>(null);

  const steps = mode ? getStepsForMode(mode) : [];
  const step = steps[currentStep - 1];
  const totalSteps = steps.length;
  const isLastStep = currentStep === totalSteps;

  const scrollToTop = () => {
    topRef.current?.scrollIntoView({ behavior: "instant" });
  };

  const handleNext = useCallback(async () => {
    // Validate required fields
    const missing = step.questions
      .filter((q) => q.required && !formData[q.id])
      .map((q) => q.id);
    if (missing.length > 0) {
      setErrors(missing);
      topRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setErrors([]);
    setDirection(1);
    scrollToTop();
    if (isLastStep) {
      setSubmitting(true);
      try {
        const t = await saveToServer();
        await fetch(`/api/form/${t}/submit`, { method: "POST" });
        router.push("/success");
      } catch {
        setSubmitting(false);
      }
    } else {
      await nextStep();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLastStep, saveToServer, nextStep, router, step, formData]);

  const handleSaveEmail = useCallback(
    async (email: string) => {
      const t = await saveToServer();
      await fetch(`/api/form/${t}/save-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    },
    [saveToServer]
  );

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#faf9f5" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "50%", border: "2px solid #e8e6df", borderTopColor: "#ff3d00", animation: "spin 0.7s linear infinite" }} />
      </div>
    );
  }

  if (!mode) {
    return <ModeSelector onSelect={setMode} />;
  }

  return (
    <>
      <div ref={topRef} />
      <FormLayout
        currentStep={currentStep}
        totalSteps={totalSteps}
        onSave={() => setSaveModalOpen(true)}
      >
        <StepCard stepKey={currentStep} direction={direction} icon={step.icon} title={step.title} subtitle={step.subtitle}>
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            {step.questions.map((q) => (
              <QuestionField
                key={q.id}
                question={q}
                value={formData[q.id]}
                onChange={(v) => { updateField(q.id, v); setErrors((e) => e.filter((id) => id !== q.id)); }}
                sessionToken={token ?? undefined}
                hasError={errors.includes(q.id)}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "48px", paddingTop: "28px", borderTop: "1px solid #e8e6df" }}>
            <button
              onClick={() => {
                setErrors([]);
                scrollToTop();
                if (currentStep === 1) {
                  resetMode();
                } else {
                  setDirection(-1);
                  prevStep();
                }
              }}
              className="btn-back"
            >
              ← Back
            </button>

            <button
              onClick={handleNext}
              disabled={submitting || saving}
              className="btn-orange"
              style={{ opacity: submitting || saving ? 0.5 : 1, cursor: submitting || saving ? "not-allowed" : "pointer" }}
            >
              {submitting
                ? "Submitting…"
                : isLastStep
                ? "Submit Questionnaire →"
                : "Next Step →"}
            </button>
          </div>
        </StepCard>
      </FormLayout>

      <SaveModal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSave={handleSaveEmail}
      />
    </>
  );
}
