export function createHeartbeat({ url = '', fetchImpl = fetch } = {}) {
  return {
    async ping(status = 'ok') {
      if (!url) return false;
      try {
        await fetchImpl(url, { method: 'POST', body: status, signal: AbortSignal.timeout(10_000) });
        return true;
      } catch {
        return false;
      }
    },
  };
}
