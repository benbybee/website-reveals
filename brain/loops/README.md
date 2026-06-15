# Loops

The 8 major loops in WR, each documented with goal / executor / evaluator / retry / escalation / approval gate / observability / runtime-state mapping per the [Loop Engineering Constitution](../standards/loop-engineering-constitution.md). The [loop register](../loop-register.md) is the index.

- [L1 — Intake / onboarding](./intake-onboarding.md)
- [L2 — Ingestion (scrape → enrich → qualify)](./ingestion-scrape.md)
- [L3 — Build dispatch (intake, GTM push, conversion, mail)](./build-dispatch.md)
- [L4 — Dispatchr lifecycle events](./dispatchr-lifecycle.md)
- [L5 — Billing / invoicing](./billing-invoicing.md)
- [L6 — AI wizard / generation](./ai-wizard-generation.md)
- [L7 — Notification](./notification.md)
- [L8 — Stuck-build recovery](./stuck-build-recovery.md)
