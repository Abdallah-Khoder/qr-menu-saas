import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import PreviewBar, { PreviewBarView } from '../src/components/PreviewBar';
import { isPreviewSearch, previewMenuPath } from '../src/lib/preview';

describe('the owner\'s preview of his own menu', () => {
  it('the dashboard link is the public menu with ?preview=1', () => {
    expect(previewMenuPath('shaar-crepe-k3x9qp7vtz')).toBe('/m/shaar-crepe-k3x9qp7vtz?preview=1');
  });
  it('only an address that asks for the preview shows the bar', () => {
    expect(isPreviewSearch('?preview=1')).toBe(true);
    expect(isPreviewSearch('preview=1')).toBe(true);
    expect(isPreviewSearch('?a=b&preview=1')).toBe(true);
    for (const search of ['', '?', '?preview=0', '?preview=', '?preview=1abc', '?preview=true', '?previews=1', '?x=preview=1']) {
      expect(isPreviewSearch(search), search).toBe(false);
    }
  });
  it('the server never draws the bar (a customer gets exactly the cached page); the browser adds it after it reads the address', () => {
    expect(renderToStaticMarkup(createElement(PreviewBar))).toBe('');
  });
  it('the bar leads back to the dashboard, and reads right to left even on an English menu', () => {
    const html = renderToStaticMarkup(createElement(PreviewBarView));
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('<a href="/dashboard">→ العودة إلى لوحة التحكم</a>');
    expect(html).toContain('هذه معاينة لقائمتك كما يراها الزبائن');
  });
});
