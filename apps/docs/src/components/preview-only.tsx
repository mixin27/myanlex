import type { ReactNode } from 'react';
import { Callout } from 'fumadocs-ui/components/callout';
import { developerPreview } from '@/lib/shared';

export function PreviewOnly({ children }: { children: ReactNode }) {
  return developerPreview ? (
    <Callout type="warn" title="Preview availability">
      {children}
    </Callout>
  ) : null;
}
