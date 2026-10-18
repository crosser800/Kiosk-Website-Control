import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const supabaseStubUrl = new URL('./supabaseStub.ts', import.meta.url).href;
const cssModuleStubUrl = new URL('./cssModuleStub.ts', import.meta.url).href;
const hasExtension = /\.(?:[cm]?[jt]sx?|json)$/;

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  // Components import Vite CSS modules; tests get class name === key.
  if (isRelative && specifier.endsWith('.module.css')) {
    return { url: cssModuleStubUrl, shortCircuit: true };
  }
  if (isRelative && context.parentURL?.startsWith('file:') && !hasExtension.test(specifier)) {
    for (const extension of ['.ts', '.tsx']) {
      const candidate = new URL(`${specifier}${extension}`, context.parentURL);
      if (!existsSync(fileURLToPath(candidate))) continue;
      if (candidate.pathname.endsWith('/src/lib/supabase.ts')) {
        return { url: supabaseStubUrl, shortCircuit: true };
      }
      return { url: candidate.href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

// Node strips TypeScript types but cannot parse JSX, so .tsx components are
// transpiled with the project's TypeScript (react-jsx runtime) for tests.
export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.tsx')) {
    const fileName = fileURLToPath(url);
    const { outputText } = ts.transpileModule(readFileSync(fileName, 'utf8'), {
      fileName,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
