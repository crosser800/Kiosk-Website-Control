// Test stand-in for CSS modules (see hooks.mjs): styles.someClass === 'someClass'.
const styles: Record<string, string> = new Proxy(
  {},
  { get: (_target, property) => (typeof property === 'string' ? property : '') },
);

export default styles;
