'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { EnvEntry } from './live-run';
import LiveRun from './live-run';
import SchemaTable from './schema-table';
import { DEFAULT_ENV_PREFIX, PRESETS, SAMPLE_SOURCE } from '@/lib/playground/sample';
import { decodeState, encodeState } from '@/lib/playground/share';
import { useSiteTheme } from '@/lib/playground/use-site-theme';
import {
  type CompileResult,
  GENERATOR_VERSION,
  type Engine,
  loadEngine,
  type RunResult,
} from '@/lib/playground/engine';


/*
 * Monaco and the TypeScript compiler are the two heavy things on this page,
 * and neither is needed to paint it. Monaco arrives through this lazy import;
 * the compiler through `loadEngine()`. Keeping both out of the entry chunk is
 * what stops every docs page from paying for the playground.
 */
const CodeEditor = lazy(() => import('./code-editor'));

type Tab = 'loader' | 'schema' | 'run';

const COMPILE_DEBOUNCE_MS = 300;

export default function Playground() {
  const theme = useSiteTheme();
  const [tab, setTab] = useState<Tab>('loader');

  const [source, setSource] = useState(SAMPLE_SOURCE);
  const [envPrefix, setEnvPrefix] = useState(DEFAULT_ENV_PREFIX);
  const [entries, setEntries] = useState<readonly EnvEntry[]>([]);

  const [engine, setEngine] = useState<Engine>();
  const [status, setStatus] = useState('Warming up');
  const [fatal, setFatal] = useState<string>();
  const [compiled, setCompiled] = useState<CompileResult>();
  const [toast, setToast] = useState<string>();

  // A shared link supplies its own environment; otherwise seed one from the
  // schema the first time it compiles.
  const seededEnv = useRef(false);
  const nextId = useRef(1);

  const makeEntries = useCallback(
    (values: Record<string, string>, order: readonly string[]) => {
      const seen = new Set<string>();
      const ordered: EnvEntry[] = [];
      for (const key of order) {
        if (seen.has(key)) continue;
        seen.add(key);
        ordered.push({ id: nextId.current++, key, value: values[key] ?? '' });
      }
      for (const [key, value] of Object.entries(values)) {
        if (seen.has(key)) continue;
        ordered.push({ id: nextId.current++, key, value });
      }
      return ordered;
    },
    [],
  );

  /* ------------------------------------------------------------- startup */

  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      void decodeState(window.location.hash).then((shared) => {
        if (cancelled || !shared) return;
        seededEnv.current = true;
        setSource(shared.source);
        setEnvPrefix(shared.envPrefix);
        setEntries(makeEntries(shared.env, Object.keys(shared.env)));
      });
    };
    apply();
    // Our own writes use replaceState, which does not fire this — so the only
    // thing that gets here is someone pasting a link into an open tab.
    window.addEventListener('hashchange', apply);
    return () => {
      cancelled = true;
      window.removeEventListener('hashchange', apply);
    };
  }, [makeEntries]);

  useEffect(() => {
    let cancelled = false;
    loadEngine(setStatus).then(
      (ready) => !cancelled && setEngine(ready),
      (error: unknown) =>
        !cancelled &&
        setFatal(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------- compile */

  useEffect(() => {
    if (!engine) return;
    const timer = setTimeout(() => {
      try {
        setCompiled(engine.compile(source, envPrefix));
        setFatal(undefined);
      } catch (error) {
        // Belt and braces: a compiler crash must not take the page down.
        setFatal(error instanceof Error ? error.message : String(error));
      }
    }, COMPILE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [engine, source, envPrefix]);

  const fields = compiled?.fields ?? [];

  // Keep one row per schema variable, in schema order, preserving what the
  // user typed and any extra variables they added by hand.
  useEffect(() => {
    if (!compiled) return;
    const schemaKeys = fields.map((field) => field.envName);

    if (!seededEnv.current) {
      seededEnv.current = true;
      const preset = PRESETS[0]!.build(fields);
      setEntries(makeEntries(preset, schemaKeys));
      return;
    }

    setEntries((current) => {
      const values = Object.fromEntries(
        current.map((entry) => [entry.key, entry.value]),
      );
      const extras = current.filter(
        (entry) => entry.key !== '' && !schemaKeys.includes(entry.key),
      );
      const blanks = current.filter((entry) => entry.key === '');
      const merged = [
        ...schemaKeys.map<EnvEntry>((key) => {
          const existing = current.find((entry) => entry.key === key);
          return existing ?? { id: nextId.current++, key, value: values[key] ?? '' };
        }),
        ...extras,
        ...blanks,
      ];
      return sameShape(current, merged) ? current : merged;
    });
  }, [compiled, makeEntries]);

  /* ----------------------------------------------------------------- run */

  const envRecord = useMemo(() => {
    const record: Record<string, string> = {};
    for (const entry of entries) {
      // A blank value means "not set", which is what makes the rows usable as
      // a checklist of what the schema expects.
      if (entry.key === '' || entry.value === '') continue;
      record[entry.key] = entry.value;
    }
    return record;
  }, [entries]);

  const runResult: RunResult | undefined = useMemo(() => {
    if (!engine || !compiled?.schema) return undefined;
    return engine.run(compiled.schema, envRecord);
  }, [engine, compiled, envRecord]);

  /* --------------------------------------------------------------- share */

  useEffect(() => {
    const timer = setTimeout(() => {
      const allEnv = Object.fromEntries(
        entries.filter((entry) => entry.key !== '').map((e) => [e.key, e.value]),
      );
      void encodeState({ source, envPrefix, env: allEnv }).then((hash) => {
        window.history.replaceState(null, '', `#${hash}`);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [source, envPrefix, entries]);

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(undefined), 1800);
  }, []);

  const copy = useCallback(
    async (text: string, label: string) => {
      try {
        await navigator.clipboard.writeText(text);
        flash(`${label} copied`);
      } catch {
        flash('Clipboard blocked by the browser');
      }
    },
    [flash],
  );

  const applyPreset = useCallback(
    (id: string) => {
      const preset = PRESETS.find((candidate) => candidate.id === id);
      if (!preset) return;
      setEntries(
        makeEntries(
          preset.build(fields),
          fields.map((field) => field.envName),
        ),
      );
    },
    [fields, makeEntries],
  );

  /* ---------------------------------------------------------------- view */

  const analyzerErrors = compiled?.diagnostics ?? [];
  const typeErrors = compiled?.typeErrors ?? [];
  const markers = useMemo(
    () => [
      ...analyzerErrors.map((diagnostic) => ({
        line: diagnostic.location.line,
        column: diagnostic.location.column,
        message: `${diagnostic.message} (${diagnostic.code})`,
      })),
    ],
    [analyzerErrors],
  );

  const issueCount = runResult && !runResult.ok ? runResult.issues.length : 0;

  return (
    <div className="tsp">
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <h1 className="page-title">Playground</h1>
            <span className="brand-tag">
              one interface in, one validated config loader out
            </span>
          </div>
          <span className="topbar-spacer" />
          <div className="topbar-tools">
            <div className="prefix-field">
              <label htmlFor="env-prefix">prefix</label>
              <input
                id="env-prefix"
                value={envPrefix}
                spellCheck={false}
                onChange={(event) =>
                  setEnvPrefix(
                    event.target.value.replace(/[^\w]/g, '').toUpperCase(),
                  )
                }
              />
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void copy(window.location.href, 'Link');
              }}
            >
              Share link
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                seededEnv.current = false;
                setSource(SAMPLE_SOURCE);
                setEnvPrefix(DEFAULT_ENV_PREFIX);
              }}
            >
              Reset
            </button>
          </div>
        </header>

        <main className="workbench">
          <section className="pane editor-pane">
            <div className="pane-head">
              <span className="pane-title">Your interface</span>
              <span className="pane-file">config.ts</span>
              <span className="pane-head-spacer" />
              <button
                type="button"
                className="btn is-small is-ghost"
                onClick={() => {
                  void copy(source, 'Interface');
                }}
              >
                Copy
              </button>
            </div>
            <div className="pane-body">
              <Suspense
                fallback={<div className="empty">Opening the editor…</div>}
              >
                <CodeEditor
                  value={source}
                  path="config.ts"
                  theme={theme}
                  markers={markers}
                  onChange={setSource}
                />
              </Suspense>
            </div>
          </section>

          <section className="pane output-pane">
            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === 'loader'}
                onClick={() => setTab('loader')}
              >
                Generated loader
              </button>
              <button
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === 'schema'}
                onClick={() => setTab('schema')}
              >
                Schema
                <span className="tab-count">{fields.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === 'run'}
                onClick={() => setTab('run')}
              >
                Live run
                {runResult && (
                  <span
                    className={`tab-count ${runResult.ok ? 'is-ok' : 'is-bad'}`}
                  >
                    {runResult.ok ? 'ok' : issueCount}
                  </span>
                )}
              </button>
              <span className="pane-head-spacer" />
              {tab === 'loader' && compiled?.generated && (
                <button
                  type="button"
                  className="btn is-small is-ghost tab-action"
                  onClick={() => {
                    void copy(compiled.generated!, 'Loader');
                  }}
                >
                  Copy
                </button>
              )}
            </div>

            {fatal && (
              <div className="notice">
                <strong>Compiler error:</strong> {fatal}
              </div>
            )}

            <div className="pane-body">
              {!engine && !fatal ? (
                <div className="empty">
                  <span className="spinner" />
                  <strong>{status}…</strong>
                  <span>
                    The real TypeScript compiler runs in this tab; it is fetched
                    once and then cached.
                  </span>
                </div>
              ) : analyzerErrors.length > 0 ? (
                <div className="pane-scroll">
                  <Diagnostics
                    analyzer={analyzerErrors}
                    typeErrors={typeErrors}
                  />
                </div>
              ) : tab === 'loader' ? (
                compiled?.generated ? (
                  <Suspense
                    fallback={
                      <pre className="code-fallback">{compiled.generated}</pre>
                    }
                  >
                    <CodeEditor
                      value={compiled.generated}
                      path="config.generated.ts"
                      theme={theme}
                      readOnly
                    />
                  </Suspense>
                ) : (
                  <div className="empty">
                    <span className="spinner" />
                    <strong>Compiling…</strong>
                  </div>
                )
              ) : tab === 'schema' ? (
                <div className="pane-scroll">
                  <SchemaTable fields={fields} envPrefix={envPrefix} />
                </div>
              ) : (
                <LiveRun
                  fields={fields}
                  entries={entries}
                  result={runResult}
                  onChange={setEntries}
                  onPreset={applyPreset}
                />
              )}
            </div>

            <div className="statusbar">
              <span>typespun {GENERATOR_VERSION}</span>
              <span className="sep">·</span>
              <span>tsc {engine?.typescriptVersion ?? '…'}</span>
              <span className="sep">·</span>
              <span>{fields.length} fields</span>
              {typeErrors.length > 0 && (
                <>
                  <span className="sep">·</span>
                  <span style={{ color: 'var(--danger)' }}>
                    {typeErrors.length} type error
                    {typeErrors.length === 1 ? '' : 's'}
                  </span>
                </>
              )}
              <span className="pane-head-spacer" />
              {compiled?.fingerprint && (
                <span className="fingerprint" title={compiled.fingerprint}>
                  fingerprint {compiled.fingerprint.slice(0, 12)}
                </span>
              )}
            </div>
          </section>
        </main>

        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  );
}

function Diagnostics({
  analyzer,
  typeErrors,
}: {
  readonly analyzer: CompileResult['diagnostics'];
  readonly typeErrors: CompileResult['typeErrors'];
}) {
  return (
    <div className="diagnostics">
      <p className="schema-intro" style={{ border: 'none', padding: 0 }}>
        TypeSpun refused to generate. These are the analyzer's own diagnostics,
        exactly as the CLI would print them.
      </p>
      {analyzer.map((diagnostic, index) => (
        <div className="diagnostic" key={`${diagnostic.code}-${index}`}>
          <span className="diagnostic-loc">
            {diagnostic.location.line}:{diagnostic.location.column}
          </span>
          <span className="diagnostic-code">{diagnostic.code}</span>
          <span className="diagnostic-msg">
            {diagnostic.message}
            {diagnostic.suggestion && ` — ${diagnostic.suggestion}`}
          </span>
        </div>
      ))}
      {typeErrors.map((error, index) => (
        <div className="diagnostic" key={`ts-${index}`}>
          <span className="diagnostic-loc">
            {error.line}:{error.column}
          </span>
          <span className="diagnostic-code">TS{error.code}</span>
          <span className="diagnostic-msg">{error.message}</span>
        </div>
      ))}
    </div>
  );
}

function sameShape(
  left: readonly EnvEntry[],
  right: readonly EnvEntry[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) =>
        entry.key === right[index]!.key && entry.value === right[index]!.value,
    )
  );
}
