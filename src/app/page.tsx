import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/current-user';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  redirect(user.role === 'super_admin' ? '/admin' : '/dashboard');
}
