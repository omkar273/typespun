'use client';

import { Editor, loader, type OnMount } from '@monaco-editor/react';
// Only the TypeScript language is pulled in: importing `monaco-editor`
// wholesale would also bundle a tokenizer for every other language it ships.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/editor.all.js';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import { useEffect, useRef } from 'react';

// Monaco is bundled rather than pulled from a CDN, so the playground keeps
// working behind a proxy and always matches the version we tested against.
// Vite spells these `import worker from '...?worker'`. Turbopack instead
// recognises `new Worker(new URL(...))`, and only with a *relative* path — a
// bare package specifier is not a valid URL, so the hop through node_modules
// has to be written out.
(
  self as unknown as { MonacoEnvironment: monaco.Environment }
).MonacoEnvironment = {
  getWorker(_workerId, label) {
    return label === 'typescript' || label === 'javascript'
      ? new Worker(
          new URL(
            '../../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js',
            import.meta.url,
          ),
          { type: 'module' },
        )
      : new Worker(
          new URL(
            '../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js',
            import.meta.url,
          ),
          { type: 'module' },
        );
  },
};

loader.config({ monaco });

monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.Latest,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  strict: true,
  noEmit: true,
  allowNonTsExtensions: true,
});

// Chrome colours track the site palette (warm stone + amber) so the editor
// does not read as a window into a different product. The token hues stay
// distinct enough to keep code legible in both themes.
defineTheme('typespun-dark', 'vs-dark', {
  base: '#1c1917',
  surface: '#232020',
  text: '#ede9e4',
  comment: '#8a827b',
  keyword: '#f59e0b',
  string: '#8fcf9d',
  number: '#d9a6f2',
  type: '#7fb8e0',
  line: '#262220',
});

defineTheme('typespun-light', 'vs', {
  base: '#ffffff',
  surface: '#f5f3f0',
  text: '#1c1917',
  comment: '#6f6862',
  keyword: '#9a4a08',
  string: '#15803d',
  number: '#6d28d9',
  type: '#1d4ed8',
  line: '#faf9f7',
});

function defineTheme(
  name: string,
  base: monaco.editor.BuiltinTheme,
  palette: Record<string, string>,
): void {
  monaco.editor.defineTheme(name, {
    base,
    inherit: true,
    rules: [
      {
        token: 'comment',
        foreground: palette.comment!.slice(1),
        fontStyle: 'italic',
      },
      { token: 'keyword', foreground: palette.keyword!.slice(1) },
      { token: 'string', foreground: palette.string!.slice(1) },
      { token: 'number', foreground: palette.number!.slice(1) },
      { token: 'type', foreground: palette.type!.slice(1) },
      { token: 'type.identifier', foreground: palette.type!.slice(1) },
      { token: 'identifier', foreground: palette.text!.slice(1) },
    ],
    colors: {
      'editor.background': palette.base!,
      'editor.foreground': palette.text!,
      'editorLineNumber.foreground': palette.comment!,
      'editorLineNumber.activeForeground': palette.keyword!,
      'editor.lineHighlightBackground': palette.line!,
      'editorGutter.background': palette.base!,
      'editorWidget.background': palette.surface!,
      'editorIndentGuide.background1': palette.line!,
    },
  });
}

export interface EditorMarker {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

interface CodeEditorProps {
  readonly value: string;
  readonly path: string;
  readonly theme: 'dark' | 'light';
  readonly readOnly?: boolean;
  readonly markers?: readonly EditorMarker[];
  readonly onChange?: (value: string) => void;
}

export default function CodeEditor({
  value,
  path,
  theme,
  readOnly = false,
  markers,
  onChange,
}: CodeEditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  // Monaco applies themes globally and repaints lazily; nudging it keeps both
  // editors in step when the app theme flips.
  useEffect(() => {
    editorRef.current?.render(true);
  }, [theme]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      'typespun',
      (markers ?? []).map((marker) => ({
        severity: monaco.MarkerSeverity.Error,
        message: marker.message,
        startLineNumber: marker.line,
        startColumn: marker.column,
        endLineNumber: marker.line,
        endColumn: marker.column + 1,
      })),
    );
  }, [markers, value]);

  return (
    <Editor
      className="editor-host"
      path={path}
      value={value}
      language="typescript"
      theme={theme === 'dark' ? 'typespun-dark' : 'typespun-light'}
      onMount={handleMount}
      onChange={(next) => onChange?.(next ?? '')}
      loading={<div className="empty">Opening the editor…</div>}
      options={{
        readOnly,
        domReadOnly: readOnly,
        fontFamily:
          'var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 13,
        lineHeight: 21,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        padding: { top: 14, bottom: 18 },
        renderLineHighlight: readOnly ? 'none' : 'line',
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'on',
        scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9 },
        overviewRulerLanes: 0,
        guides: { indentation: true },
        fixedOverflowWidgets: true,
      }}
    />
  );
}
