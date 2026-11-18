import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
const { readPlatform, requireSession, getSession } = vi.hoisted(() => ({
  readPlatform: vi.fn(),
  requireSession: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock('../src/lib/platform-server', () => ({ readPlatform }));
vi.mock('../src/lib/auth-server', () => ({ requireSession, getSession }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/team',
}));
import TeamPage from '../src/app/(portal)/team/page';
import { TeamManager } from '../src/components/team/team-manager';
import type { Member, Role } from '../src/lib/platform-types';
import AcceptInvitationPage from '../src/app/invitations/accept/page';

const organization = '3a450187-fa8b-464f-9564-cb5cae9fcd94';
const org = { id: organization, name: 'Team', slug: 'team' };
const user = { id: 'u1', name: 'Owner', email: 'owner@example.com' };
const access = (permissions: string[]) => ({ ...org, permissions });
const page = { items: [], nextCursor: null };

function serve(permissions: string[]) {
  readPlatform.mockImplementation(async (path: string) => {
    if (path === 'organizations') return { items: [org], nextCursor: null };
    if (path === `organizations/${organization}`) return access(permissions);
    if (path.endsWith('/roles') || path.endsWith('/permissions'))
      return { items: [] };
    return page;
  });
}

describe('team page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireSession.mockResolvedValue({ user });
  });

  it('loads members, invitations, roles and the catalog with full access', async () => {
    serve(['member.read', 'role.read']);
    await TeamPage({ searchParams: Promise.resolve({ organization }) });
    const paths = readPlatform.mock.calls.map(([path]) => path);
    expect(paths).toEqual(
      expect.arrayContaining([
        `organizations/${organization}/members`,
        `organizations/${organization}/invitations?limit=100`,
        `organizations/${organization}/roles`,
        `organizations/${organization}/permissions`,
      ]),
    );
  });

  it('skips team data the role cannot read', async () => {
    serve(['role.read']);
    await TeamPage({ searchParams: Promise.resolve({ organization }) });
    const paths = readPlatform.mock.calls.map(([path]) => path);
    expect(paths.some((path) => path.includes('/members'))).toBe(false);
    expect(paths.some((path) => path.includes('/invitations'))).toBe(false);
    readPlatform.mockClear();
    serve([]);
    await TeamPage({ searchParams: Promise.resolve({ organization }) });
    expect(readPlatform).toHaveBeenCalledTimes(2);
  });

  it('loads the audit log only with audit.read', async () => {
    serve(['member.read', 'role.read']);
    await TeamPage({ searchParams: Promise.resolve({ organization }) });
    expect(
      readPlatform.mock.calls.some(([path]) => path.includes('audit-events')),
    ).toBe(false);
    readPlatform.mockClear();
    serve(['audit.read']);
    const result = await TeamPage({
      searchParams: Promise.resolve({ organization }),
    });
    expect(readPlatform).toHaveBeenCalledWith(
      `organizations/${organization}/audit-events?limit=50`,
    );
    expect(
      readPlatform.mock.calls.some(([path]) => path.includes('/members')),
    ).toBe(false);
    expect(renderToStaticMarkup(result)).not.toContain('Access restricted');
  });

  it('rejects invalid identifiers before issuing requests', async () => {
    await expect(
      TeamPage({ searchParams: Promise.resolve({ organization: '../x' }) }),
    ).rejects.toThrow('not-found');
    expect(readPlatform).not.toHaveBeenCalled();
  });
});

describe('invitation accept page', () => {
  beforeEach(() => vi.resetAllMocks());
  const text = (node: ReactElement) => renderToStaticMarkup(node);

  it('rejects malformed tokens without checking the session', async () => {
    const result = await AcceptInvitationPage({
      searchParams: Promise.resolve({ token: 'short' }),
    });
    expect(text(result)).toContain('Invitation link invalid');
    expect(getSession).not.toHaveBeenCalled();
  });

  it('asks signed-out visitors to sign in with the invited address', async () => {
    getSession.mockResolvedValue(null);
    const result = await AcceptInvitationPage({
      searchParams: Promise.resolve({ token: 'a'.repeat(43) }),
    });
    expect(text(result)).toContain('Sign in');
    expect(text(result)).not.toContain('Accept invitation');
  });

  it('offers acceptance to signed-in accounts and names their email', async () => {
    getSession.mockResolvedValue({ user });
    const result = await AcceptInvitationPage({
      searchParams: Promise.resolve({ token: 'a'.repeat(43) }),
    });
    expect(text(result)).toContain('owner@example.com');
    expect(text(result)).toContain('Accept invitation');
  });
});

describe('ownership transfer action', () => {
  const role = (id: string, name: string, system: boolean): Role => ({
    id,
    name,
    slug: name.toLowerCase(),
    description: null,
    system,
    permissions: [],
    memberCount: 1,
    invitationCount: 0,
  });
  const owner = role('r-owner', 'Owner', true);
  const developer = role('r-dev', 'Developer', false);
  const member = (userId: string, name: string, of: Role): Member => ({
    userId,
    name,
    email: `${name.toLowerCase()}@example.com`,
    role: { id: of.id, name: of.name, slug: of.slug },
    permissions: [],
    joinedAt: '2026-11-19T00:00:00.000Z',
  });
  const render = (members: Member[]) =>
    renderToStaticMarkup(
      <TeamManager
        organizationId={organization}
        organizationSlug="team"
        currentUserId="u1"
        permissions={['member.read', 'member.manage', 'role.read']}
        members={members}
        invitations={[]}
        roles={[owner, developer]}
        catalog={[]}
        audit={null}
      />,
    );

  it('is offered to Owners for non-Owner members only', () => {
    const html = render([
      member('u1', 'Olivia', owner),
      member('u2', 'Dana', developer),
      member('u3', 'Otto', owner),
    ]);
    expect(html.match(/Transfer ownership/g)).toHaveLength(1);
    expect(html).toContain('to Dana');
  });

  it('is hidden from members without the Owner role', () => {
    const html = render([
      member('u1', 'Olivia', developer),
      member('u2', 'Dana', developer),
    ]);
    expect(html).not.toContain('Transfer ownership');
  });
});
