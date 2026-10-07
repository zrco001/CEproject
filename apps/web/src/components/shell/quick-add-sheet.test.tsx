import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

const navigation = vi.hoisted(() => ({ pathname: '/', visited: [] as string[] }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

// jsdom cannot perform document navigation; record the destination and keep the anchor semantics.
vi.mock('next/link', () => ({
  default: ({ onClick, href, ...props }: ComponentProps<'a'>) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
        navigation.visited.push(String(href));
      }}
    />
  ),
}));

function renderShell() {
  navigation.visited = [];
  return render(
    <AppShell>
      <p>content</p>
    </AppShell>,
  );
}

function bottomNavTrigger(): HTMLElement {
  const nav = screen.getByRole('navigation', { name: '主要導覽' });
  return within(nav).getByRole('button', { name: '新增' });
}

function sidebarTriggers(): HTMLElement[] {
  const sidebar = screen.getByRole('complementary', { name: '側邊導覽' });
  return within(sidebar).getAllByRole('button', { name: '新增' });
}

async function openFrom(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) {
  await user.click(trigger);
  return screen.getByRole('dialog', { name: '新增' });
}

describe('Quick Add sheet interactions', () => {
  it('opens from the bottom navigation and moves focus into the sheet', async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = bottomNavTrigger();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    const dialog = await openFrom(user, trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes with the close button and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = bottomNavTrigger();
    const dialog = await openFrom(user, trigger);

    await user.click(within(dialog).getByRole('button', { name: '關閉' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when the overlay is clicked and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = bottomNavTrigger();
    await openFrom(user, trigger);

    const overlay = document.querySelector<HTMLElement>('[data-slot="sheet-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay!);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = bottomNavTrigger();
    await openFrom(user, trigger);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('navigates to the chosen item, closes, and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = bottomNavTrigger();
    const dialog = await openFrom(user, trigger);

    await user.click(within(dialog).getByRole('link', { name: /新增收款/ }));

    expect(navigation.visited).toEqual(['/finance/receipts/new']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('returns focus to whichever sidebar button opened it', async () => {
    const user = userEvent.setup();
    renderShell();

    for (const trigger of sidebarTriggers()) {
      await openFrom(user, trigger);
      expect(trigger.getAttribute('aria-expanded')).toBe('true');

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    }
  });
});
