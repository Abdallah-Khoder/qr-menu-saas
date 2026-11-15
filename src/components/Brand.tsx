/** The app name with a small QR-like mark. Purely decorative, so the icon is hidden from screen readers. */
export default function Brand({ as: Tag = 'div' }: { as?: 'div' | 'h1' }) {
  return (
    <Tag className="logo">
      <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2" y="2" width="8" height="8" rx="2" />
        <rect x="14" y="2" width="8" height="8" rx="2" />
        <rect x="2" y="14" width="8" height="8" rx="2" />
        <rect x="14" y="14" width="3.5" height="3.5" rx="1" />
        <rect x="18.5" y="18.5" width="3.5" height="3.5" rx="1" />
      </svg>
      <span>منيو QR</span>
    </Tag>
  );
}
