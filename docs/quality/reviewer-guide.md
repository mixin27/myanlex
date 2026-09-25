# Independent linguistic review preparation

No reviewer has been assigned and no independent approval is claimed here.
Review is a human gate; generated results are preparation material only.

## Prepare the packet

1. Run `pnpm quality:report` on the candidate revision. Retain the printed run
   directory, including the machine-readable results and `review-queue.json`.
2. Provide the relevant specification under `docs/linguistic/`, the corpus file
   and its schema, provenance/license declarations, and the coverage-gap review.
3. Assign a qualified Myanmar-language reviewer for Burmese judgments and an
   appropriate language specialist before extending another language's scope.
   Record relevant expertise, conflicts, and whether they authored the rule or
   case. Source transcription is not independent linguistic review.
4. Inspect input and expected output as both rendered text and Unicode code
   points; verify half-open code-point spans. A font screenshot alone is not an
   encoding or boundary oracle.

The queue contains existing redistributable corpus material only. Keep private
examples out of public reviews until their provenance and redistribution terms
are established. Dataset-specific third-party terms still apply to the packet.

## Record each judgment

Use the following record in a review PR or a dated file under `docs/quality/`.
Do not insert placeholder names/dates and treat them as completed review.

```text
Candidate commit and corpus SHA-256:
Dataset path and exact case IDs:
Reviewer, expertise, independence/conflicts:
Review date:
Specification/profile and reference consulted:
Outcome: accept / correction required / unresolved / outside expertise
Expected boundaries, diagnostics or text, with code-point evidence:
Rationale and source citation:
Provenance/redistribution status of any proposed new examples:
Follow-up issue or correction PR:
```

Keep a case-by-case disposition. Partial review does not change the entire
dataset's `review_status`; retain `source_verified` until all relevant cases and
documented behavior have been reviewed, disagreements resolved, and the evidence
record is linked from the release checklist. Re-review affected cases after
changes; a hash mismatch invalidates claims about the previous snapshot.

## Acceptance and disagreements

A maintainer must check the evidence, license metadata, specification impact,
regression tests and public limitations before merging a correction. The
automated report never promotes review status. If reviewers disagree, retain the
ambiguity and block any stronger support claim; do not decide by majority of
converter outputs or by making expected results match the implementation.

A release approver separately records unresolved limitations and whether they
block the intended release scope. This guide does not waive independent review,
security review, deployment or operational gates.
