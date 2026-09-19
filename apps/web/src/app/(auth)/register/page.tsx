import { AuthForm } from '@/components/auth/auth-form';
import { getAuthProviders, redirectAuthenticatedUser } from '@/lib/auth-server';

export default async function Page() {
  await redirectAuthenticatedUser();
  const configuration = await getAuthProviders();
  return <AuthForm mode="register" {...configuration} />;
}
