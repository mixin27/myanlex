import { AuthForm } from '@/components/auth/auth-form';
import { getAuthProviders, redirectAuthenticatedUser } from '@/lib/auth-server';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; verified?: string }>;
}) {
  await redirectAuthenticatedUser();
  const { error, verified } = await searchParams;
  const notice = error
    ? 'Sign-in or verification could not be completed. Please try again or sign in with your existing method before linking an account.'
    : verified === 'true'
      ? 'Your email is verified. You can now sign in.'
      : '';
  const configuration = await getAuthProviders();
  return <AuthForm mode="login" notice={notice} {...configuration} />;
}
