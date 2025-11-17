// Jest setup for DOM
// console.info = (...args) => { /* silence noisy dev markers in tests */ };

// Polyfill btoa/atob for Node test environment
if (typeof (global as any).btoa === 'undefined') {
  (global as any).btoa = (str: string) => Buffer.from(str, 'utf8').toString('base64');
}
if (typeof (global as any).atob === 'undefined') {
  (global as any).atob = (b64: string) => Buffer.from(b64, 'base64').toString('utf8');
}

// Suppress verbose info logs from plugin during tests except errors
const origInfo = console.info;
console.info = (...args: any[]) => {
  if (/(VIVLIO_DEV)/.test(args[0])) return; // skip plugin diagnostics
  origInfo(...args);
};
