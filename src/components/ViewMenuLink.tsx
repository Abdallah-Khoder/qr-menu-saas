// A button that opens the restaurant's public menu in a new tab, so the owner sees exactly what his customers see.
// The path is relative on purpose: it works on whatever address the owner is logged in at.
export default function ViewMenuLink({ slug, className, children }: { slug: string; className?: string; children: React.ReactNode }) {
  return (
    <a className={className} href={`/m/${slug}`} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
