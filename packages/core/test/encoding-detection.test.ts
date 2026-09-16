import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  detectMyanmarEncoding,
  ENCODING_DETECTION_PROFILE,
  UNICODE_MAX_PROBABILITY,
  ZAWGYI_MIN_PROBABILITY,
  type MyanmarEncoding,
  type MyanmarEncodingSegment,
} from '../src/index.js';

interface ExpectedSegment {
  readonly text: string;
  readonly encoding: MyanmarEncodingSegment['encoding'];
  readonly start: number;
  readonly end: number;
}

interface DetectionCase {
  readonly id: string;
  readonly input: string;
  readonly encoding: MyanmarEncoding;
  readonly segments: readonly ExpectedSegment[];
  readonly basis: string;
}

interface DetectionCorpus {
  readonly profile: string;
  readonly thresholds: {
    readonly unicode_max_probability: number;
    readonly zawgyi_min_probability: number;
  };
  readonly cases: readonly DetectionCase[];
}

const corpusUrl = new URL(
  '../../../corpus/encoding/detection-v1.json',
  import.meta.url,
);
const corpus = JSON.parse(readFileSync(corpusUrl, 'utf8')) as DetectionCorpus;

function compactSegment(segment: MyanmarEncodingSegment): ExpectedSegment {
  return {
    text: segment.text,
    encoding: segment.encoding,
    start: segment.start,
    end: segment.end,
  };
}

describe('detectMyanmarEncoding', () => {
  it('uses the documented model profile and thresholds', () => {
    expect(corpus.profile).toBe(ENCODING_DETECTION_PROFILE);
    expect(corpus.thresholds).toEqual({
      unicode_max_probability: UNICODE_MAX_PROBABILITY,
      zawgyi_min_probability: ZAWGYI_MIN_PROBABILITY,
    });
  });

  it.each(corpus.cases)('$id', ({ input, encoding, segments }) => {
    const result = detectMyanmarEncoding(input);

    expect(result.input).toBe(input);
    expect(result.encoding).toBe(encoding);
    expect(result.segments.map(compactSegment)).toEqual(segments);
  });

  it('matches representative upstream compatibility probabilities', () => {
    const ambiguous = detectMyanmarEncoding('လူတို').segments[0];
    const shan = detectMyanmarEncoding('ထၢမ်တွပ်ႇ').segments[0];

    expect(ambiguous?.zawgyiProbability).toBeCloseTo(0.4889728131312674, 12);
    expect(shan?.zawgyiProbability).toBeCloseTo(1.7562339552675883e-12, 20);
  });

  it('returns confidence only when strong evidence determines the result', () => {
    expect(detectMyanmarEncoding('လူတို').confidence).toBeNull();
    expect(detectMyanmarEncoding('hello').confidence).toBeNull();
    expect(
      detectMyanmarEncoding('အပြည်ပြည်ဆိုင်ရာ').confidence,
    ).toBeGreaterThan(0.95);
  });
});
