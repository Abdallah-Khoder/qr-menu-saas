'use client';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

/** The table card: restaurant name + QR code + a short sentence. Print it, one big card or four per A4 page. */
export default function QrPrint({ name, svg, link }: { name: string; svg: string; link: string }) {
  const [perPage, setPerPage] = useState<1 | 4>(1);
  const hydrated = useHydrated();
  return (
    <>
      <div className="panel no-print qr-tools">
        <label className="field">
          <span>عدد البطاقات في الصفحة</span>
          <select value={perPage} onChange={(e) => setPerPage(e.target.value === '4' ? 4 : 1)} disabled={!hydrated}>
            <option value={1}>بطاقة واحدة كبيرة</option>
            <option value={4}>أربع بطاقات (للقص)</option>
          </select>
        </label>
        <button type="button" className="btn" disabled={!hydrated} onClick={() => window.print()}>طباعة</button>
        <a className="btn ghost" href="/api/owner/qr?format=png" download>تحميل PNG</a>
        <a className="btn ghost" href="/api/owner/qr?format=svg" download>تحميل SVG</a>
      </div>
      <div className={`qr-sheet n${perPage}`}>
        {Array.from({ length: perPage }, (_, i) => (
          <div key={i} className="qr-card">
            <h2 dir="auto">{name}</h2>
            <div className="qr-card-code" role="img" aria-label={`رمز QR لقائمة ${name}`} dangerouslySetInnerHTML={{ __html: svg }} />
            <p>امسح الرمز لعرض القائمة</p>
            <small dir="ltr">{link.replace(/^https?:\/\//, '')}</small>
          </div>
        ))}
      </div>
    </>
  );
}
