// Lightweight debug wrapper. Use VIVLIO_DEBUG env var to enable verbose logs in development.
const ENABLED = typeof process !== 'undefined' && (process.env && process.env.VIVLIO_DEBUG === '1');

export function dbg(...args: any[]) {
  try {
    if (ENABLED) {
      // eslint-disable-next-line no-console
      console.debug(...args);
    }
  } catch (e) { /* ignore */ }
}

export default { dbg };
