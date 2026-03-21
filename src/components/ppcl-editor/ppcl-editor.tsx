'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePpclEditorStore } from '@/store/ppcl-editor-store';
import { useAppStore } from '@/store/app-store';

import CodeMirror from '@uiw/react-codemirror';
import { EditorView, type ViewUpdate } from '@codemirror/view';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { ppclLanguage } from '@/lib/ppcl-language';

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
}: PpclEditorComponentProps) {
  const wordWrap = usePpclEditorStore(s => s.wordWrap);
  const fontSize = usePpclEditorStore(s => s.fontSize);
  const lineStep = usePpclEditorStore(s => s.lineStep);
  const appTheme = useAppStore(s => s.theme);

  const [resolvedDark, setResolvedDark] = useState(false);

  const onCursorChangeRef = useRef(onCursorChange);
  onCursorChangeRef.current = onCursorChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const lineStepRef = useRef(lineStep);
  lineStepRef.current = lineStep;

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
      // Prec.high ensures our Enter handler runs BEFORE basicSetup's insertNewlineAndIndent
      Prec.high(keymap.of([
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
      ])),
      keymap.of([
        {
          key: 'Mod-s',
          run: () => { onSaveRef.current?.(); return true; },
        },
        {
          key: 'Mod-h',
          run: (view) => { openSearchPanel(view); return true; },
        },
      ]),
    ];
    if (wordWrap) exts.push(EditorView.lineWrapping);
    return exts;
  }, [wordWrap]);

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
