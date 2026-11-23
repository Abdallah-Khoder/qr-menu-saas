import { previewMenuPath } from '@/lib/preview';

// A button that opens the restaurant's public menu, so the owner sees exactly what his customers see. It opens in the SAME
// tab (the browser's Back button returns to the dashboard) and the menu shows a bar that leads back, because of "?preview=1".
// The path is relative on purpose: it works on whatever address the owner is logged in at.
export default function ViewMenuLink({ slug, className, children }: { slug: string; className?: string; children: React.ReactNode }) {
  return (
    <a className={className} href={previewMenuPath(slug)}>
      {children}
    </a>
  );
}
