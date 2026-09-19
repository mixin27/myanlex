'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Mode =
  'login' | 'register' | 'forgot-password' | 'reset-password' | 'verify-email';
const titles: Record<Mode, string> = {
  login: 'Sign in to MyanLex',
  register: 'Create your account',
  'forgot-password': 'Reset your password',
  'reset-password': 'Choose a new password',
  'verify-email': 'Verify your email',
};

export function AuthForm({
  mode,
  enabled = true,
  providers = [],
  token,
  notice = '',
}: {
  mode: Mode;
  enabled?: boolean;
  providers?: ('google' | 'github')[];
  token?: string;
  notice?: string;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [message, setMessage] = useState(notice);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    try {
      if (mode === 'login') {
        const result = await authClient.signIn.email({ email, password });
        if (result.error?.code === 'EMAIL_NOT_VERIFIED') {
          throw new Error(
            'Your email is not verified. Follow the verification link in your inbox, or use Resend verification below.',
          );
        }
        if (result.error)
          throw new Error(result.error.message ?? 'Unable to sign in.');
        router.replace('/dashboard');
        router.refresh();
      } else if (mode === 'register') {
        const result = await authClient.signUp.email({
          email,
          password,
          name: String(form.get('name')),
          callbackURL: '/login?verified=true',
        });
        if (result.error)
          throw new Error(result.error.message ?? 'Unable to register.');
        setMessage(
          'Check your email to verify your account before signing in.',
        );
      } else if (mode === 'forgot-password') {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: '/reset-password',
        });
        if (result.error)
          throw new Error('Unable to request a reset. Please try again later.');
        setMessage(
          'If an account exists for this address, you will receive a reset link.',
        );
      } else if (mode === 'verify-email') {
        const result = await authClient.sendVerificationEmail({
          email,
          callbackURL: '/login?verified=true',
        });
        if (result.error)
          throw new Error(
            'Unable to send verification. Please try again later.',
          );
        setMessage('If verification is needed, check your email for a link.');
      } else {
        if (!token)
          throw new Error(
            'This reset link is missing or invalid. Request a new one.',
          );
        const result = await authClient.resetPassword({
          newPassword: password,
          token,
        });
        if (result.error)
          throw new Error(
            'This reset link is invalid or expired. Request a new one.',
          );
        setMessage('Password changed. You can now sign in.');
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function social(provider: 'google' | 'github') {
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: '/dashboard',
        errorCallbackURL: '/login?error=oauth',
      });
      if (result.error)
        throw new Error('Unable to start sign-in. Please try again.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1>{titles[mode]}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!enabled && (
            <p role="alert">
              Sign-in is currently unavailable. Please try again later.
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <label className="grid gap-2">
                Name
                <Input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={120}
                />
              </label>
            )}
            {mode !== 'reset-password' && (
              <label className="grid gap-2">
                Email
                <Input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={320}
                />
              </label>
            )}
            {(mode === 'login' ||
              mode === 'register' ||
              mode === 'reset-password') && (
              <label className="grid gap-2">
                Password
                <Input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  required
                  minLength={mode === 'login' ? 1 : 12}
                  maxLength={128}
                />
                {mode !== 'login' && (
                  <span className="text-sm text-muted-foreground">
                    Use at least 12 characters.
                  </span>
                )}
              </label>
            )}
            <Button
              type="submit"
              disabled={busy || !enabled}
              className="w-full"
            >
              {busy
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Continue'}
            </Button>
          </form>
          {mode === 'login' &&
            providers.map((provider) => (
              <Button
                key={provider}
                variant="outline"
                className="w-full"
                disabled={busy || !enabled}
                onClick={() => social(provider)}
              >
                Continue with {provider === 'github' ? 'GitHub' : 'Google'}
              </Button>
            ))}
          <nav
            className="flex flex-wrap gap-4 text-sm underline"
            aria-label="Account help"
          >
            {mode !== 'login' && <Link href="/login">Sign in</Link>}
            {mode === 'login' && (
              <>
                <Link href="/register">Create account</Link>
                <Link href="/forgot-password">Forgot password?</Link>
                <Link href="/verify-email">Resend verification</Link>
              </>
            )}
            {mode === 'reset-password' && (
              <Link href="/forgot-password">Request a new reset link</Link>
            )}
          </nav>
        </CardContent>
      </Card>
    </main>
  );
}
