# Linguistic specification

This directory will define MyanLex linguistic behavior. Until a rule is written
here and supported by reviewed corpus cases, it must not be treated as settled
project behavior.

## First specification milestone

The initial specification must define:

- supported Unicode and Zawgyi input states;
- Myanmar character classes;
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
