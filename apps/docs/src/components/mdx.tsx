import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import type { MDXComponents } from 'mdx/types';
import { PreviewOnly } from './preview-only';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Tab,
    Tabs,
    Step,
    Steps,
    PreviewOnly,
    ...components,
  } satisfies MDXComponents;
}
export const useMDXComponents = getMDXComponents;
declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
