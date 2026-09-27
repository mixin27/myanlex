import { describe, expect, it } from 'vitest';
import { createMyanLexApplication } from '@myanlex/application';
import { spawnSync } from 'node:child_process';
import {
  compareText,
  codePointToUtf16,
  dispatch,
  executeLocal,
  executionSchema,
  operations,
  reproduction,
  runSchema,
  snippet,
  visibleText,
} from '../src/index.js';
import type { ExecutionRequest } from '../src/index.js';

const app = createMyanLexApplication();
const requests: ExecutionRequest[] = [
  ...(
    ['detect', 'normalize', 'syllabify', 'orthography', 'tokenize'] as const
  ).map((operation) => ({ operation, payload: { text: 'က😀' } })),
  {
    operation: 'convert',
    payload: {
      text: 'က',
      from: 'unicode',
      to: 'zawgyi',
      validateSource: false,
    },
  },
  {
    operation: 'transliterate',
    payload: { text: 'က😀', scheme: 'ala-lc-2011' },
  },
  {
    operation: 'batch_syllabify',
    payload: { items: [{ id: 'one', text: 'က😀' }] },
  },
  {
    operation: 'batch_transliterate',
    payload: { items: [{ id: 'one', text: 'က😀' }], scheme: 'ala-lc-2011' },
  },
];
describe('playground contract', () => {
  it('rejects extra fields that could change result-view discrimination', () => {
    const run = executeLocal(app, requests[1], 'test', () => 0);
    expect(
      runSchema.safeParse({
        ...run,
        result: { ...run.result, results: null },
      }).success,
    ).toBe(false);
    const syllables = executeLocal(
      app,
      { operation: 'syllabify', payload: { text: 'က' } },
      'test',
      () => 0,
    );
    expect(
      runSchema.safeParse({
        ...syllables,
        result: {
          ...syllables.result,
          segments: [
            {
              start: 0,
              end: 1,
              text: 'က',
              kind: 'syllable',
              zawgyiProbability: {},
            },
          ],
        },
      }).success,
    ).toBe(false);
  });
  it('round-trips hostile snippet input through shell and Python parsers', () => {
    const text = `"'\\\nက😀<script>$((1+1))`;
    const request = { operation: 'normalize', payload: { text } } as const;
    const shell = spawnSync(
      'bash',
      [
        '-c',
        'curl() { while [ "$#" -gt 0 ]; do if [ "$1" = "--data" ]; then printf "%s" "$2"; return; fi; shift; done; }; ' +
          snippet(request, 'curl'),
      ],
      { encoding: 'utf8' },
    );
    expect(shell.status).toBe(0);
    expect(JSON.parse(shell.stdout)).toEqual({ text });
    for (const language of ['python', 'python_async'] as const) {
      const python = spawnSync(
        'python3',
        [
          '-c',
          'import ast,json,sys; tree=ast.parse(sys.stdin.read()); values=[ast.literal_eval(k.value) for n in ast.walk(tree) if isinstance(n, ast.Call) for k in n.keywords if k.arg == "text"]; print(json.dumps(values))',
        ],
        { input: snippet(request, language), encoding: 'utf8' },
      );
      expect(python.status).toBe(0);
      expect(JSON.parse(python.stdout)).toEqual([text]);
    }
    expect(snippet(request, 'dart')).toContain('\\$');
  });
  it.each(requests)(
    'uses the application unchanged for $operation',
    (request) => {
      const run = executeLocal(app, request, 'test-revision', () => 1);
      expect(run.result).toEqual(dispatch(app, request));
      expect(runSchema.safeParse(run).success).toBe(true);
      expect(run).not.toHaveProperty('httpStatus');
      expect(run).not.toHaveProperty('requestId');
    },
  );
  it('covers the complete closed catalog', () => {
    expect(requests.map((request) => request.operation).sort()).toEqual(
      Object.keys(operations).sort(),
    );
    expect(
      executionSchema.safeParse({
        operation: 'fetch',
        payload: { url: 'https://example.com' },
      }).success,
    ).toBe(false);
    expect(
      executionSchema.safeParse({
        operation: 'batch_syllabify',
        payload: {
          items: [
            { id: 'x', text: '' },
            { id: 'x', text: '' },
          ],
        },
      }).success,
    ).toBe(false);
  });
  it('keeps errors structured and rejects forged local HTTP metadata', () => {
    expect(
      executeLocal(
        app,
        {
          operation: 'convert',
          payload: {
            text: 'က',
            from: 'unicode',
            to: 'zawgyi',
            validateSource: true,
          },
        },
        'test',
        () => 0,
      ).error,
    ).toBeDefined();
    const run = executeLocal(
      app,
      { operation: 'normalize', payload: { text: '\uD800' } },
      'test',
      () => 0,
    );
    expect(run.error).toBeDefined();
    expect(runSchema.safeParse(run).success).toBe(true);
    expect(runSchema.safeParse({ ...run, httpStatus: 200 }).success).toBe(
      false,
    );
    expect(runSchema.safeParse({ ...run, result: {} }).success).toBe(false);
  });
  it('enforces existing text and batch limits without hiding item failures', () => {
    expect(
      executeLocal(
        app,
        { operation: 'normalize', payload: { text: 'a'.repeat(100_001) } },
        'test',
        () => 0,
      ).error,
    ).toBeDefined();
    const run = executeLocal(
      app,
      {
        operation: 'batch_syllabify',
        payload: {
          items: [
            { id: 'good', text: 'က' },
            { id: 'bad', text: '\uD800' },
          ],
        },
      },
      'test',
      () => 0,
    );
    expect(run.result).toMatchObject({
      results: [{ success: true }, { success: false }],
    });
  });
  it('converts code-point offsets and bounds comparison', () => {
    expect(codePointToUtf16('က😀x', 2)).toBe(3);
    expect(compareText('က😀x', 'က😀y')).toEqual({
      limited: false,
      prefix: 'က😀',
      removed: 'x',
      added: 'y',
      suffix: '',
    });
    expect(compareText('a'.repeat(20_001), '')).toMatchObject({
      limited: true,
    });
    expect(visibleText('\u202E<script>\n')).toBe('\\u{202E}<script>\\u{A}');
  });
  it('exports text only after explicit selection', () => {
    const run = executeLocal(app, requests[0], 'test', () => 0);
    expect(JSON.stringify(reproduction(run, false))).not.toContain('က');
    expect(JSON.stringify(reproduction(run, true))).toContain('က');
  });
  it.each(requests)(
    'generates all public SDK examples for $operation without credentials',
    (request) => {
      for (const language of [
        'curl',
        'typescript',
        'python',
        'python_async',
        'dart',
      ] as const) {
        const code = snippet(request, language);
        expect(code.length).toBeGreaterThan(30);
        expect(code).not.toContain('/platform/');
      }
    },
  );
});
