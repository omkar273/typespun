import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Install } from './install';
import { Figure } from './figure';
import { FeatureMatrix } from './feature-matrix';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Install,
    Figure,
    FeatureMatrix,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
