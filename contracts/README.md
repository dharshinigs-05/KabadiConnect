# KabadiConnect contracts

This directory is the frozen, versioned machine-readable contract for KabadiConnect v2. `SPEC.md` explains the contract; these files are the source of truth used by frontend, backend, database, and ML work.

Do not edit `/contracts` directly during feature work. Any change requires a change request in `docs/change-requests/{part}-NNN.md`, including the proposed shape and downstream impact, followed by integration-owner approval.

All IDs are UUID strings, timestamps are ISO 8601 UTC, and INR monetary values are decimal strings (for example, `"132.50"`).
