# Product proposal: Myanmar Editorial Workbench

Status: proposed consumer application, not implemented or a claim of proven
market demand. Deployment remains on hold.

## Recommended first product

A review/import tool for Myanmar-language publishers, archives and CMS teams.
Editors paste text or import a CSV, inspect encoding and structural problems,
compare proposed changes, and approve clean copies for export. The value is a
repeatable, auditable editorial workflow—not claiming automatic correction.

| User action                  | MyanLex API                             | Product responsibility                                                                              |
| ---------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Inspect imported text        | `/text/detect`                          | Show confidence/segments; route mixed or uncertain input to review                                  |
| Request a target encoding    | `/text/convert`, `validateSource: true` | Preserve original; display diff; require approval; never silently fall back to unchecked conversion |
| Normalize Unicode            | `/text/normalize`                       | Offer NFC preview after encoding review; no spelling/meaning claims                                 |
| Highlight structural issues  | `/orthography/validate`                 | Explain supported diagnostics using code-point spans                                                |
| Inspect text boundaries      | `/tokenize`, `/batch/syllabify`         | Display script/syllable boundaries, not dictionary word segmentation                                |
| Prepare catalog romanization | `/batch/transliterate`                  | Show incomplete/unsupported results; require editor review                                          |

MVP: paste/CSV import, original storage, inspection queue, side-by-side diff,
explicit approval, downloadable reviewed CSV, and an audit trail. Save the API
profile and request metadata with approved revisions. A failed row does not
discard other rows. Avoid re-submitting unchanged text unnecessarily.

Architecture: Next.js editor UI → Python service/worker using the Python SDK →
MyanLex API. PostgreSQL holds documents/revisions/review status; a queue such as
Redis-backed jobs is optional when imports outgrow request-response processing.
These are consumer-app concerns, not changes to MyanLex core.

Production acceptance requires access control and tenant isolation, file/row/
text-size bounds, safe CSV export (formula-injection protection), server-only
least-privilege API keys, retention/deletion controls, explicit data-processing
consent, bounded concurrency and quota-aware scheduling. Retry only
deliberately; a network failure can occur after a request was processed. Do not
log manuscript content. Browser highlights must translate code-point offsets to
UTF-16 indexes.

Mixed encoding remains a human-review case. Do not advertise this as a universal
converter, spellchecker, grammar checker, OCR engine, translator, or guarantee
of unchanged linguistic meaning. Independent Myanmar-language review of MyanLex
is still outstanding; production use should begin with a reviewed pilot.

## Other useful directions

1. **Legacy archive import assistant:** preserve historical originals, queue
   ambiguous encoding, and export reviewed Unicode records into existing
   archives.
2. **Library catalog romanization assistant:** create ALA-LC draft fields beside
   Myanmar titles, flag incomplete mappings, and record librarian approval.

The editorial workbench is the best first demonstration because its review queue
turns current uncertainty into an explicit user workflow rather than hiding it.
