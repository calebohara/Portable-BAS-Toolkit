'use client';

import { useState } from 'react';
import { Cloud, Users, Check, Zap, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/providers/auth-provider';
import { toast } from 'sonner';

interface UpgradeCTAProps {
  currentTier: string;
}

const PRO_FEATURES = [
  'Cloud sync across devices',
  'Automatic cloud backup',
  'Cloud restore & recovery',
  'Sync conflict resolution',
];

const TEAM_FEATURES = [
  'Everything in Pro',
  'Global (shared) projects',
  'Team messaging & DMs',
  'Knowledge Base access',
  'Online presence',
];

export function UpgradeCTA({ currentTier }: UpgradeCTAProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  const handleUpgrade = async (tier: 'pro' | 'team', interval: 'month' | 'year') => {
    setLoading(`${tier}-${interval}`);
    try {
      const res = await fetch('/api/subscribe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, interval, userId: user?.id }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || 'Failed to start checkout');
      }
    } catch {
      toast.error('Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Current tier indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary" className="text-xs">
          {currentTier === 'free' ? 'Free Plan' : currentTier.toUpperCase()}
        </Badge>
        <span>Upgrade to unlock cloud sync and collaboration.</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pro Card */}
        <Card className="relative overflow-visible border-primary/30">
          <div className="absolute -top-2.5 left-4 z-10">
            <Badge className="bg-primary text-primary-foreground text-[10px] font-bold shadow-sm">
              RECOMMENDED
            </Badge>
          </div>
          <CardContent className="p-5 pt-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Cloud className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold">Pro</p>
                <p className="text-xs text-muted-foreground">Cloud Sync</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-2xl font-bold">$8<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <p className="text-xs text-muted-foreground">or $79/year (save 18%)</p>
            </div>

            <ul className="space-y-1.5">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>

            <div className="space-y-2">
              <Button
                className="w-full gap-1.5"
                size="sm"
                onClick={() => handleUpgrade('pro', 'year')}
                disabled={!!loading}
              >
                {loading === 'pro-year' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Get Pro — $79/year
              </Button>
              <Button
                variant="outline"
                className="w-full text-xs"
                size="sm"
                onClick={() => handleUpgrade('pro', 'month')}
                disabled={!!loading}
              >
                {loading === 'pro-month' && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                $8/month
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Team Card */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                <Users className="h-4.5 w-4.5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-bold">Team</p>
                <p className="text-xs text-muted-foreground">Collaborate</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-2xl font-bold">$15<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <p className="text-xs text-muted-foreground">or $149/year (save 17%)</p>
            </div>

            <ul className="space-y-1.5">
              {TEAM_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>

            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full gap-1.5"
                size="sm"
                onClick={() => handleUpgrade('team', 'year')}
                disabled={!!loading}
              >
                {loading === 'team-year' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                Get Team — $149/year
              </Button>
              <Button
                variant="ghost"
                className="w-full text-xs"
                size="sm"
                onClick={() => handleUpgrade('team', 'month')}
                disabled={!!loading}
              >
                {loading === 'team-month' && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                $15/month
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
