// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { executeLocal, type ExecutionRequest } from '@myanlex/playground';
import { createMyanLexApplication } from '@myanlex/application';
import { Workbench } from './workbench';
import { ResultView } from './result-view';
import type { SavedRuns } from './saved-runs';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  compare: vi.fn(),
  saved: null as ComponentProps<typeof SavedRuns> | null,
}));
vi.mock('@/lib/playground/local-runner', () => ({
  LocalRunner: class {
    execute = mocks.execute;
    compare = mocks.compare;
    cancel() {}
  },
}));
vi.mock('./saved-runs', () => ({
  SavedRuns: (props: ComponentProps<typeof SavedRuns>) => {
    mocks.saved = props;
    return null;
  },
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it('does not reuse a comparison or selected span for a different analyzed string', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const app = createMyanLexApplication();
  const first = executeLocal(
    app,
    { operation: 'normalize', payload: { text: 'ဦ' } },
    'test',
    () => 0,
  );
  const second = executeLocal(
    app,
    { operation: 'normalize', payload: { text: 'က' } },
    'test',
    () => 0,
  );
  mocks.compare.mockResolvedValueOnce({
    limited: false,
    prefix: '',
    removed: 'old comparison',
    added: '',
    suffix: '',
  });
  mocks.compare.mockReturnValueOnce(new Promise(() => {}));
  try {
    await act(async () =>
      root.render(<ResultView run={first} stale={false} onApply={vi.fn()} />),
    );
    const compare = Array.from(
      node.querySelectorAll<HTMLButtonElement>('[role=tab]'),
    ).find((tab) => tab.textContent === 'Compare')!;
    await act(async () => compare.click());
    expect(node.textContent).toContain('old comparison');
    await act(async () =>
      root.render(<ResultView run={second} stale={false} onApply={vi.fn()} />),
    );
    expect(node.textContent).not.toContain('old comparison');
    expect(node.textContent).toContain('Computing comparison locally');

    const syllables = executeLocal(
      app,
      { operation: 'syllabify', payload: { text: 'က' } },
      'test',
      () => 0,
    );
    await act(async () =>
      root.render(
        <ResultView run={syllables} stale={false} onApply={vi.fn()} />,
      ),
    );
    const readable = Array.from(
      node.querySelectorAll<HTMLButtonElement>('[role=tab]'),
    ).find((tab) => tab.textContent === 'Result')!;
    await act(async () => readable.click());
    const span = Array.from(
      node.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.includes('[0, 1)'))!;
    await act(async () => span.click());
    expect(node.querySelector('mark')).not.toBeNull();
    // A saved artifact may reuse request metadata with different result input.
    await act(async () =>
      root.render(
        <ResultView
          run={{
            ...syllables,
            result: app.syllabifyText({ text: 'ခ' }),
          }}
          stale={false}
          onApply={vi.fn()}
        />,
      ),
    );
    expect(node.querySelector('mark')).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});

it('reopens default-guarded conversion without executing or marking it stale, and ignores an old save completion', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  mocks.execute.mockImplementation(async (request: ExecutionRequest) =>
    executeLocal(createMyanLexApplication(), request, 'test', () => 0),
  );
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  try {
    await act(async () =>
      root.render(<Workbench user={null} docsUrl="/docs" />),
    );
    const savedTab = Array.from(
      node.querySelectorAll<HTMLButtonElement>('[role=tab]'),
    ).find((tab) => tab.textContent === 'Saved runs')!;
    await act(async () => savedTab.click());
    const snapshot = executeLocal(
      createMyanLexApplication(),
      {
        operation: 'convert',
        payload: { text: 'က', from: 'unicode', to: 'zawgyi' },
      },
      'test',
      () => 0,
    );
    await act(async () => mocks.saved!.onOpen(snapshot));
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      node.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked,
    ).toBe(true);
    expect(node.textContent).not.toContain('Stale result');
    const run = Array.from(
      node.querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.trim() === 'Run')!;
    await act(async () => run.click());
    const finishPreviousSave = mocks.saved!.onSaved;
    await act(async () => run.click());
    await act(async () => finishPreviousSave());
    const unsaved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unsaved);
    expect(unsaved.defaultPrevented).toBe(true);
    await act(async () => mocks.saved!.onSaved());
    const saved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});
