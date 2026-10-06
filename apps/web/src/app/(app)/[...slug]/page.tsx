import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ROUTE_REGISTRY } from '@/components/shell/navigation';
import { PlaceholderPage } from '@/components/shell/placeholder-page';

/** Routes with their own page.tsx; the catch-all must not generate them. */
const EXPLICIT_ROUTES = new Set(['/', '/projects', '/finance', '/me']);

/** Only registered navigation destinations exist; anything else is a 404. */
export const dynamicParams = false;

export function generateStaticParams(): { slug: string[] }[] {
  return [...ROUTE_REGISTRY.keys()]
    .filter((path) => !EXPLICIT_ROUTES.has(path))
    .map((path) => ({ slug: path.split('/').filter(Boolean) }));
}

interface PlaceholderRouteProps {
  readonly params: Promise<{ slug: string[] }>;
}

function routeFor(slug: readonly string[]) {
  return ROUTE_REGISTRY.get(`/${slug.join('/')}`);
}

export async function generateMetadata({ params }: PlaceholderRouteProps): Promise<Metadata> {
  const route = routeFor((await params).slug);
  return route ? { title: route.title } : {};
}

export default async function PlaceholderRoute({ params }: PlaceholderRouteProps) {
  const route = routeFor((await params).slug);
  if (!route) {
    notFound();
  }
  return <PlaceholderPage title={route.title} phase={route.phase} />;
}
