'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, ArrowLeft, Loader2, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { resetPassword, isConfigured, mode } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  // Already authenticated — redirect via effect (not during render)
  useEffect(() => {
    if (mode === 'authenticated') router.replace('/dashboard');
  }, [mode, router]);
  if (mode === 'authenticated') return null;

  if (!isConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl overflow-hidden">
            <img src="/icons/icon-small.svg" alt="BAU Suite" className="h-12 w-12" />
          </div>
          <h1 className="text-xl font-semibold">Authentication Not Configured</h1>
          <p className="text-sm text-muted-foreground">
            Supabase is not configured. Password reset is not available.
          </p>
          <Button variant="outline" onClick={() => router.push('/login')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await resetPassword(email.trim());
      if (err) {
        setError(err.message);
      } else {
        setSent(true);
      }
    } catch {
      setError('An unexpected error occurred');
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Check Your Email</h1>
          <p className="text-sm text-muted-foreground">
            If an account exists for <strong className="text-foreground">{email}</strong>,
            you will receive a password reset link shortly.
          </p>
          <p className="text-xs text-muted-foreground">
            Check your spam folder if you don&apos;t see it within a few minutes.
          </p>
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => router.push('/login')} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Sign In
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl overflow-hidden">
            <img src="/icons/icon-small.svg" alt="BAU Suite" className="h-12 w-12" />
          </div>
          <h1 className="text-xl font-semibold">Reset Password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email address and we&apos;ll send you a password reset link.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              autoFocus
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
              <Mail className="h-4 w-4" />
            )}
            Send Reset Link
          </Button>
        </form>

        <div className="text-center">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => router.push('/login')}>
            <ArrowLeft className="h-3 w-3 mr-1" />
            Back to Sign In
          </Button>
        </div>
      </div>
    </div>
  );
}
