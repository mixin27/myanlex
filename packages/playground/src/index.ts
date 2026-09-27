import { z } from 'zod';
import { ApplicationInputError } from '@myanlex/application';
import type { MyanLexApplication } from '@myanlex/application';
export { snippet, type SnippetLanguage } from './snippets.js';
export { engineBuild } from './build-identity.generated.js';

const text = z.object({ text: z.string() }).strict();
const item = z
  .object({ id: z.string().min(1).max(120), text: z.string() })
  .strict();
const items = z
  .array(item)
  .min(1)
  .max(1000)
  .refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    'Batch IDs must be unique.',
  );
const encoding = z.enum(['unicode', 'zawgyi']);
export const executionSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('detect'), payload: text }).strict(),
  z.object({ operation: z.literal('normalize'), payload: text }).strict(),
  z
    .object({
      operation: z.literal('convert'),
      payload: text.extend({
        from: encoding,
        to: encoding,
        validateSource: z.boolean().optional(),
      }),
    })
    .strict(),
  z.object({ operation: z.literal('syllabify'), payload: text }).strict(),
  z.object({ operation: z.literal('orthography'), payload: text }).strict(),
  z
    .object({
      operation: z.literal('transliterate'),
      payload: text.extend({ scheme: z.literal('ala-lc-2011') }),
    })
    .strict(),
  z.object({ operation: z.literal('tokenize'), payload: text }).strict(),
  z
    .object({
      operation: z.literal('batch_syllabify'),
      payload: z.object({ items }).strict(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('batch_transliterate'),
      payload: z.object({ items, scheme: z.literal('ala-lc-2011') }).strict(),
    })
    .strict(),
]);
export type ExecutionRequest = z.infer<typeof executionSchema>;
export type Operation = ExecutionRequest['operation'];
export type ExecutionMode = 'local' | 'api';
export const operations: Record<
  Operation,
  { label: string; path: string; method: string; note: string }
> = {
  detect: {
    label: 'Encoding detection',
    path: 'text/detect',
    method: 'detectText',
    note: 'Probabilistic encoding evidence; uncertainty is expected.',
  },
  normalize: {
    label: 'NFC normalization',
    path: 'text/normalize',
    method: 'normalizeText',
    note: 'Canonical Unicode normalization; does not repair spelling or orthographic order.',
  },
  convert: {
    label: 'Encoding conversion',
    path: 'text/convert',
    method: 'convertText',
    note: 'Explicit source and target. Keep the original and review uncertain input.',
  },
  syllabify: {
    label: 'Syllabification',
    path: 'syllabify',
    method: 'syllabifyText',
    note: 'Written Burmese syllable boundaries.',
  },
  orthography: {
    label: 'Structural orthography',
    path: 'orthography/validate',
    method: 'validateOrthography',
    note: 'Supported structural diagnostics; not spelling or grammar validation.',
  },
  transliterate: {
    label: 'ALA-LC transliteration',
    path: 'transliterate',
    method: 'transliterateText',
    note: 'ALA-LC 2011 mapping; inspect incomplete and unsupported segments.',
  },
  tokenize: {
    label: 'Syllable/script tokenization',
    path: 'tokenize',
    method: 'tokenizeText',
    note: 'Syllable/script boundaries, not dictionary word segmentation.',
  },
  batch_syllabify: {
    label: 'Batch syllabification',
    path: 'batch/syllabify',
    method: 'batchSyllabify',
    note: 'An overall successful batch may contain failed items.',
  },
  batch_transliterate: {
    label: 'Batch transliteration',
    path: 'batch/transliterate',
    method: 'batchTransliterate',
    note: 'ALA-LC 2011 mapping with per-item results.',
  },
};
export type OperationResults = {
  detect: ReturnType<MyanLexApplication['detectText']>;
  normalize: ReturnType<MyanLexApplication['normalizeText']>;
  convert: ReturnType<MyanLexApplication['convertText']>;
  syllabify: ReturnType<MyanLexApplication['syllabifyText']>;
  orthography: ReturnType<MyanLexApplication['validateOrthography']>;
  transliterate: ReturnType<MyanLexApplication['transliterateText']>;
  tokenize: ReturnType<MyanLexApplication['tokenizeText']>;
  batch_syllabify: ReturnType<MyanLexApplication['batchSyllabify']>;
  batch_transliterate: ReturnType<MyanLexApplication['batchTransliterate']>;
};
export type OperationResult = OperationResults[Operation];
export function dispatch(
  application: MyanLexApplication,
  request: ExecutionRequest,
): OperationResult {
  switch (request.operation) {
    case 'detect':
      return application.detectText(request.payload);
    case 'normalize':
      return application.normalizeText(request.payload);
    case 'convert':
      return application.convertText({
        text: request.payload.text,
        from: request.payload.from,
        to: request.payload.to,
        ...(request.payload.validateSource === undefined
          ? {}
          : { validateSource: request.payload.validateSource }),
      });
    case 'syllabify':
      return application.syllabifyText(request.payload);
    case 'orthography':
      return application.validateOrthography(request.payload);
    case 'transliterate':
      return application.transliterateText(request.payload);
    case 'tokenize':
      return application.tokenizeText(request.payload);
    case 'batch_syllabify':
      return application.batchSyllabify(request.payload);
    case 'batch_transliterate':
      return application.batchTransliterate(request.payload);
  }
}

const span = z
  .strictObject({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  })
  .refine((s) => s.end >= s.start);
const segment = span.safeExtend({ text: z.string(), kind: z.string() });
const base = { input: z.string(), profile: z.string().min(1) };
const normalized = z.strictObject({
  ...base,
  output: z.string(),
  changed: z.boolean(),
});
const syllables = z.strictObject({ ...base, segments: z.array(segment) });
const transliteration = z.strictObject({
  ...base,
  output: z.string(),
  scheme: z.string(),
  complete: z.boolean(),
  segments: z.array(
    span.safeExtend({
      kind: z.string(),
      input: z.string(),
      output: z.string(),
    }),
  ),
});
const batch = (result: z.ZodType) =>
  z.strictObject({
    results: z.array(
      z.discriminatedUnion('success', [
        z.strictObject({ id: z.string(), success: z.literal(true), result }),
        z.strictObject({
          id: z.string(),
          success: z.literal(false),
          error: z.strictObject({ code: z.string(), message: z.string() }),
        }),
      ]),
    ),
  });
export const resultSchemas = {
  detect: z.strictObject({
    ...base,
    encoding: z.string(),
    confidence: z.number().min(0).max(1).nullable(),
    segments: z.array(
      span.safeExtend({
        text: z.string(),
        encoding: z.string(),
        zawgyiProbability: z.number().min(0).max(1).nullable(),
      }),
    ),
  }),
  normalize: normalized,
  convert: normalized.extend({ from: encoding, to: encoding }),
  syllabify: syllables,
  orthography: z.strictObject({
    ...base,
    valid: z.boolean(),
    diagnostics: z.array(
      span.safeExtend({
        code: z.string(),
        severity: z.string(),
        message: z.string(),
      }),
    ),
  }),
  transliterate: transliteration,
  tokenize: z.strictObject({
    ...base,
    mixedScript: z.boolean(),
    scripts: z.array(z.string()),
    tokens: z.array(segment.safeExtend({ script: z.string() })),
  }),
  batch_syllabify: batch(syllables),
  batch_transliterate: batch(transliteration),
};
const errorSchema = z
  .object({ code: z.string().max(120), message: z.string().max(1000) })
  .strict();
export const runSchema = z
  .object({
    request: executionSchema,
    mode: z.enum(['local', 'api']),
    build: z.string().min(1).max(120),
    elapsedMs: z.number().finite().nonnegative(),
    profiles: z.array(z.string().min(1).max(120)).max(1000),
    result: z.unknown().optional(),
    error: errorSchema.optional(),
    httpStatus: z.number().int().min(100).max(599).optional(),
    requestId: z.string().max(120).optional(),
  })
  .strict()
  .superRefine((run, context) => {
    if (
      run.mode === 'local' &&
      (run.httpStatus !== undefined || run.requestId !== undefined)
    )
      context.addIssue({
        code: 'custom',
        message: 'Local runs have no HTTP metadata.',
      });
    if ((run.result !== undefined) === (run.error !== undefined))
      context.addIssue({
        code: 'custom',
        message: 'Provide exactly one result or error.',
      });
    if (
      run.result !== undefined &&
      !resultSchemas[run.request.operation].safeParse(run.result).success
    )
      context.addIssue({
        code: 'custom',
        message: 'Result does not match the operation.',
      });
  });
export interface Run {
  request: ExecutionRequest;
  mode: ExecutionMode;
  build: string;
  elapsedMs: number;
  profiles: string[];
  result?: OperationResult;
  error?: { code: string; message: string };
  httpStatus?: number;
  requestId?: string;
}
export function profilesFor(result: OperationResult): string[] {
  if ('profile' in result) return [result.profile];
  return [
    ...new Set(
      result.results.flatMap((row) =>
        row.success ? [row.result.profile] : [],
      ),
    ),
  ];
}
export function executeLocal(
  application: MyanLexApplication,
  input: unknown,
  build: string,
  clock: () => number,
): Run {
  const started = clock();
  const request = executionSchema.parse(input);
  try {
    const result = dispatch(application, request);
    return {
      request,
      mode: 'local',
      build,
      elapsedMs: Math.max(0, clock() - started),
      profiles: profilesFor(result),
      result,
    };
  } catch (error) {
    return {
      request,
      mode: 'local',
      build,
      elapsedMs: Math.max(0, clock() - started),
      profiles: [],
      error:
        error instanceof ApplicationInputError
          ? { code: error.code, message: error.message }
          : {
              code: 'local_failure',
              message: 'Local processing failed. Retry explicitly.',
            },
    };
  }
}

// Project-authored synthetic examples. MIT; transport/inspection examples, not linguistic review evidence.
export const examples = [
  {
    name: 'Myanmar and emoji',
    text: 'က😀',
    provenance: 'Project-authored synthetic example; MIT',
  },
  {
    name: 'Decomposed Unicode',
    text: 'ဦ',
    provenance: 'Project-authored from NFC specification; MIT',
  },
  {
    name: 'Mixed script',
    text: 'က MyanLex 123',
    provenance: 'Project-authored synthetic example; MIT',
  },
];
export function codePointToUtf16(text: string, offset: number): number {
  let count = 0;
  let index = 0;
  for (const character of text) {
    if (count++ >= offset) break;
    index += character.length;
  }
  return index;
}
export function visibleText(text: string): string {
  return Array.from(text, (character) => {
    const value = character.codePointAt(0)!;
    return value < 32 ||
      value === 127 ||
      (value >= 0x200b && value <= 0x200f) ||
      (value >= 0x202a && value <= 0x202e) ||
      (value >= 0x2060 && value <= 0x206f) ||
      value === 0xfeff
      ? `\\u{${value.toString(16).toUpperCase()}}`
      : character;
  }).join('');
}
export interface TextComparison {
  limited: boolean;
  prefix: string;
  removed: string;
  added: string;
  suffix: string;
}
export function compareText(input: string, output: string): TextComparison {
  const before = Array.from(input);
  const after = Array.from(output);
  if (before.length + after.length > 20_000)
    return { limited: true, prefix: '', removed: '', added: '', suffix: '' };
  let start = 0;
  let end = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end++;
  return {
    limited: false,
    prefix: before.slice(0, start).join(''),
    removed: before.slice(start, before.length - end).join(''),
    added: after.slice(start, after.length - end).join(''),
    suffix: before.slice(before.length - end).join(''),
  };
}
export function reproduction(run: Run, includeText: boolean): object {
  return includeText
    ? { format: 'myanlex-reproduction-v1', ...run }
    : {
        format: 'myanlex-reproduction-v1',
        operation: run.request.operation,
        mode: run.mode,
        build: run.build,
        profiles: run.profiles,
        options: Object.fromEntries(
          Object.entries(run.request.payload).filter(
            ([key]) => key !== 'text' && key !== 'items',
          ),
        ),
      };
}
