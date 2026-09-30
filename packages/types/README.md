# @myanlex/types

Unpublished developer preview. Pure TypeScript domain contracts shared by
MyanLex packages, including code-point spans and language-operation results.
This package does not process text or make network requests.

Offsets are zero-based, half-open Unicode code-point offsets, not JavaScript
UTF-16 indexes, byte offsets, or grapheme indexes. Keep spans with the exact
analyzed text.

ESM and TypeScript declarations are distributed. The types, core and application
packages are released as a coordinated version group. See the repository's
[package guide](https://github.com/mixin27/myanlex/blob/main/docs/publishing.md)
for preview artifacts, compatibility, and future registry installation.

MIT licensed. Stable public-contract and independent linguistic release approval
remain outstanding.
