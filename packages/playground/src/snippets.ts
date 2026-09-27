import type { ExecutionRequest } from './index.js';
import { operations } from './index.js';

export type SnippetLanguage =
  'curl' | 'typescript' | 'python' | 'python_async' | 'dart';
const methods = {
  detect: 'detect',
  normalize: 'normalize',
  convert: 'convert',
  syllabify: 'syllabify',
  orthography: 'validateOrthography',
  transliterate: 'transliterate',
  tokenize: 'tokenize',
  batch_syllabify: 'batchSyllabify',
  batch_transliterate: 'batchTransliterate',
};
const pythonMethods = {
  ...methods,
  orthography: 'validate_orthography',
  batch_syllabify: 'batch_syllabify',
  batch_transliterate: 'batch_transliterate',
};
const quoteShell = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;
// JSON strings are also valid Python string literals for our string inputs.
const pythonString = (value: string): string => JSON.stringify(value);
const dartString = (value: string): string =>
  JSON.stringify(value).replaceAll('$', '\\$');

export function snippet(
  request: ExecutionRequest,
  language: SnippetLanguage,
): string {
  const payload = request.payload;
  if (language === 'curl')
    return `printf 'Authorization: Bearer %s\\n' "$MYANLEX_API_KEY" |\n  curl --silent --show-error --fail-with-body --max-time 30 \\\n  --header @- --header 'Content-Type: application/json' \\\n  --data ${quoteShell(JSON.stringify(payload))} "$MYANLEX_API_URL/${operations[request.operation].path}"`;
  if (language === 'typescript')
    return `import { MyanLex } from '@myanlex/sdk';\n\nconst client = new MyanLex({\n  apiKey: process.env.MYANLEX_API_KEY!,\n  baseUrl: process.env.MYANLEX_API_URL!,\n});\nconst result = await client.${methods[request.operation]}(${JSON.stringify(payload, null, 2)});\n// Inspect result without automatically logging private text.`;
  const args: string[] = [];
  if ('text' in payload) args.push(`text=${pythonString(payload.text)}`);
  if ('from' in payload) {
    args.push(
      `from_encoding=${pythonString(payload.from)}`,
      `to_encoding=${pythonString(payload.to)}`,
    );
    if (payload.validateSource !== undefined)
      args.push(`validate_source=${payload.validateSource ? 'True' : 'False'}`);
  }
  if ('scheme' in payload) args.push(`scheme=${pythonString(payload.scheme)}`);
  if ('items' in payload)
    args.push(
      `items=[${payload.items.map((row) => `BatchItem(id=${pythonString(row.id)}, text=${pythonString(row.text)})`).join(', ')}]`,
    );
  if (language === 'python' || language === 'python_async') {
    const async = language === 'python_async';
    const client = async ? 'AsyncMyanLex' : 'MyanLex';
    const body = `${async ? 'async ' : ''}with ${client}(api_key=os.environ['MYANLEX_API_KEY'],\n${async ? '    ' : ''}                 base_url=os.environ['MYANLEX_API_URL']) as client:\n${async ? '        ' : '    '}result = ${async ? 'await ' : ''}client.${pythonMethods[request.operation]}(${args.join(', ')})`;
    return `import os\n${async ? 'import asyncio\n' : ''}from myanlex import ${client}${'items' in payload ? ', BatchItem' : ''}\n\n${async ? 'async def main():\n    ' : ''}${body}\n${async ? '\nasyncio.run(main())\n' : ''}# Inspect result without automatically logging private text.`;
  }
  const dartArgs: string[] = [];
  if ('text' in payload) dartArgs.push(`text: ${dartString(payload.text)}`);
  if ('from' in payload) {
    dartArgs.push(
      `from: ${dartString(payload.from)}`,
      `to: ${dartString(payload.to)}`,
    );
    if (payload.validateSource !== undefined)
      dartArgs.push(`validateSource: ${payload.validateSource}`);
  }
  if ('scheme' in payload)
    dartArgs.push(`scheme: ${dartString(payload.scheme)}`);
  if ('items' in payload)
    dartArgs.push(
      `items: [${payload.items.map((row) => `BatchItem(id: ${dartString(row.id)}, text: ${dartString(row.text)})`).join(', ')}]`,
    );
  return `import 'dart:io';\nimport 'package:myanlex_dart/myanlex_dart.dart';\n\nFuture<void> main() async {\n  final client = MyanLex(\n    apiKey: Platform.environment['MYANLEX_API_KEY']!,\n    baseUrl: Platform.environment['MYANLEX_API_URL']!,\n  );\n  try {\n    final result = await client.${methods[request.operation]}(${dartArgs.join(', ')});\n    // Inspect result without automatically logging private text.\n  } finally {\n    client.close();\n  }\n}`;
}
