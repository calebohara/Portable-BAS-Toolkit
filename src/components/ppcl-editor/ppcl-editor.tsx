'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePpclEditorStore } from '@/store/ppcl-editor-store';
import { useAppStore } from '@/store/app-store';

import CodeMirror from '@uiw/react-codemirror';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { ppclLanguage, ppclLineLengthEnforcement, ppclGotoNavigation } from '@/lib/ppcl-language';

export interface CursorPosition {
  line: number;
  selectionLength: number;
}

interface PpclEditorComponentProps {
  content: string;
  onContentChange: (content: string) => void;
  onCursorChange?: (pos: CursorPosition) => void;
  onSave?: () => void;
  onEditorView?: (view: EditorView) => void;
  /** Max characters per line for the active firmware target (198 for PXC/TC, 80 for PTEC) */
  charLimit?: number;
  /** Render the editor in read-only mode. Disables typing, the save shortcut, and the auto line-numbering Enter handler. */
  readOnly?: boolean;
}

/**
 * Extracts the PPCL line number from the beginning of a text line.
 * Returns null if the line doesn't start with a number.
 */
function extractLineNumber(lineText: string): number | null {
  const match = lineText.match(/^\s*(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function PpclEditorComponent({
  content,
  onContentChange,
  onCursorChange,
  onSave,
  onEditorView,
  charLimit = 198,
  readOnly = false,
}: PpclEditorComponentProps) {
  const wordWrap = usePpclEditorStore(s => s.wordWrap);
  const fontSize = usePpclEditorStore(s => s.fontSize);
  const lineStep = usePpclEditorStore(s => s.lineStep);
  const appTheme = useAppStore(s => s.theme);

  const [resolvedDark, setResolvedDark] = useState(false);

  const onCursorChangeRef = useRef(onCursorChange);
  const onSaveRef = useRef(onSave);
  const lineStepRef = useRef(lineStep);

  useLayoutEffect(() => {
    onCursorChangeRef.current = onCursorChange;
    onSaveRef.current = onSave;
    lineStepRef.current = lineStep;
  });

  useEffect(() => {
    if (appTheme === 'dark') {
      setResolvedDark(true);
    } else if (appTheme === 'light') {
      setResolvedDark(false);
    } else {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      setResolvedDark(mq.matches);
      const handler = (e: MediaQueryListEvent) => setResolvedDark(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [appTheme]);

  const extensions = useMemo(() => {
    const exts = [
      ppclLanguage(),
      search(),
      keymap.of(searchKeymap),
      EditorView.updateListener.of((update: ViewUpdate) => {
        const fn = onCursorChangeRef.current;
        if (!fn) return;
        const pos = update.state.selection.main;
        const line = update.state.doc.lineAt(pos.head);
        fn({
          line: line.number,
          selectionLength: Math.abs(pos.to - pos.from),
        });
      }),
    ];
    if (!readOnly) {
      // Prec.high ensures our Enter handler runs BEFORE basicSetup's insertNewlineAndIndent
      exts.push(Prec.high(keymap.of([
        {
          key: 'Enter',
          run: (view) => {
            const step = lineStepRef.current;
            const state = view.state;
            const pos = state.selection.main.head;
            const currentLine = state.doc.lineAt(pos);
            const currentLineNum = extractLineNumber(currentLine.text);

            if (currentLineNum !== null) {
              const nextNum = currentLineNum + step;
              if (nextNum <= 32767) {
                const insert = '\n' + nextNum + ' ';
                view.dispatch({
                  changes: { from: pos, insert },
                  selection: { anchor: pos + insert.length },
                });
                return true;
              }
            }

            return false;
          },
        },
      ])));
    }
    exts.push(keymap.of([
      // Save shortcut only makes sense when editable.
      ...(readOnly ? [] : [{
        key: 'Mod-s',
        run: () => { onSaveRef.current?.(); return true; },
      }]),
      {
        key: 'Mod-h',
        run: (view: EditorView) => { openSearchPanel(view); return true; },
      },
    ]));
    // Escape blurs the editor so keyboard users can navigate away
    // (Tab to sidebar, browser shortcuts, etc.). Without this, CodeMirror's
    // contenteditable captures focus and there is no keyboard escape route —
    // users feel "trapped" in the editor once they click into it.
    // Prec.high so this runs before any extension that might consume Escape
    // (e.g. autocomplete close), but autocomplete's Escape handler returns
    // true and stops propagation only when a completion is open, so this is
    // safe — Escape closes completions first, then a second Escape blurs.
    exts.push(Prec.high(keymap.of([
      {
        key: 'Escape',
        run: (view) => {
          // Only blur if no completion/search panel is consuming Escape
          // (those return true from their own handlers and prevent us from running).
          view.contentDOM.blur();
          return true;
        },
      },
    ])));
    exts.push(ppclLineLengthEnforcement(charLimit));
    exts.push(ppclGotoNavigation());
    if (readOnly) exts.push(EditorView.editable.of(false));
    if (wordWrap) exts.push(EditorView.lineWrapping);
    return exts;
  }, [wordWrap, charLimit, readOnly]);

  return (
    <CodeMirror
      value={content}
      onChange={onContentChange}
      extensions={extensions}
      theme={resolvedDark ? 'dark' : 'light'}
      onCreateEditor={(view) => onEditorView?.(view)}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        bracketMatching: true,
        closeBrackets: false,
        autocompletion: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
      }}
      style={{ fontSize: `${fontSize}px`, height: '100%' }}
      className="h-full overflow-auto"
    />
  );
}
