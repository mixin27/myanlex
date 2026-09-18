import { AccountActions } from '@/components/auth/account-actions';
import { getAuthProviders, requireSession } from '@/lib/auth-server';

export default async function AccountPage() {
  const { user } = await requireSession();
  const { providers } = await getAuthProviders();
  return (
    <>
      <header className="page-heading">
        <h1>Account</h1>
        <p>Manage your sign-in methods and sessions.</p>
      </header>
      <section className="panel space-y-4">
        <h2>{user.name}</h2>
        <p>{user.email}</p>
        <AccountActions providers={providers} />
      </section>
    </>
  );
}
