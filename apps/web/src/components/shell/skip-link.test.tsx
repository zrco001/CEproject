import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/finance',
}));

vi.mock('next/link', () => ({
  default: (props: ComponentProps<'a'>) => <a {...props} />,
}));

function renderShell() {
  return render(
    <AppShell>
      <button type="button">主內容第一個按鈕</button>
    </AppShell>,
  );
}

describe('skip link (跳到主要內容)', () => {
  it('is the first Tab stop', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.tab();

    const link = screen.getByRole('link', { name: '跳到主要內容' });
    expect(document.activeElement).toBe(link);
    expect(link.getAttribute('href')).toBe('#main-content');
  });

  it('moves focus to <main> with Enter, so the next Tab skips the navigation', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.tab();

    await user.keyboard('{Enter}');

    const main = screen.getByRole('main');
    expect(document.activeElement).toBe(main);
    expect(main.id).toBe('main-content');
    expect(main.tabIndex).toBe(-1);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '主內容第一個按鈕' }));
  });

  it('also works when clicked', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('link', { name: '跳到主要內容' }));

    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('stays off-screen until focused and is not a focus ring target on <main>', () => {
    renderShell();
    const classes = screen.getByRole('link', { name: '跳到主要內容' }).className.split(' ');
    // jsdom does not apply CSS; the real-browser check verifies the rendered position.
    expect(classes).toEqual(
      expect.arrayContaining(['fixed', '-translate-y-[calc(100%+1rem)]', 'focus:translate-y-0']),
    );
    expect(screen.getByRole('main').className.split(' ')).toContain('focus:outline-none');
  });
});
