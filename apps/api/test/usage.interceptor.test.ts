import { describe, expect, it } from 'vitest';

import { countRequestCharacters } from '../src/common/usage/usage.interceptor.js';

describe('usage measurement', () => {
  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(countRequestCharacters({ text: 'က😀' })).toBe(2);
  });

  it('counts batch item text without retaining request content', () => {
    expect(
      countRequestCharacters({
        items: [
          { id: 'one', text: 'မြန်မာ' },
          { id: 'two', text: '😀' },
        ],
      }),
    ).toBe(7);
  });
});
