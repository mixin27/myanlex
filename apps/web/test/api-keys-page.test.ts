import { beforeEach, describe, expect, it, vi } from 'vitest';
const { readPlatform } = vi.hoisted(() => ({ readPlatform: vi.fn() }));
vi.mock('../src/lib/platform-server', () => ({ readPlatform }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
}));
import ApiKeysPage from '../src/app/(portal)/api-keys/page';
const organization = '3a450187-fa8b-464f-9564-cb5cae9fcd94';
const project = '8c3ce397-b77e-4b5d-9330-9ae38560734d';
const org = {
  id: organization,
  name: 'Team',
  slug: 'team',
  permissions: ['project.read', 'api_key.read'],
};
const projectData = {
  id: project,
  organizationId: organization,
  name: 'App',
  slug: 'app',
  environment: 'development',
};
describe('API-key page tenant context', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    readPlatform.mockImplementation(async (path: string) => {
      if (path === 'organizations') return { items: [org], nextCursor: null };
      if (path === `organizations/${organization}`) return org;
      if (path === `organizations/${organization}/projects`)
        return { items: [projectData], nextCursor: null };
      if (path.endsWith('/api-keys')) return { items: [], nextCursor: null };
      throw new Error(`Unexpected path: ${path}`);
    });
  });
  it('loads keys only inside the selected organization and project', async () => {
    await ApiKeysPage({
      searchParams: Promise.resolve({ organization, project }),
    });
    expect(readPlatform).toHaveBeenLastCalledWith(
      `organizations/${organization}/projects/${project}/api-keys`,
    );
  });
  it('resolves a selected project outside the current page instead of switching projects', async () => {
    readPlatform
      .mockResolvedValueOnce({ items: [org], nextCursor: null })
      .mockResolvedValueOnce(org)
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce(projectData)
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    await ApiKeysPage({
      searchParams: Promise.resolve({ organization, project }),
    });
    expect(readPlatform).toHaveBeenCalledWith(
      `organizations/${organization}/projects/${project}`,
    );
  });
  it('does not fetch projects or keys without permission', async () => {
    readPlatform
      .mockResolvedValueOnce({ items: [org], nextCursor: null })
      .mockResolvedValueOnce({ ...org, permissions: [] });
    await ApiKeysPage({
      searchParams: Promise.resolve({ organization, project }),
    });
    expect(readPlatform).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid identifiers before issuing requests', async () => {
    await expect(
      ApiKeysPage({
        searchParams: Promise.resolve({ organization: '../other' }),
      }),
    ).rejects.toThrow('not-found');
    expect(readPlatform).not.toHaveBeenCalled();
  });
});
