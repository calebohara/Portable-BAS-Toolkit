'use client';

import { Minus, Plus } from 'lucide-react';
import { usePpclEditorStore } from '@/store/ppcl-editor-store';
import { Button } from '@/components/ui/button';
import type { CursorPosition } from './ppcl-editor';
import type { PpclFirmwareTarget } from '@/types';

interface PpclStatusBarProps {
  cursor: CursorPosition;
  charCount: number;
  lineCount: number;
  firmware: PpclFirmwareTarget;
  isDirty: boolean;
}

const FIRMWARE_LABELS: Record<PpclFirmwareTarget, string> = {
  'pxc-tc': 'PXC/TC',
  'ptec': 'PTEC',
};

const LINE_LIMITS: Record<PpclFirmwareTarget, number> = {
  'pxc-tc': 198,
  'ptec': 80,
};

const STEP_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function PpclStatusBar({ cursor, charCount, lineCount, firmware, isDirty }: PpclStatusBarProps) {
  const fontSize = usePpclEditorStore(s => s.fontSize);
  const setFontSize = usePpclEditorStore(s => s.setFontSize);
  const wordWrap = usePpclEditorStore(s => s.wordWrap);
  const setWordWrap = usePpclEditorStore(s => s.setWordWrap);
  const lineStep = usePpclEditorStore(s => s.lineStep);
  const setLineStep = usePpclEditorStore(s => s.setLineStep);

  const lineLimit = LINE_LIMITS[firmware];

  return (
    <div className="flex items-center gap-3 px-3 py-1 border-t border-border bg-muted/30 text-[11px] text-muted-foreground shrink-0 flex-wrap">
      {/* Cursor position */}
      <span>Ln {cursor.line}</span>
      {cursor.selectionLength > 0 && <span>({cursor.selectionLength} sel)</span>}

      {/* Line/char count */}
      <span className="hidden md:inline">{lineCount} lines</span>
      <span className="hidden md:inline">{charCount.toLocaleString()} chars</span>

      {/* Firmware target */}
      <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium uppercase">
        {FIRMWARE_LABELS[firmware]} · {lineLimit} char/line
      </span>

      {/* Line step selector */}
      <div className="flex items-center gap-1" title="PPCL line number auto-increment step (applied on Enter)">
        <span className="text-[10px]">Step:</span>
        <select
          value={lineStep}
          onChange={e => setLineStep(parseInt(e.target.value, 10))}
          className="h-5 bg-muted border border-border rounded text-[10px] px-1 cursor-pointer outline-none focus:ring-1 focus:ring-primary"
        >
          {STEP_OPTIONS.map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {/* Save status */}
      <span className={isDirty ? 'text-amber-500' : 'text-green-500'}>
        {isDirty ? 'Unsaved' : 'Saved'}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Shortcuts hint */}
      <span className="hidden lg:inline text-[10px]">Ctrl+F Find · Ctrl+H Replace</span>

      {/* Editor controls */}
      <div className="hidden md:flex items-center gap-1">
        <button
          onClick={() => setWordWrap(!wordWrap)}
          className="px-1.5 py-0.5 rounded hover:bg-muted text-[10px]"
          title="Toggle word wrap"
        >
          {wordWrap ? 'Wrap: On' : 'Wrap: Off'}
        </button>

        <div className="flex items-center gap-0.5 ml-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => setFontSize(fontSize - 1)}
            title="Decrease font size"
            aria-label="Decrease font size"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-5 text-center text-[10px]">{fontSize}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => setFontSize(fontSize + 1)}
            title="Increase font size"
            aria-label="Increase font size"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
