import type { FieldIR } from '@/lib/playground/engine';

function typeLabel(kind: FieldIR['kind']): string {
  switch (kind.type) {
    case 'enum':
      return kind.values.map((value) => `'${value}'`).join(' | ');
    case 'array':
      return `${kind.element}[]`;
    default:
      return kind.type;
  }
}

export default function SchemaTable({
  fields,
  envPrefix,
}: {
  readonly fields: readonly FieldIR[];
  readonly envPrefix: string;
}) {
  if (fields.length === 0) {
    return (
      <div className="empty">
        <strong>No fields yet</strong>
        <span>
          Mark an exported interface with <code>@typespun</code> and give it at
          least one supported leaf.
        </span>
      </div>
    );
  }

  return (
    <>
      <p className="schema-intro">
        Every leaf gets one environment variable. The name is the prefix{' '}
        <code>{envPrefix || '(none)'}</code> plus the property path in
        SCREAMING_SNAKE_CASE, unless an <code>@env</code> tag overrides it.
      </p>
      <div className="table-wrap">
        <table className="schema">
          <thead>
            <tr>
              <th>Property</th>
              <th>Type</th>
              <th>Environment variable</th>
              <th>Presence</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => {
              const path = field.propertyPath;
              const overridden =
                envPrefix.length > 0 &&
                !field.envName.startsWith(`${envPrefix}_`);
              return (
                <tr key={path.join('.')}>
                  <td className="cell-path">
                    {path.length > 1 && (
                      <span className="cell-path-parent">
                        {path.slice(0, -1).join('.')}.
                      </span>
                    )}
                    {path.at(-1)}
                  </td>
                  <td data-label="Type">
                    <span className="type-chip">{typeLabel(field.kind)}</span>
                  </td>
                  <td className="cell-env">{field.envName}</td>
                  <td data-label="Presence">
                    <span className={`badge ${field.required ? 'req' : 'opt'}`}>
                      {field.required ? 'required' : 'optional'}
                    </span>
                  </td>
                  <td data-label="Notes">
                    <span className="note-cell">
                      {field.secret && <span className="badge secret">secret</span>}
                      {field.hasDefault && (
                        <span className="badge default">
                          = {JSON.stringify(field.defaultValue)}
                        </span>
                      )}
                      {overridden && (
                        <span className="badge default">@env</span>
                      )}
                      {field.optionalParents.length > 0 && (
                        <span className="badge opt">
                          in {field.optionalParents.at(-1)!.join('.')}?
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
