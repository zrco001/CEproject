import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

export const metadata: Metadata = { title: '工程' };

export default function ProjectsPage() {
  return <PlaceholderPage title="工程" phase={4} />;
}
