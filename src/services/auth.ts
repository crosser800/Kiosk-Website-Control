import { supabase } from '../lib/supabase';

type AdminAccountRow = {
  auth_user_id: string;
  role: 'admin' | 'super_admin';
  status: 'Active' | 'Inactive';
};

export async function signInAdmin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    throw new Error(error?.message ?? 'Invalid credentials.');
  }

  const { data: admin, error: adminError } = await supabase
    .from('admin_accounts')
    .select('auth_user_id, role, status')
    .eq('auth_user_id', data.user.id)
    .single<AdminAccountRow>();

  if (adminError || !admin) {
    await supabase.auth.signOut();
    throw new Error('This account is not authorized for admin access.');
  }

  if (admin.status !== 'Active') {
    await supabase.auth.signOut();
    throw new Error('This admin account is inactive.');
  }

  if (admin.role !== 'admin' && admin.role !== 'super_admin') {
    await supabase.auth.signOut();
    throw new Error('This account role is not allowed.');
  }

  return admin;
}

export async function signOutAdmin() {
  await supabase.auth.signOut();
}
