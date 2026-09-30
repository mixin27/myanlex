// Project-authored transport fixtures, MIT. Not independently reviewed linguistic evidence.
export function localSuite(application, core) {
  const app = application.createMyanLexApplication();
  const text = 'က😀';
  const calls = [
    ['detectText', { text }],
    ['normalizeText', { text: 'ဦ' }],
    [
      'convertText',
      { text: 'က', from: 'unicode', to: 'unicode', validateSource: true },
    ],
    ['syllabifyText', { text }],
    ['validateOrthography', { text }],
    ['transliterateText', { text, scheme: 'ala-lc-2011' }],
    ['tokenizeText', { text }],
    [
      'batchSyllabify',
      {
        items: [
          { id: 'ok', text },
          { id: 'bad', text: '\ud800' },
        ],
      },
    ],
    [
      'batchTransliterate',
      {
        items: [
          { id: 'ok', text },
          { id: 'bad', text: '\ud800' },
        ],
        scheme: 'ala-lc-2011',
      },
    ],
    [
      'convertText',
      { text: 'က', from: 'unicode', to: 'zawgyi', validateSource: true },
    ],
    ['normalizeText', { text: '\ud800' }],
    ['normalizeText', { text: 'x'.repeat(100_001) }],
    [
      'convertText',
      { text: 'မြန်မာ', from: 'unicode', to: 'zawgyi', validateSource: true },
    ],
    [
      'convertText',
      { text: 'ျမန္မာ', from: 'zawgyi', to: 'unicode', validateSource: true },
    ],
  ];
  return {
    core: core.normalizeUnicode('ဦ'),
    results: calls.map(([method, request]) => {
      try {
        return { method, result: app[method](request) };
      } catch (error) {
        if (!(error instanceof application.ApplicationInputError)) throw error;
        return { method, error: error.code };
      }
    }),
  };
}
