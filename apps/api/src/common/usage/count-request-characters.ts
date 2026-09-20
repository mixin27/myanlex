function countCodePoints(text: string): number {
  let count = 0;
  for (const codePoint of text) {
    if (codePoint.length > 0) count += 1;
  }
  return count;
}

/** Count submitted text without retaining it or applying linguistic rules. */
export function countRequestCharacters(body: unknown): number {
  if (typeof body !== 'object' || body === null) return 0;
  if ('text' in body && typeof body.text === 'string')
    return countCodePoints(body.text);
  if ('items' in body && Array.isArray(body.items)) {
    return body.items.reduce<number>((total, item: unknown) => {
      if (
        typeof item !== 'object' ||
        item === null ||
        !('text' in item) ||
        typeof item.text !== 'string'
      )
        return total;
      return total + countCodePoints(item.text);
    }, 0);
  }
  return 0;
}
