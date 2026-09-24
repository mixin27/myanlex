// Public documentation only: no credentials or session data.
export const languageExamples = [
  {
    path: '/text/detect',
    title: 'Detect encoding',
    body: { text: 'မြန်မာစာ' },
    note: 'Advisory and non-mutating. unknown is legitimate; mixed describes separate runs with opposing evidence, not reliable boundaries inside one uninterrupted run.',
  },
  {
    path: '/text/normalize',
    title: 'Normalize safely',
    body: { text: 'က' },
    note: 'NFC only. No Zawgyi conversion, spelling repair, whitespace removal or strict/search profiles. Normalization can change code-point counts; calculate subsequent offsets from its output.',
  },
  {
    path: '/text/convert',
    title: 'Convert explicitly',
    body: { text: 'မဂၤလာပါ', from: 'zawgyi', to: 'unicode' },
    note: 'Both directions must be unicode or zawgyi. Never treat unknown or mixed detection as a known source encoding. Preserve originals; exact round trips are not guaranteed.',
  },
  {
    path: '/syllabify',
    title: 'Split written syllables',
    body: { text: 'က😀' },
    note: 'Lossless orthographic segments, not dictionary words or pronunciation analysis. Unsupported Myanmar text is preserved, not interpreted as Burmese.',
  },
  {
    path: '/orthography/validate',
    title: 'Check structure',
    body: { text: 'က' },
    note: 'Returns valid and diagnostics without modifying text. valid means no supported structural violation, not correct spelling or meaning.',
  },
  {
    path: '/transliterate',
    title: 'Map to Latin',
    body: { text: 'မြန်မာ', scheme: 'ala-lc-2011' },
    note: 'The scheme is required. This deterministic mapping produces mranʻmā, not a translation or pronunciation guide. Unsupported spans are preserved and complete becomes false. Contextual cataloging decisions are outside this profile.',
  },
  {
    path: '/tokenize',
    title: 'Tokenize mixed text',
    body: { text: 'က😀' },
    note: 'Lossless script/lexical tokens, not Burmese dictionary word segmentation. Latin recognition is ASCII-only. mixedScript describes recognized Myanmar and Latin scripts only.',
  },
  {
    path: '/batch/syllabify',
    title: 'Batch syllabification',
    body: {
      items: [
        { id: 'first', text: 'က' },
        { id: 'invalid', text: '\ud800' },
      ],
    },
    note: 'Ordered results contain success or an item error. The escaped lone surrogate intentionally demonstrates invalid_unicode; HTTP 200 can contain failures.',
  },
  {
    path: '/batch/transliterate',
    title: 'Batch transliteration',
    body: { items: [{ id: 'first', text: 'က' }], scheme: 'ala-lc-2011' },
    note: 'One explicit scheme applies to all items. Inspect every result instead of treating HTTP success as complete batch success.',
  },
] as const;

export const firstRequest = `# Set MYANLEX_API_KEY securely in your environment first.
# Do not enable shell tracing or commit credentials.
export MYANLEX_API_URL=http://localhost:3001/v1
printf 'Authorization: Bearer %s\\n' "$MYANLEX_API_KEY" | \\
  curl --silent --show-error --fail-with-body --max-time 30 \\
  --header @- --header 'Content-Type: application/json' \\
  --data '{"text":"က😀"}' "$MYANLEX_API_URL/syllabify"`;

export const firstResponse = {
  input: 'က😀',
  profile: 'burmese-orthographic-v1',
  segments: [
    { text: 'က', start: 0, end: 1, kind: 'burmese_syllable' },
    { text: '😀', start: 1, end: 2, kind: 'non_myanmar' },
  ],
};
