import type { ConfigIssue, FieldIR, RunResult } from '../typespun-engine';
import { PRESETS } from '../sample';

export interface EnvEntry {
  readonly id: number;
  readonly key: string;
  readonly value: string;
}

interface LiveRunProps {
  readonly fields: readonly FieldIR[];
  readonly entries: readonly EnvEntry[];
  readonly result: RunResult | undefined;
  readonly onChange: (entries: readonly EnvEntry[]) => void;
  readonly onPreset: (id: string) => void;
}

export default function LiveRun({
  fields,
  entries,
  result,
  onChange,
  onPreset,
}: LiveRunProps) {
  const secretByEnv = new Map(
    fields.map((field) => [field.envName, field.secret]),
  );
  const badKeys = new Set(
    result && !result.ok
      ? result.issues
          .map((issue) => issue.envKey)
          .filter((key): key is string => Boolean(key))
      : [],
  );

  const update = (id: number, patch: Partial<EnvEntry>) =>
    onChange(
      entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );

  return (
    <div className="run">
      <div className="run-env">
        <div className="run-bar">
          <span className="run-bar-label">Environment</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="btn is-small"
              title={preset.hint}
              onClick={() => onPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
          <span className="pane-head-spacer" />
          <button
            type="button"
            className="btn is-small is-ghost"
            onClick={() =>
              onChange([
                ...entries,
                { id: Date.now(), key: '', value: '' },
              ])
            }
          >
            + variable
          </button>
        </div>
        <p className="run-hint">
          These never touch <code>process.env</code>: the playground calls{' '}
          <code>loadConfig({'{ source }'})</code>. A blank value counts as unset.
        </p>
        <div className="env-rows">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`env-row${badKeys.has(entry.key) ? ' is-bad' : ''}`}
            >
              <input
                className="key"
                value={entry.key}
                spellCheck={false}
                aria-label="Variable name"
                onChange={(event) => update(entry.id, { key: event.target.value })}
              />
              <input
                className="value"
                value={entry.value}
                spellCheck={false}
                placeholder={
                  secretByEnv.get(entry.key) ? 'secret value' : 'unset'
                }
                aria-label={`Value for ${entry.key || 'new variable'}`}
                onChange={(event) =>
                  update(entry.id, { value: event.target.value })
                }
              />
              <button
                type="button"
                className="drop"
                title="Remove"
                aria-label={`Remove ${entry.key}`}
                onClick={() =>
                  onChange(entries.filter((other) => other.id !== entry.id))
                }
              >
                ×
              </button>
            </div>
          ))}
          {entries.length === 0 && (
            <p className="run-hint">
              Nothing set. Every required leaf without a default will report
              itself below.
            </p>
          )}
        </div>
      </div>

      <div className="run-out">
        <Outcome result={result} fields={fields} />
        <Precedence />
      </div>
    </div>
  );
}

function Outcome({
  result,
  fields,
}: {
  readonly result: RunResult | undefined;
  readonly fields: readonly FieldIR[];
}) {
  if (!result) {
    return (
      <div className="empty">
        <strong>Nothing to run</strong>
        <span>Fix the interface on the left and the loader will run again.</span>
      </div>
    );
  }

  if (result.ok) {
    return (
      <>
        <div className="result-banner ok">
          <span className="dot" />
          loadConfig() resolved — every value validated and typed
        </div>
        <pre className="code-fallback">{JSON.stringify(result.value, null, 2)}</pre>
      </>
    );
  }

  if ('crash' in result) {
    return (
      <>
        <div className="result-banner bad">
          <span className="dot" />
          The loader threw something that is not a ConfigError
        </div>
        <pre className="code-fallback">{result.crash}</pre>
      </>
    );
  }

  const secretByEnv = new Map(
    fields.map((field) => [field.envName, field.secret]),
  );

  return (
    <>
      <div className="result-banner bad">
        <span className="dot" />
        ConfigError — {result.issues.length}{' '}
        {result.issues.length === 1 ? 'issue' : 'issues'}, all reported at once
      </div>
      <div className="issues">
        {result.issues.map((issue, index) => (
          <Issue
            key={`${issue.path}-${index}`}
            issue={issue}
            secret={
              (issue.envKey && secretByEnv.get(issue.envKey)) ||
              issue.message === 'Invalid value for secret field'
            }
          />
        ))}
      </div>
    </>
  );
}

function Issue({
  issue,
  secret,
}: {
  readonly issue: ConfigIssue;
  readonly secret: boolean;
}) {
  const redacted = secret && issue.code === 'invalid_value';
  return (
    <div className={`issue${secret ? ' is-secret' : ''}`}>
      <div className="issue-head">
        <span className="issue-path">{issue.path}</span>
        <span className="issue-code">{issue.code}</span>
        {secret && <span className="badge secret">secret</span>}
      </div>
      <div className="issue-msg">{issue.message}</div>
      <div className="issue-meta">
        {issue.envKey && (
          <span>
            <b>env</b> {issue.envKey}
          </span>
        )}
        {issue.source && (
          <span>
            <b>from</b> {issue.source}
          </span>
        )}
        {'received' in issue && (
          <span>
            <b>received</b> {JSON.stringify(issue.received)}
          </span>
        )}
      </div>
      {redacted && (
        <div className="redacted">
          <span>
            Redacted: the offending value is not in the issue at all, and the
            message is generic.
          </span>
          <code>••••••••</code>
        </div>
      )}
    </div>
  );
}

function Precedence() {
  return (
    <div className="precedence">
      <h3>Source precedence</h3>
      <ol>
        <li>
          typed <code>overrides</code> <em>— not used here</em>
        </li>
        <li className="is-live">
          explicit <code>source</code> <em>— the table above</em>
        </li>
        <li>
          dotenv files <em>— needs a filesystem</em>
        </li>
        <li>
          compiled JSON/YAML defaults <em>— needs a filesystem</em>
        </li>
        <li className="is-live">
          inline <code>@default</code> tags
        </li>
      </ol>
    </div>
  );
}
