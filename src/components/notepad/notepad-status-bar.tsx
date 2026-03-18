'use client';

import { useNotepadEditorStore } from '@/store/notepad-editor-store';
import { NOTEPAD_LANGUAGE_LABELS, type NotepadLanguage } from '@/types';
import {
  WrapText, Hash, Eye, Minus, Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CursorPosition } from './notepad-editor';

interface NotepadStatusBarProps {
  cursor: CursorPosition;
  charCount: number;
  wordCount: number;
  language: NotepadLanguage;
  onLanguageChange: (lang: NotepadLanguage) => void;
}

const LANGUAGES: NotepadLanguage[] = [
  'plaintext', 'json', 'xml', 'javascript', 'python', 'css', 'html', 'markdown',
];

export function NotepadStatusBar({
  cursor,
  charCount,
  wordCount,
  language,
  onLanguageChange,
}: NotepadStatusBarProps) {
  const wordWrap = useNotepadEditorStore(s => s.wordWrap);
  const setWordWrap = useNotepadEditorStore(s => s.setWordWrap);
  const showLineNumbers = useNotepadEditorStore(s => s.showLineNumbers);
  const setShowLineNumbers = useNotepadEditorStore(s => s.setShowLineNumbers);
  const showWhitespace = useNotepadEditorStore(s => s.showWhitespace);
  const setShowWhitespace = useNotepadEditorStore(s => s.setShowWhitespace);
  const fontSize = useNotepadEditorStore(s => s.fontSize);
  const setFontSize = useNotepadEditorStore(s => s.setFontSize);
  const indentSize = useNotepadEditorStore(s => s.indentSize);
  const setIndentSize = useNotepadEditorStore(s => s.setIndentSize);

  return (
    <div className="flex items-center gap-1 border-t border-border bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground select-none shrink-0 overflow-x-auto">
      {/* Cursor position */}
      <span className="shrink-0">
        Ln {cursor.line}, Col {cursor.col}
        {cursor.selectionLength > 0 && (
          <span className="ml-1 text-primary">({cursor.selectionLength} selected)</span>
        )}
      </span>

      <span className="mx-1.5 text-border">|</span>

      {/* Counts — hidden on very small screens */}
      <span className="shrink-0 hidden sm:inline">
        {charCount.toLocaleString()} chars
      </span>
      <span className="shrink-0 hidden sm:inline ml-2">
        {wordCount.toLocaleString()} words
      </span>

      <span className="hidden sm:inline mx-1.5 text-border">|</span>

      {/* Indent size */}
      <span className="shrink-0 hidden md:inline">
        Spaces: {indentSize}
        <button
          onClick={() => setIndentSize(indentSize === 2 ? 4 : 2)}
          className="ml-1 hover:text-foreground transition-colors"
          title={`Switch to ${indentSize === 2 ? 4 : 2} spaces`}
        >
          ↔
        </button>
      </span>

      <span className="hidden md:inline mx-1.5 text-border">|</span>

      {/* UTF-8 */}
      <span className="shrink-0 hidden md:inline">UTF-8</span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Toggle buttons */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Font size */}
        <button
          onClick={() => setFontSize(fontSize - 1)}
          className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors hidden sm:block"
          title="Decrease font size"
          disabled={fontSize <= 10}
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="text-[10px] min-w-6 text-center hidden sm:block">{fontSize}</span>
        <button
          onClick={() => setFontSize(fontSize + 1)}
          className="p-1 rounded hover:bg-muted hover:text-foreground transition-colors hidden sm:block"
          title="Increase font size"
          disabled={fontSize >= 24}
        >
          <Plus className="h-3 w-3" />
        </button>

        <span className="hidden sm:inline mx-1 text-border">|</span>

        {/* Word wrap toggle */}
        <button
          onClick={() => setWordWrap(!wordWrap)}
          className={cn(
            'p-1 rounded transition-colors',
            wordWrap ? 'text-primary bg-primary/10' : 'hover:bg-muted hover:text-foreground',
          )}
          title={`Word wrap: ${wordWrap ? 'On' : 'Off'}`}
        >
          <WrapText className="h-3 w-3" />
        </button>

        {/* Line numbers toggle */}
        <button
          onClick={() => setShowLineNumbers(!showLineNumbers)}
          className={cn(
            'p-1 rounded transition-colors',
            showLineNumbers ? 'text-primary bg-primary/10' : 'hover:bg-muted hover:text-foreground',
          )}
          title={`Line numbers: ${showLineNumbers ? 'On' : 'Off'}`}
        >
          <Hash className="h-3 w-3" />
        </button>

        {/* Whitespace toggle */}
        <button
          onClick={() => setShowWhitespace(!showWhitespace)}
          className={cn(
            'p-1 rounded transition-colors hidden sm:block',
            showWhitespace ? 'text-primary bg-primary/10' : 'hover:bg-muted hover:text-foreground',
          )}
          title={`Whitespace: ${showWhitespace ? 'Visible' : 'Hidden'}`}
        >
          <Eye className="h-3 w-3" />
        </button>

        <span className="mx-1 text-border">|</span>

        {/* Language selector */}
        <select
          value={language}
          onChange={e => onLanguageChange(e.target.value as NotepadLanguage)}
          className="bg-transparent text-[11px] text-muted-foreground hover:text-foreground cursor-pointer outline-none border-none pr-1"
          title="Language mode"
        >
          {LANGUAGES.map(l => (
            <option key={l} value={l}>{NOTEPAD_LANGUAGE_LABELS[l]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
