'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotepadEditorStore } from '@/store/notepad-editor-store';
import { useAppStore } from '@/store/app-store';
import type { NotepadLanguage } from '@/types';

// CodeMirror imports
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView, type ViewUpdate, highlightWhitespace } from '@codemirror/view';
import { search, searchKeymap, openSearchPanel } from '@codemirror/search';
import { keymap } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';

// Language support
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { markdown } from '@codemirror/lang-markdown';

function getLanguageExtension(lang: NotepadLanguage) {
  switch (lang) {
    case 'json': return json();
    case 'xml': return xml();
    case 'javascript': return javascript();
    case 'python': return python();
    case 'css': return css();
    case 'html': return html();
    case 'markdown': return markdown();
    default: return [];
  }
}

export interface CursorPosition {
  line: number;
  col: number;
  selectionLength: number;
}

interface NotepadEditorComponentProps {
  content: string;
  language: NotepadLanguage;
  onContentChange: (content: string) => void;
  onCursorChange?: (pos: CursorPosition) => void;
  onSave?: () => void;
}

export function NotepadEditorComponent({
  content,
  language,
  onContentChange,
  onCursorChange,
  onSave,
}: NotepadEditorComponentProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const wordWrap = useNotepadEditorStore(s => s.wordWrap);
  const showLineNumbers = useNotepadEditorStore(s => s.showLineNumbers);
  const fontSize = useNotepadEditorStore(s => s.fontSize);
  const showWhitespace = useNotepadEditorStore(s => s.showWhitespace);
  const indentSize = useNotepadEditorStore(s => s.indentSize);
  const appTheme = useAppStore(s => s.theme);

  const [resolvedDark, setResolvedDark] = useState(false);

  // Resolve system theme
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

  const handleUpdate = useCallback((viewUpdate: ViewUpdate) => {
    if (onCursorChange) {
      const state = viewUpdate.state;
      const pos = state.selection.main.head;
      const line = state.doc.lineAt(pos);
      const selLen = Math.abs(state.selection.main.to - state.selection.main.from);
      onCursorChange({
        line: line.number,
        col: pos - line.from + 1,
        selectionLength: selLen,
      });
    }
  }, [onCursorChange]);

  const extensions = useMemo(() => {
    const exts = [
      getLanguageExtension(language),
      search(),
      keymap.of(searchKeymap),
      indentUnit.of(' '.repeat(indentSize)),
      EditorView.theme({
        '&': { fontSize: `${fontSize}px` },
        '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' },
        '.cm-gutters': { fontSize: `${fontSize}px` },
        '.cm-scroller': { overflow: 'auto' },
      }),
      EditorView.updateListener.of(handleUpdate),
    ];
    if (wordWrap) exts.push(EditorView.lineWrapping);
    if (showWhitespace) {
      exts.push(highlightWhitespace());
    }
    // Save shortcut
    if (onSave) {
      exts.push(keymap.of([{
        key: 'Mod-s',
        run: () => { onSave(); return true; },
      }]));
    }
    return exts;
  }, [language, wordWrap, fontSize, showWhitespace, indentSize, handleUpdate, onSave]);

  // Expose method to trigger find panel
  const openFind = useCallback(() => {
    const view = editorRef.current?.view;
    if (view) openSearchPanel(view);
  }, []);

  // Store ref for external access
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__notepadEditorOpenFind = openFind;
    return () => { delete (window as unknown as Record<string, unknown>).__notepadEditorOpenFind; };
  }, [openFind]);

  return (
    <CodeMirror
      ref={editorRef}
      value={content}
      onChange={onContentChange}
      extensions={extensions}
      theme={resolvedDark ? 'dark' : 'light'}
      basicSetup={{
        lineNumbers: showLineNumbers,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
        foldGutter: true,
        bracketMatching: true,
        autocompletion: false,
        indentOnInput: true,
        history: true,
        searchKeymap: false, // we add our own
      }}
      style={{ height: '100%', overflow: 'auto' }}
      className="notepad-cm-editor"
    />
  );
}
