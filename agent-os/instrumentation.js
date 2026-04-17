export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startBackgroundJobWorker } = await import('./lib/backgroundQueue.js');
    startBackgroundJobWorker();
  }
}
