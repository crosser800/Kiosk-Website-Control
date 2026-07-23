import { supabase } from '../lib/supabase';

export type AdminDepartment = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sort_order: number;
};

type AdminDepartmentRow = {
  id: string;
  code: string | null;
  name: string | null;
  description: string | null;
  sort_order: number | null;
};

function mapDepartmentRow(row: AdminDepartmentRow): AdminDepartment {
  return {
    id: String(row.id),
    code: String(row.code ?? '').trim(),
    name: String(row.name ?? '').trim(),
    description: row.description,
    sort_order: Number(row.sort_order ?? 0),
  };
}

export async function loadAdminDepartments(): Promise<AdminDepartment[]> {
  const { data, error } = await supabase
    .from('admin_departments')
    .select('id, code, name, description, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Unable to load admin departments: ${error.message}`);
  }

  return ((data ?? []) as AdminDepartmentRow[])
    .map(mapDepartmentRow)
    .filter((department) => department.id && department.name);
}
