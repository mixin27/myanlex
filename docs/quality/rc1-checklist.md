# RC1 preparation checklist

Status: **not approved for release or public beta**. This milestone supplies
evidence tooling and review material; it does not create an RC tag or deploy.

## NLP evidence

- [ ] Retain passing `pnpm check` and `pnpm quality:report` artifacts from the
      exact clean candidate commit, with dataset hashes and toolchain versions.
- [ ] Compare against an explicitly retained baseline; explain removed/changed
      cases and investigate every regression. No baseline means no historical
      regression claim.
- [ ] Complete the [independent reviewer workflow](reviewer-guide.md), resolve
      required corrections, and link reviewer names, dates and case
      dispositions.
- [ ] Review provenance/redistribution declarations and third-party notices;
      automated metadata presence checks are not legal approval.
- [ ] Resolve or explicitly scope the [coverage gaps](coverage-gaps.md). Do not
      publish an accuracy percentage from regression pass counts.
- [ ] Verify public beta limitations match the actual API, SDKs and profiles.
      Automatic mixed-text conversion remains deferred, not a hidden promise.

## Engineering and launch gates (separate evidence)

- [ ] Record API/SDK/docs smoke checks, supported runtime checks and dependency
      audit results for the candidate. Conditional integration tests must run
      with PostgreSQL/Redis; a skipped suite is not verification.
- [ ] Complete outstanding [security verification](../security/hardening.md).
- [ ] Review production topology, rate-limit/quota settings, secret handling,
      OAuth/mail configuration and abuse controls.
- [ ] Retain staging load/outage evidence, alert routing and recovery sign-off
      per [staging validation](../staging-validation.md).
- [ ] Complete deployment packaging: production Docker builds, staging
      configuration, migration procedure, backups/restoration and deployment
      smoke checks. Verify rollback and restoration rather than merely
      documenting commands.
- [ ] Release owner explicitly approves scope, remaining risks, release notes
      and version/tag. This report is not that approval.

The next implementation milestone is deployment packaging. It can proceed while
review is coordinated, but implementation completion must not be confused with
permission to launch.

See the [deployment runbook](../deployment.md) for image targets, staging setup
and the isolated migration/restore smoke check. Record actual evidence before
checking the release gates above.
