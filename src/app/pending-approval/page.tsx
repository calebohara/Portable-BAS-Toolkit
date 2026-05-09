'use client';

import { useRouter } from 'next/navigation';
import { Clock, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { useEffect } from 'react';

export default function PendingApprovalPage() {
  const router = useRouter();
  const { user, profile, signOut, refreshProfile, loading } = useAuth();

  // If user becomes approved (e.g. admin approves while they're waiting), redirect
  useEffect(() => {
    if (!loading && profile?.approved) {
      router.replace('/dashboard');
    }
  }, [loading, profile?.approved, router]);

  // If not authenticated at all, go to login
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  // Auto-poll for approval status every 30s while page is open
  useEffect(() => {
    const id = setInterval(() => {
      refreshProfile();
    }, 30_000);
    return () => clearInterval(id);
    // refreshProfile is provided by the auth provider and assumed stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    await refreshProfile();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-field-info)]/10 animate-pulse">
            <Clock className="h-8 w-8 text-[var(--color-field-info)]" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Account Pending Approval</h1>
          <p className="text-muted-foreground">
            Your account has been created successfully. An administrator needs to approve
            your account before you can access BAU Suite.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
          <p>Signed in as <strong className="text-foreground">{user?.email}</strong></p>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={handleRefresh} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Check Approval Status
          </Button>
          <Button
            onClick={async () => { await signOut(); router.replace('/login'); }}
            variant="ghost"
            className="gap-2 text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
