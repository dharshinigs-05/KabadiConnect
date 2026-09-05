# CONTRACT GAP: pickup scheduling and transaction history

## Feature

Pickup scheduling, payment history, and traceability history in the collector and recycler applications.

## What exists

The frozen API permits the transaction state transition to `pickup_scheduled`, a handover trace-event write, a handover-confirm write, and payment recording. It does not expose a pickup entity or schedule payload. It also exposes no read endpoint for payment or trace-event history.

## Missing contract operations

1. A pickup schedule needs a transaction-scoped endpoint, request/response schema, and representation with date/time, pickup location, contact, notes, and status.
2. Traceability screens need a read-only paginated transaction timeline endpoint returning `TraceEvent` records.
3. Payment screens need a read-only paginated transaction payment endpoint returning `Payment` records.
4. Handover verification requires a contract-defined way to submit and persist verified weight; `TraceEventCreate` does not include it, while `Transaction.final_weight_kg` is otherwise not client writable.

## Minimum proposed shape (not implemented)

`POST /transactions/{id}/pickup` and `GET /transactions/{id}/pickup`, plus read-only `GET /transactions/{id}/trace-events` and `GET /transactions/{id}/payments`. A pickup response must contain `scheduled_at`, `location`, `contact`, `notes`, and a contract enum status. Handover needs a backend-authorized verified-weight field or dedicated endpoint.

No client endpoint or simulated success state has been created for these gaps.
