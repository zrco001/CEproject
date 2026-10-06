import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">找不到頁面</h1>
      <p className="text-muted-foreground">此頁面不存在或已移除。</p>
      <Link href="/" className={buttonVariants({ size: 'cta' })}>
        回到首頁
      </Link>
    </main>
  );
}
