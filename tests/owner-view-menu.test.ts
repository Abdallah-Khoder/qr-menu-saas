import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The "show me my menu" buttons of the owner's dashboard: the side bar (every page) and the home page.
const mocks = vi.hoisted(() => ({ restaurant: null as null | { id: string; name: string; public_slug: string; status: 'active' | 'suspended' } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ refresh() {} }) }));
vi.mock('../src/lib/current-user', () => ({ requireOwner: async () => ({ id: 'owner-1', email: 'owner@example.com', role: 'owner' }) }));
vi.mock('../src/lib/owner-page', () => ({ getMyRestaurant: async () => mocks.restaurant }));
import OwnerLayout from '../src/app/dashboard/layout';
import OwnerHome from '../src/app/dashboard/page';

const SLUG = 'shaar-crepe-k3x9qp7vtz';
const restaurant = (status: 'active' | 'suspended') => ({ id: 'r1', name: 'Shaar Crepe', public_slug: SLUG, status });
const layout = async () => renderToStaticMarkup(await OwnerLayout({ children: null }));
const home = async () => renderToStaticMarkup(await OwnerHome());

beforeEach(() => { vi.stubEnv('APP_URL', 'https://menu.example.com'); });

describe('the owner can open his own menu from the dashboard', () => {
  it('the side bar (so every dashboard page) has a button that opens HIS menu in a new tab', async () => {
    mocks.restaurant = restaurant('active');
    const html = await layout();
    expect(html).toContain(`<a class="btn view-menu" href="/m/${SLUG}" target="_blank" rel="noopener noreferrer">عرض قائمتي ↗</a>`);
  });
  it('the home page has the same button, next to the link and the QR code', async () => {
    mocks.restaurant = restaurant('active');
    const html = await home();
    expect(html).toContain(`<a class="btn" href="/m/${SLUG}" target="_blank" rel="noopener noreferrer">عرض قائمتي كما يراها الزبائن ↗</a>`);
  });
  it('a suspended restaurant has no such button (its menu is not shown to anyone), only the banner', async () => {
    mocks.restaurant = restaurant('suspended');
    const l = await layout();
    expect(l).not.toContain('view-menu');
    expect(l).not.toContain('href="/m/');
    expect(l).toContain('role="alert"');
    expect(await home()).not.toContain('target="_blank"');
  });
  it('an account without a restaurant gets no button either', async () => {
    mocks.restaurant = null;
    expect(await layout()).not.toContain('view-menu');
    expect(await home()).not.toContain('href="/m/');
  });
});
