// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputEditor } from './input-editor';
import { runShortcut } from './workbench';
import { ResultView } from './result-view';
import { executeLocal } from '@myanlex/playground';
import { createMyanLexApplication } from '@myanlex/application';

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('playground DOM and keyboard safety', () => {
  it('requires acknowledgement before disabling guarded conversion and renders hostile input as text', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const setGuarded = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await act(async () =>
      root.render(
        <InputEditor
          operation="convert"
          text={'<img src=x onerror=alert(1)>က😀'}
          setText={vi.fn()}
          rows={[]}
          setRows={vi.fn()}
          from="unicode"
          to="zawgyi"
          setFrom={vi.fn()}
          setTo={vi.fn()}
          guarded={true}
          setGuarded={setGuarded}
        />,
      ),
    );
    expect(node.querySelector('img')).toBeNull();
    expect(node.querySelector('textarea')?.value).toContain('<img');
    const checkbox = node.querySelector<HTMLInputElement>(
      'input[type=checkbox]',
    )!;
    await act(async () => checkbox.click());
    expect(confirm).toHaveBeenCalledOnce();
    expect(setGuarded).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await act(async () => checkbox.click());
    expect(setGuarded).toHaveBeenCalledWith(false);
    expect(node.querySelector('select')).not.toBeNull();
    await act(async () => root.unmount());
  });
  it('preserves IME composition and supports both platform run shortcuts', () => {
    expect(
      runShortcut({
        key: 'Enter',
        ctrlKey: true,
        metaKey: false,
        isComposing: true,
      }),
    ).toBe(false);
    expect(
      runShortcut({
        key: 'Enter',
        ctrlKey: true,
        metaKey: false,
        isComposing: false,
      }),
    ).toBe(true);
    expect(
      runShortcut({
        key: 'Enter',
        ctrlKey: false,
        metaKey: true,
        isComposing: false,
      }),
    ).toBe(true);
    expect(
      runShortcut({
        key: 'Enter',
        ctrlKey: false,
        metaKey: false,
        isComposing: false,
      }),
    ).toBe(false);
  });
  it('labels stale results and prevents applying them without rendering markup', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    const run = executeLocal(
      createMyanLexApplication(),
      { operation: 'normalize', payload: { text: '<script>evil</script>😀' } },
      'test',
      () => 0,
    );
    await act(async () =>
      root.render(<ResultView run={run} stale={true} onApply={vi.fn()} />),
    );
    expect(node.querySelector('script')).toBeNull();
    expect(node.textContent).toContain('Stale result');
    const apply = Array.from(node.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Apply output'),
    )!;
    expect(apply.disabled).toBe(true);
    expect(node.querySelector('[role=tablist]')).not.toBeNull();
    const tabs = Array.from(node.querySelectorAll<HTMLElement>('[role=tab]'));
    await act(async () => {
      tabs[0]!.focus();
      tabs[0]!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      );
    });
    expect(document.activeElement?.textContent).toBe('JSON');
    expect(document.activeElement?.getAttribute('tabindex')).toBe('0');
    await act(async () => root.unmount());
  });
});
