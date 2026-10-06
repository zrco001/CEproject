import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

// jsdom cannot perform document navigation; keep the anchor semantics but stop the navigation.
vi.mock('next/link', () => ({
  default: ({ onClick, ...props }: ComponentProps<'a'>) => (
    <a
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    />
  ),
}));

function renderShell() {
  return render(
    <AppShell>
      <p>content</p>
    </AppShell>,
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    navigation.pathname = '/';
  });

  it('renders the bottom navigation with five entries', () => {
    renderShell();
    const nav = screen.getByRole('navigation', { name: '主要導覽' });
    expect(within(nav).getAllByRole('listitem')).toHaveLength(5);
    expect(within(nav).getByRole('link', { name: '工程' }).getAttribute('href')).toBe('/projects');
  });

  it('marks the active tab for nested routes', () => {
    navigation.pathname = '/finance/receipts/new';
    renderShell();
    const nav = screen.getByRole('navigation', { name: '主要導覽' });
    expect(within(nav).getByRole('link', { name: '帳務' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(nav).getByRole('link', { name: '首頁' }).getAttribute('aria-current')).toBeNull();
  });

  it('opens the quick add sheet from the centre button and closes it after choosing', async () => {
    const user = userEvent.setup();
    renderShell();
    const nav = screen.getByRole('navigation', { name: '主要導覽' });
    const trigger = within(nav).getByRole('button', { name: '新增' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: '新增' });
    expect(
      within(dialog)
        .getByRole('link', { name: /新增收款/ })
        .getAttribute('href'),
    ).toBe('/finance/receipts/new');
    expect(within(dialog).getByRole('link', { name: /其他收入 \/ 收入認列/ })).toBeTruthy();
    expect(within(dialog).queryByRole('link', { name: /^新增收入/ })).toBeNull();

    await user.click(within(dialog).getByRole('link', { name: /新增支出/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the sidebar groups for desktop', () => {
    renderShell();
    const sidebar = screen.getByRole('complementary', { name: '側邊導覽' });
    expect(within(sidebar).getAllByRole('link', { name: '收入認列' }).length).toBeGreaterThan(0);
    expect(within(sidebar).getAllByRole('link', { name: '支出審核' }).length).toBeGreaterThan(0);
  });
});
