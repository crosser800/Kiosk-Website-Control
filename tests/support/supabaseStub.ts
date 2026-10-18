// Test stand-in for src/lib/supabase.ts (see hooks.mjs). Tests install a fake
// client with setSupabaseFake; nothing here can reach a real database.
type FakeClient = {
  from: (table: string) => unknown;
  rpc?: (fn: string, args: Record<string, unknown>) => unknown;
};

let fake: FakeClient | null = null;

export function setSupabaseFake(next: FakeClient | null) {
  fake = next;
}

export const supabase = {
  from(table: string) {
    if (!fake) {
      throw new Error(`No fake Supabase client installed (query on ${table}).`);
    }
    return fake.from(table);
  },
  rpc(fn: string, args: Record<string, unknown>) {
    if (!fake?.rpc) {
      throw new Error(`No fake Supabase rpc installed (call to ${fn}).`);
    }
    return fake.rpc(fn, args);
  },
};
