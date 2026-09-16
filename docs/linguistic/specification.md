# Linguistic specification

This directory defines MyanLex linguistic behavior. Until a rule is written here
and supported by reviewed corpus cases, it must not be treated as settled
project behavior.

Current specifications:

- [Character classes](character-classes.md), pinned to Unicode 17.0.0.
- [Myanmar sequence recognition](sequences.md) for Burmese kinzi and consonant
  stacks.
- [Safe Unicode normalization](normalization.md), using NFC only.

## First specification milestone

The initial specification must define:

- supported Unicode and Zawgyi input states;
- normalization profiles and safe transformations;
- syllable boundary rules;
- behavior for kinzi, medials, asat, virama, and stacked consonants;
- digits, punctuation, whitespace, Latin text, and emoji;
- malformed and mixed-encoding input behavior;
- corpus schema, provenance, and review requirements.

Public text spans use zero-based, half-open Unicode code-point offsets as
defined by ADR-0002.

## Unresolved work

Character tables, normalization rules, and syllabification rules are
intentionally not invented during repository bootstrap. They require documented
linguistic evidence and reviewed examples.
