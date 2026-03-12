'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Lock } from 'lucide-react';

export default function ResetPasswordPage() {
  const { updatePassword, isConfigured, mode } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Supabase recovery flow: the user clicks the reset link in their email,
  // which redirects here with a token fragment. Supabase client auto-detects
  // the token via detectSessionInUrl and establishes a temporary session.
  // The user can then call updateUser({ password }) to set their new password.

  if (!isConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-xl font-semibold">Authentication Not Configured</h1>
          <p className="text-sm text-muted-foreground">Password reset is not available.</p>
          <Button variant="outline" onClick={() => router.push('/dashboard')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Go to App
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-field-success/10">
            <CheckCircle2 className="h-6 w-6 text-field-success" />
          </div>
          <h1 className="text-xl font-semibold">Password Updated</h1>
          <p className="text-sm text-muted-foreground">
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
          <Button onClick={() => router.push('/dashboard')} className="gap-2">
            Continue to App
          </Button>
        </div>
      </div>
    );
  }

  // If user is not authenticated at all (no recovery session), they may have
  // navigated here directly. Show a helpful message.
  if (mode === 'local') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl overflow-hidden">
            <img src="/icons/icon-small.svg" alt="BAU Suite" className="h-12 w-12" />
          </div>
          <h1 className="text-xl font-semibold">Password Reset</h1>
          <p className="text-sm text-muted-foreground">
            This page is used to set a new password after clicking a reset link in your email.
            If you need a reset link, use the forgot password page.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => router.push('/forgot-password')}>
              Request Password Reset
            </Button>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => router.push('/login')}>
              <ArrowLeft className="h-3 w-3 mr-1" /> Back to Sign In
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password.trim()) {
      setError('Password is required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await updatePassword(password);
      if (err) {
        setError(err.message);
      } else {
        setSuccess(true);
      }
    } catch {
      setError('An unexpected error occurred');
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl overflow-hidden">
            <img src="/icons/icon-small.svg" alt="BAU Suite" className="h-12 w-12" />
          </div>
          <h1 className="text-xl font-semibold">Set New Password</h1>
          <p className="text-sm text-muted-foreground">
            Choose a new password for your account.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">New Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="New password"
              autoComplete="new-password"
              autoFocus
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="text-xs">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className="h-9"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            Update Password
          </Button>
        </form>
      </div>
    </div>
  );
}
