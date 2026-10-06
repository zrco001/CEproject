import { Construction } from 'lucide-react';
import { PageHeader } from './page-header';

/** Shell-only placeholder for destinations implemented in later phases. */
export function PlaceholderPage({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageHeader title={title} />
      <section className="bg-card flex flex-col items-center gap-3 rounded-2xl border px-6 py-12 text-center">
        <Construction aria-hidden className="text-muted-foreground size-10" />
        <p className="text-base font-medium">此功能尚未開放</p>
        <p className="text-muted-foreground text-sm">預計於 Phase {phase} 實作</p>
      </section>
    </>
  );
}
