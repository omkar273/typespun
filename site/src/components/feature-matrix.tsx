import { cn } from '@/lib/cn';

type Mark = 'yes' | 'no' | 'partial';

const TOOLS = [
  'Typespun',
  'Zod',
  't3-env',
  'envalid',
  'convict',
  'node-config',
] as const;

interface Row {
  label: string;
  /** One value per entry in TOOLS, in the same order. */
  cells: [Mark, Mark, Mark, Mark, Mark, Mark];
  note?: string;
}

interface Group {
  title: string;
  rows: Row[];
}

const GROUPS: Group[] = [
  {
    title: 'Where Typespun is different',
    rows: [
      {
        label: 'A TypeScript interface is the source of truth',
        cells: ['yes', 'no', 'no', 'no', 'no', 'no'],
        note: 'The others derive the type from a schema, or leave it loose.',
      },
      {
        label: 'Generated loader you commit, with a CI drift check',
        cells: ['yes', 'no', 'no', 'no', 'no', 'no'],
      },
      {
        label: 'Env vars, .env files and defaults in one documented order',
        cells: ['yes', 'no', 'no', 'no', 'partial', 'partial'],
        note: 'convict and node-config layer files, env vars and arguments, but have no dotenv layer. envalid needs dotenv called separately; t3-env takes the env object you pass.',
      },
      {
        label: 'Secret values kept out of error output',
        cells: ['yes', 'no', 'no', 'no', 'partial', 'no'],
        note: 'convict masks a sensitive field when you print the config, not in validation errors.',
      },
    ],
  },
  {
    title: 'Table stakes',
    rows: [
      {
        label: 'Validates every field at startup',
        cells: ['yes', 'partial', 'yes', 'yes', 'yes', 'no'],
        note: 'With Zod you write and call the parse yourself.',
      },
      {
        label: 'Reports every problem at once',
        cells: ['yes', 'yes', 'yes', 'yes', 'yes', 'no'],
      },
    ],
  },
  {
    title: 'Where the others win',
    rows: [
      {
        label: 'No build step or generated code',
        cells: ['no', 'yes', 'yes', 'yes', 'yes', 'yes'],
      },
      {
        label: 'Custom transforms and refinements',
        cells: ['no', 'yes', 'yes', 'yes', 'yes', 'no'],
      },
      {
        label: 'Client / server variable split (Next.js, Nuxt)',
        cells: ['no', 'no', 'yes', 'no', 'no', 'no'],
      },
    ],
  },
];

const LABEL: Record<Mark, string> = {
  yes: 'Yes',
  no: 'No',
  partial: 'Partly',
};

function Cell({ mark, highlight }: { mark: Mark; highlight: boolean }) {
  return (
    <td
      className={cn(
        'px-3 py-3 text-center align-middle',
        highlight && 'bg-brand-accent/[0.06] dark:bg-brand-accent-bright/[0.07]',
      )}
    >
      <span className="sr-only">{LABEL[mark]}</span>
      <span aria-hidden="true" className="inline-flex">
        {mark === 'yes' && (
          <svg
            viewBox="0 0 20 20"
            className="size-5 text-brand-accent dark:text-brand-accent-bright"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 10.5l4 4 8-9" />
          </svg>
        )}
        {mark === 'no' && (
          <svg
            viewBox="0 0 20 20"
            className="size-5 text-fd-muted-foreground/60"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
          </svg>
        )}
        {mark === 'partial' && (
          <svg
            viewBox="0 0 20 20"
            className="size-5 text-brand-amber"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="10" cy="10" r="6.5" />
            <path d="M10 3.5a6.5 6.5 0 0 0 0 13z" fill="currentColor" />
          </svg>
        )}
      </span>
    </td>
  );
}

export function FeatureMatrix({ verified }: { verified: string }) {
  const notes = GROUPS.flatMap((g) => g.rows).filter((r) => r.note);

  return (
    <figure className="not-prose my-8">
      <div className="overflow-x-auto rounded-xl border border-fd-border bg-fd-card">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-fd-border">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-fd-card px-4 py-3 text-left font-medium text-fd-muted-foreground"
              >
                Capability
              </th>
              {TOOLS.map((tool, i) => (
                <th
                  key={tool}
                  scope="col"
                  className={cn(
                    'px-3 py-3 text-center font-display font-medium',
                    i === 0 &&
                      'bg-brand-accent/[0.06] text-brand-accent dark:bg-brand-accent-bright/[0.07] dark:text-brand-accent-bright',
                  )}
                >
                  {tool}
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((group) => (
            <tbody key={group.title}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={TOOLS.length + 1}
                  className="border-y border-fd-border bg-fd-muted/60 px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.1em] text-fd-muted-foreground"
                >
                  {group.title}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr
                  key={row.label}
                  className="border-b border-fd-border last:border-b-0"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-fd-card px-4 py-3 text-left font-normal"
                  >
                    {row.label}
                    {row.note && (
                      <span className="text-fd-muted-foreground">
                        {' '}
                        *
                      </span>
                    )}
                  </th>
                  {row.cells.map((mark, i) => (
                    <Cell key={TOOLS[i]} mark={mark} highlight={i === 0} />
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <figcaption className="mt-3 space-y-2 text-xs text-fd-muted-foreground">
        <p>
          Yes, partly and no, judged against each project&apos;s own
          documentation on {verified}. A missing tick means the documentation
          does not describe the capability, not that it is impossible.
          Swipe sideways on a narrow screen.
        </p>
        <ul className="space-y-1">
          {notes.map((row) => (
            <li key={row.label}>
              * <strong className="font-medium">{row.label}.</strong>{' '}
              {row.note}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
