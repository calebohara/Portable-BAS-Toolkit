'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, LogIn, UserPlus, ArrowLeft, Loader2 } from 'lucide-react';

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const { signIn, signUp, isConfigured, mode } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'signin' | 'signup'>(
    searchParams.get('tab') === 'signup' ? 'signup' : 'signin'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // If already authenticated, redirect to dashboard
  if (mode === 'authenticated') {
    router.replace('/dashboard');
    return null;
  }

  if (!isConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl overflow-hidden">
            <img src="/icons/icon-small.svg" alt="BAU Suite" className="h-12 w-12" />
          </div>
          <h1 className="text-xl font-semibold">Authentication Not Configured</h1>
          <p className="text-sm text-muted-foreground">
            Supabase environment variables are not set. The app is running in local-only mode.
            All features work — data is stored locally on this device.
          </p>
          <p className="text-xs text-muted-foreground">
            To enable authentication, set <code className="text-foreground">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
            <code className="text-foreground">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your environment.
          </p>
          <Button variant="outline" onClick={() => router.push('/dashboard')} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Continue in Local Mode
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }

    if (tab === 'signup') {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
    }

    setLoading(true);
    try {
      if (tab === 'signin') {
        const { error: err } = await signIn(email, password);
        if (err) {
          setError(err.message);
        } else {
          router.replace('/dashboard');
        }
      } else {
        const { error: err } = await signUp(email, password);
        if (err) {
          setError(err.message);
        } else {
          setMessage('Account created. Check your email for a confirmation link.');
        }
      }
    } catch {
      setError('An unexpected error occurred');
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl overflow-hidden">
            <img src="/icons/icon-small.svg" alt="BAU Suite" className="h-12 w-12" />
          </div>
          <h1 className="text-xl font-semibold">BAU Suite</h1>
          <p className="text-sm text-muted-foreground">Portable Project Toolkit</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg bg-muted p-1">
          <button
            onClick={() => { setTab('signin'); setError(''); setMessage(''); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              tab === 'signin' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setTab('signup'); setError(''); setMessage(''); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              tab === 'signup' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Sign Up
          </button>
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
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              className="h-9"
            />
          </div>
          {tab === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password" className="text-xs">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
                className="h-9"
              />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="flex items-start gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-xs text-green-600 dark:text-green-400">
              <span>{message}</span>
            </div>
          )}

          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : tab === 'signin' ? (
              <LogIn className="h-4 w-4" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {tab === 'signin' ? 'Sign In' : 'Create Account'}
          </Button>

          {tab === 'signin' && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => router.push('/forgot-password')}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}
        </form>

        {/* Local mode option */}
        <div className="text-center">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="h-3 w-3 mr-1" />
            Continue without signing in
          </Button>
          <p className="text-[10px] text-muted-foreground mt-1">
            All features work in local mode. Sign in to prepare for future cloud sync.
          </p>
        </div>
      </div>
    </div>
  );
}
