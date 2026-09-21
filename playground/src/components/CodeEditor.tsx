import { loader, Editor, type OnMount } from '@monaco-editor/react';
// Only the TypeScript language is pulled in: importing `monaco-editor`
// wholesale would also bundle a tokenizer for every other language it ships.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/editor/editor.all.js';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { useEffect, useRef } from 'react';

// Monaco is bundled rather than pulled from a CDN, so the playground keeps
// working behind a proxy and always matches the version we tested against.
(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment =
  {
    getWorker(_workerId, label) {
      return label === 'typescript' || label === 'javascript'
        ? new tsWorker()
        : new editorWorker();
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

defineTheme('typespun-dark', 'vs-dark', {
  base: '#0e1015',
  surface: '#14171f',
  text: '#e7eaf0',
  comment: '#6f7a8d',
  keyword: '#f2b23e',
  string: '#7fd6a3',
  number: '#c69bff',
  type: '#79b8ff',
  line: '#1a1e28',
});

defineTheme('typespun-light', 'vs', {
  base: '#ffffff',
  surface: '#f3f0ea',
  text: '#191714',
  comment: '#8a8272',
  keyword: '#9a5c00',
  string: '#0f6b39',
  number: '#6f36c2',
  type: '#1c5d9e',
  line: '#f7f5f1',
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
      { token: 'comment', foreground: palette.comment!.slice(1), fontStyle: 'italic' },
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
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>();

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
          "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
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
