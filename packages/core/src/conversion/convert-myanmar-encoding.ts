import type {
  MyanmarEncodingConversionOptions,
  MyanmarEncodingConversionResult,
} from '@myanlex/types';

import {
  getAllRulesU2Z,
  getAllRulesZ2U,
  type TransliterationRule,
} from './google-zawgyi-rules.js';

export const ENCODING_CONVERSION_PROFILE = 'cldr-zawgyi-v1' as const;

const ZAWGYI_TO_UNICODE_RULES = getAllRulesZ2U();
const UNICODE_TO_ZAWGYI_RULES = getAllRulesU2Z();

function runPhase(
  rules: readonly TransliterationRule[],
  input: string,
): string {
  let output = '';
  let remaining = input;
  let atStart = true;

  while (remaining.length > 0) {
    let matched = false;

    for (const rule of rules) {
      if (rule.matchOnStart === true && !atStart) {
        continue;
      }

      const match = remaining.match(rule.p);
      if (match === null) {
        continue;
      }

      matched = true;
      const rightLength = remaining.length - match[0].length;
      remaining = remaining.replace(rule.p, rule.s);
      const replacementEnd = remaining.length - rightLength;

      if (rule.revisit === undefined) {
        output += remaining.slice(0, replacementEnd);
        remaining = remaining.slice(replacementEnd);
      }
    }

    if (!matched) {
      output += remaining[0];
      remaining = remaining.slice(1);
    }

    atStart = false;
  }

  return output;
}

function runAllPhases(
  phases: readonly (readonly TransliterationRule[])[],
  input: string,
): string {
  return phases.reduce((output, rules) => runPhase(rules, output), input);
}

/**
 * Converts a complete string between explicitly declared Unicode and Zawgyi
 * encodings. Detection is deliberately not performed by this function.
 */
export function convertMyanmarEncoding(
  input: string,
  options: MyanmarEncodingConversionOptions,
): MyanmarEncodingConversionResult {
  let output = input;

  if (options.from !== options.to) {
    output = runAllPhases(
      options.from === 'zawgyi'
        ? ZAWGYI_TO_UNICODE_RULES
        : UNICODE_TO_ZAWGYI_RULES,
      input,
    );
  }

  return {
    input,
    output,
    from: options.from,
    to: options.to,
    changed: output !== input,
    profile: ENCODING_CONVERSION_PROFILE,
  };
}
