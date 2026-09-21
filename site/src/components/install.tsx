import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import {
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
} from 'fumadocs-ui/components/codeblock';

const MANAGERS = ['bun', 'npm', 'pnpm'] as const;
type Manager = (typeof MANAGERS)[number];

export type InstallProps = Record<Manager, string>;

/**
 * Package-manager tabs for shell snippets. The choice is shared across every
 * block on the page and persisted, so a reader picks pnpm once.
 */
export function Install(props: InstallProps) {
  return (
    <CodeBlockTabs groupId="package-manager" persist defaultValue="bun">
      <CodeBlockTabsList>
        {MANAGERS.map((manager) => (
          <CodeBlockTabsTrigger key={manager} value={manager}>
            {manager}
          </CodeBlockTabsTrigger>
        ))}
      </CodeBlockTabsList>
      {MANAGERS.map((manager) => (
        <CodeBlockTab key={manager} value={manager}>
          <DynamicCodeBlock lang="bash" code={props[manager]} />
        </CodeBlockTab>
      ))}
    </CodeBlockTabs>
  );
}
