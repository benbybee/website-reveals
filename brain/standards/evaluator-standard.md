# Evaluator Standard

> Vendor-neutral. Defines what counts as a real evaluator inside a loop. Required by the Loop Engineering Constitution, Article III.

## Definition
An **evaluator** is the part of a loop that decides whether the goal was actually achieved — independently of whether the executor "ran without error." Absence of an exception is not evaluation.

## Levels of evaluation
| Level | Description | Trust |
|---|---|---|
| **L0 — None** | Only "did not throw." | Not an evaluator. Record as a gap. |
| **L1 — Structural** | Output exists and is well-formed (required fields present, schema valid, asset reachable). | Weak but real. |
| **L2 — Semantic** | Output meets a quality/threshold rule (score ≥ gate, address is mailable, signature valid + fresh). | Standard for most loops. |
| **L3 — Adversarial / independent** | A second, independent check tries to falsify the result before it is accepted. | Required for irreversible or costly outcomes. |

## Properties of a good evaluator
- **Falsifiable** — it can say "no," and "no" changes what happens next.
- **Placed before the irreversible step** — evaluate, then send/charge/dispatch, never the reverse.
- **Deterministic or bounded** — same input, same verdict (or an explicit, bounded tolerance).
- **Observable** — its verdict is recorded (a stage, a missing[] list, a status), not just branched on.
- **Single-sourced** — one function owns the verdict; callers do not re-implement it.

## Placement in the stage machine
A loop that moves work through stages evaluates **at the stage boundary**: the evaluator's verdict chooses the next stage (e.g. complete → qualified, incomplete → held). The stage itself becomes the durable record of the verdict.

## When the evaluator is missing
If a loop has no evaluator, or only an L0 check:
1. Document it in the gap matrix with the loop name and the risk it creates.
2. Do not silently treat L0 as a pass in the loop register.
3. Propose the smallest real evaluator (often an L1 structural check) as the next step.

## Anti-patterns
- Wrapping the executor in a catch and calling the absence of logs "success."
- Evaluating after the irreversible action ("we'll see if the partner complains").
- Duplicating the gate logic at every call site so versions drift.
- A threshold with no observability, so a regression in pass-rate is invisible.
