'use client';

import type { MouseEvent } from 'react';

export const MAIN_CONTENT_ID = 'main-content';

/**
 * First Tab stop on every page: lets keyboard users bypass the sidebar / bottom navigation.
 * Off-screen until focused. Activating it moves focus to <main>; without JavaScript the
 * #main-content fragment still works.
 */
export function SkipLink() {
  const skipToMain = (event: MouseEvent<HTMLAnchorElement>): void => {
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!main) {
      return;
    }
    // Keep the URL free of the fragment and move focus explicitly.
    event.preventDefault();
    main.focus();
  };

  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={skipToMain}
      className="bg-primary text-primary-foreground fixed top-3 left-3 z-[45] inline-flex min-h-12 -translate-y-[calc(100%+1rem)] items-center rounded-xl px-4 text-base font-medium shadow-lg focus:translate-y-0"
    >
      跳到主要內容
    </a>
  );
}
