import { createMyanLexApplication } from '@myanlex/application';
import { normalizeUnicode } from '@myanlex/core';
import type { NormalizationResult } from '@myanlex/types';
import { MyanLex } from '@myanlex/sdk';

const app = createMyanLexApplication();
const result: NormalizationResult = app.normalizeText({ text: 'ဦ' });
normalizeUnicode(result.output);
new MyanLex({ apiKey: 'fixture-only', baseUrl: 'https://api.invalid/v1' });
// @ts-expect-error conversion requires an explicit source and target
app.convertText({ text: 'က' });
// @ts-expect-error only the documented scheme is supported
app.transliterateText({ text: 'က', scheme: 'pronunciation' });
