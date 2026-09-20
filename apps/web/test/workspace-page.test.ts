import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readPlatform } = vi.hoisted(() => ({ readPlatform: vi.fn() }));
vi.mock('../src/lib/platform-server', () => ({ readPlatform }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
}));

import WorkspacePage from '../src/components/workspace/workspace-page';

const id = '2b67c20f-ee80-4a77-915a-dc102b978120';
describe('workspace page composition', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    readPlatform.mockImplementation(async (path: string) => {
      if (path === 'organizations')
        return {
          items: [{ id, name: 'Team', slug: 'team' }],
          nextCursor: null,
        };
      if (path === `organizations/${id}`)
        return {
          id,
          name: 'Team',
          slug: 'team',
          permissions: ['project.read', 'project.create', 'project.update'],
        };
      if (path === `organizations/${id}/projects`)
        return { items: [], nextCursor: null };
      throw new Error('Unexpected path');
    });
  });

  it('uses unique sibling keys for the project table and create form across refreshes', async () => {
    const page = await WorkspacePage({ searchParams: Promise.resolve({}) });
    const children = page.props.children as unknown[];
    const keys = children
      .filter(isValidElement)
      .map((child) => child.key)
      .filter((key) => key !== null);
    expect(keys).toContain(`projects-${id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not request projects without read permission', async () => {
    readPlatform.mockResolvedValueOnce({
      items: [{ id, name: 'Team', slug: 'team' }],
      nextCursor: null,
    });
    readPlatform.mockResolvedValueOnce({
      id,
      name: 'Team',
      slug: 'team',
      permissions: [],
    });
    await WorkspacePage({
      searchParams: Promise.resolve({ organization: id }),
    });
    expect(readPlatform).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid organization selection before building API paths', async () => {
    await expect(
      WorkspacePage({
        searchParams: Promise.resolve({ organization: '../other' }),
      }),
    ).rejects.toThrow('not-found');
    expect(readPlatform).not.toHaveBeenCalled();
  });
});
