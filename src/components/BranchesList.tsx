import { externalLink } from '@/lib/contact-links';

// The short list that opens beside the map icon when a restaurant has several branches: each name opens that branch's map.
// A name is wrapped in <bdi> so a name in the other language (or with punctuation) never breaks the line.
export default function BranchesList({ label, branches }: { label: string; branches: { name: string; href: string }[] }) {
  return (
    <div className="pm-branches" id="pm-branches" role="group" aria-label={label}>
      <strong>اختر الفرع</strong>
      <ul>
        {branches.map((b, i) => (
          <li key={i}>
            <a href={b.href} {...externalLink}><bdi>{b.name}</bdi></a>
          </li>
        ))}
      </ul>
    </div>
  );
}
