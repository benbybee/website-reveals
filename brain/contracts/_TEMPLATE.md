# C<N> — <Seam name>

- **Owner (authoritative for shape):** <which side>
- **Consumers:** <which side reads it>
- **Direction:** outbound | inbound
- **Partner:** <partner>
- **Locality:** distributed remote | vendor | local
- **Version / change doctrine:** <version or "additive-only", etc.>
- **Lifecycle:** draft | active | deprecated | retired

## Endpoint / event
<exact path or event type(s)>

## Auth
<scheme, headers, env vars, freshness window>

## Payload shape
<key fields, from the real mapper/validator — cite file:line>

## Conformance checks
<the concrete checks that prove conformance and where they live>

## Failure / retry / escalation
<what happens on non-conforming or failed exchange>

## Source files
- <paths>

## Change protocol
ADR → `/cross-repo-review` → coordinated deploy. Prefer additive changes.

## Known gaps
- <gaps, linked to the gap matrix>
