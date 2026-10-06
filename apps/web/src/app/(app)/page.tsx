import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';

export const metadata: Metadata = { title: '首頁' };

/** Mobile dashboard layout only; KPI data arrives in Phase 8 (§3.4 Company Dashboard). */
const KPI_SLOTS = ['施工中工程', '本月待收', '本月待付', '逾期應收', '今日待處理'] as const;

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="首頁" description="資料將於 Phase 8 接上" />
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {KPI_SLOTS.map((label) => (
          <li key={label} className="bg-card rounded-2xl border p-4">
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums" aria-label={`${label}：尚無資料`}>
              —
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
