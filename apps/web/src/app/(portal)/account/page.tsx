import { AccountActions } from '@/components/auth/account-actions';
import { getAuthProviders, requireSession } from '@/lib/auth-server';
import { ShieldCheck, UserRound } from 'lucide-react';

export default async function AccountPage() {
  const { user } = await requireSession();
  const { providers } = await getAuthProviders();
  return (
    <>
      <header className="page-heading">
        <h1>Account</h1>
        <p>Manage your sign-in methods and sessions.</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <section className="rounded-xl border bg-white p-6">
          <span className="mb-5 inline-flex rounded-xl bg-emerald-50 p-3 text-emerald-800">
            <UserRound className="size-6" />
          </span>
          <h2 className="font-semibold">Profile</h2>
          <dl className="mt-6 space-y-5 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Display name</dt>
              <dd className="mt-1 font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Email address</dt>
              <dd className="mt-1 break-all">{user.email}</dd>
            </div>
          </dl>
          <p className="mt-6 flex items-center gap-2 text-xs text-emerald-800">
            <ShieldCheck className="size-4" />
            Email verified
          </p>
        </section>
        <section className="rounded-xl border bg-white p-6">
          <h2 className="font-semibold">Sign-in & security</h2>
          <p className="mb-6 mt-2 text-sm leading-6 text-muted-foreground">
            Manage active sessions and connect a sign-in provider. Signing out
            other devices keeps this session active.
          </p>
          <AccountActions providers={providers} />
          <div className="mt-8 border-t pt-5 text-xs leading-5 text-muted-foreground">
            Your account session and project API keys are separate. Signing out
            does not revoke your application’s keys. Manage those from API keys.
          </div>
        </section>
      </div>
    </>
  );
}
