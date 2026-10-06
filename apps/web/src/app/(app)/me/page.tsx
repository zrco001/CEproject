import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: '我的' };

export default function MePage() {
  return <PlaceholderPage title="我的" phase={3} />;
}
