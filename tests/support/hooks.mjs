import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const supabaseStubUrl = new URL('./supabaseStub.ts', import.meta.url).href;
const hasExtension = /\.(?:[cm]?[jt]sx?|json)$/;

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  if (isRelative && context.parentURL?.startsWith('file:') && !hasExtension.test(specifier)) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      if (candidate.pathname.endsWith('/src/lib/supabase.ts')) {
        return { url: supabaseStubUrl, shortCircuit: true };
      }
      return { url: candidate.href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
