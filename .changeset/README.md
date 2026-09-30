# Release notes

Run `pnpm changeset` for changes to public JavaScript packages. Describe the
consumer-visible change and choose a semantic version bump. Types, core and
application form one fixed release group; the HTTP SDK is independently
versioned and may also need a dependency update. Private applications are not
published.

Changesets does not manage Dart or Python versions. Follow docs/publishing.md
for their separate release procedures. No publication workflow is enabled here.

The current 0.0.0 artifacts are development previews, not an approved release.
Do not run versioning, prerelease or publishing commands just to test this
setup.
