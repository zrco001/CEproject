import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock('next/link', () => ({
  default: (props: ComponentProps<'a'>) => <a {...props} />,
}));

function renderShell(pathname: string) {
  navigation.pathname = pathname;
  return render(
    <AppShell>
      <p>content</p>
    </AppShell>,
  );
}

function sidebar(): HTMLElement {
  return screen.getByRole('complementary', { name: '側邊導覽' });
}

/** The icon rail (md) is the sidebar's list; the full sidebar (lg) is its nested nav. */
function rail(): HTMLElement {
  const list = sidebar().querySelector('ul');
  if (!list) throw new Error('rail list not found');
  return list;
}

function fullSidebar(): HTMLElement {
  const nav = sidebar().querySelector('nav');
  if (!nav) throw new Error('full sidebar nav not found');
  return nav;
}

function currentLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[aria-current="page"]')].map((el) =>
    el.textContent.trim(),
  );
}

/**
 * jsdom does not evaluate CSS media queries, so breakpoint visibility is asserted through the
 * Tailwind responsive classes that implement §9.1. Real-browser results are recorded separately.
 */
describe('responsive navigation breakpoint contract (§9.1)', () => {
  beforeEach(() => {
    renderShell('/');
  });

  it('shows the bottom navigation only below 768px', () => {
    const bottom = screen.getByRole('navigation', { name: '主要導覽' });
    expect(bottom.className.split(' ')).toContain('md:hidden');
  });

  it('hides the sidebar below 768px and shows it from 768px', () => {
    const classes = sidebar().className.split(' ');
    expect(classes).toEqual(expect.arrayContaining(['hidden', 'md:flex', 'w-20', 'lg:w-64']));
  });

  it('shows the icon rail from 768px to 1023px and the full sidebar from 1024px', () => {
    expect(rail().className.split(' ')).toContain('lg:hidden');
    expect(fullSidebar().className.split(' ')).toEqual(
      expect.arrayContaining(['hidden', 'lg:block']),
    );
  });

  it('offsets the main content by the rail and sidebar widths', () => {
    const shell = screen.getByRole('main').parentElement;
    expect(shell?.className.split(' ')).toEqual(expect.arrayContaining(['md:pl-20', 'lg:pl-64']));
  });
});

/**
 * Links that sit against the viewport edge (bottom nav) or a scroll container (rail, sidebar,
 * Quick Add list) draw the focus ring inset so it is never clipped. Measured in a real browser;
 * this guards the class that implements it.
 */
describe('focus ring is inset on edge-adjacent links', () => {
  const INSET = 'focus-visible:-outline-offset-2';

  it('applies to bottom navigation, icon rail and full sidebar links', () => {
    renderShell('/');
    const bottom = screen.getByRole('navigation', { name: '主要導覽' });
    const links = [
      ...within(bottom).getAllByRole('link'),
      ...within(rail()).getAllByRole('link'),
      ...within(fullSidebar()).getAllByRole('link'),
    ];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.className.split(' '), link.textContent).toContain(INSET);
    }
  });
});

describe('active navigation state', () => {
  it.each([
    ['/', '首頁', 'Dashboard', 'Dashboard'],
    ['/projects', '工程', '工程管理', '工程'],
    ['/finance/receipts/new', '帳務', '帳務', '收款'],
    ['/finance/expenses', '帳務', '帳務', '支出'],
    ['/settings/employees', '我的', '系統設定', '員工'],
    ['/settings', '我的', '系統設定', '系統設定'],
  ])('%s → bottom %s, rail %s, sidebar %s', (pathname, bottomLabel, railLabel, sidebarLabel) => {
    renderShell(pathname);
    const bottom = screen.getByRole('navigation', { name: '主要導覽' });

    expect(currentLabels(bottom)).toEqual([bottomLabel]);
    expect(currentLabels(rail())).toEqual([railLabel]);
    expect(currentLabels(fullSidebar())).toEqual([sidebarLabel]);
  });

  it('marks nothing as current on an unregistered path', () => {
    renderShell('/nope');
    expect(currentLabels(fullSidebar())).toEqual([]);
    expect(within(rail()).queryAllByRole('link', { current: 'page' })).toEqual([]);
  });
});
