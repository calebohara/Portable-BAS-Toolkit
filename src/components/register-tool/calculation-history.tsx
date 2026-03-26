'use client';

import { format } from 'date-fns';
import { Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRegisterCalculations } from '@/hooks/use-register-calculations';
import { SAVED_CALC_CATEGORY_LABELS } from '@/types';

export function CalculationHistory({ onSaveRequest }: { onSaveRequest: () => void }) {
  const { calculations, removeCalculation } = useRegisterCalculations();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {calculations.length} saved calculation{calculations.length !== 1 ? 's' : ''}
        </p>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onSaveRequest}>
          <Save className="h-3 w-3" /> Save Current
        </Button>
      </div>

      {calculations.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No saved calculations yet. Use the Save button in any module to save a result.
        </div>
      )}

      <div className="space-y-2">
        {calculations.map(calc => (
          <div key={calc.id} className="rounded-lg border border-border p-3 space-y-2 hover:bg-muted/20 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-medium">{calc.label}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[9px]">{calc.module.replace('-', ' ')}</Badge>
                  <Badge variant="outline" className="text-[9px]">{SAVED_CALC_CATEGORY_LABELS[calc.category]}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(calc.updatedAt), 'MMM d, yyyy HH:mm')}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeCalculation(calc.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            {calc.notes && <p className="text-xs text-muted-foreground">{calc.notes}</p>}
            {Object.keys(calc.result).length > 0 && (
              <div className="text-[10px] font-mono text-muted-foreground">
                {Object.entries(calc.result).slice(0, 4).map(([k, v]) => (
                  <span key={k} className="mr-3">{k}: {String(v)}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
