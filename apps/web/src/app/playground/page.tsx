import { getSession } from '@/lib/auth-server';
import { documentationUrl } from '@/lib/documentation';
import { Workbench } from '@/components/playground/workbench';

export const metadata = {
  title: 'Playground',
  description:
    'Inspect Myanmar text locally or execute project-scoped MyanLex API requests.',
};
export default async function PlaygroundPage() {
  const session = await getSession().catch(() => null);
  return (
    <Workbench
      user={session ? { name: session.user.name } : null}
      docsUrl={documentationUrl}
    />
  );
}
