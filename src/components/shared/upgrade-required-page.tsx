'use client';

import { Lock, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface UpgradeRequiredPageProps {
  feature: string;
  requiredTier: 'pro' | 'team';
}

const TIER_LABELS: Record<string, string> = {
  pro: 'Pro',
  team: 'Team',
};

const TIER_PRICES: Record<string, string> = {
  pro: '$8/month or $79/year',
  team: '$15/month or $149/year',
};

export function UpgradeRequiredPage({ feature, requiredTier }: UpgradeRequiredPageProps) {
  const router = useRouter();

  return (
    <>
      <TopBar title={feature} />
      <div className="flex items-center justify-center p-8 sm:p-16">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-7 w-7 text-primary" />
            </div>

            <div>
              <h2 className="text-lg font-bold">{feature}</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                This feature requires the <strong className="text-foreground">{TIER_LABELS[requiredTier]}</strong> plan
                ({TIER_PRICES[requiredTier]}).
              </p>
            </div>

            <div className="space-y-2">
              <Button
                className="w-full gap-1.5"
                onClick={() => router.push('/settings')}
              >
                <ArrowRight className="h-4 w-4" />
                View Plans in Settings
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => router.push('/dashboard')}
              >
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
