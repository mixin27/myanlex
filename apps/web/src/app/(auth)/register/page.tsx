import { AuthForm } from '@/components/auth/auth-form';
import { getAuthProviders } from '@/lib/auth-server';

export default async function Page() {
  const configuration = await getAuthProviders();
  return <AuthForm mode="register" {...configuration} />;
}
