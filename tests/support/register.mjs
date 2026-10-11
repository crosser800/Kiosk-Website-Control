// Loaded with `node --import` by `npm test`. Lets tests import app modules
// that use Vite-style extensionless imports, and swaps src/lib/supabase.ts
// (which needs Vite env vars and a live project) for an in-memory stub.
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
