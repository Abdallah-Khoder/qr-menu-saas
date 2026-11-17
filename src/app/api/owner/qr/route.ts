import { appUrl } from '@/lib/app-url';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { qrDownload } from '@/lib/qr-download';

export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get('format');
  return qrDownload(getDb(), await getCurrentUser(), format, appUrl());
}
