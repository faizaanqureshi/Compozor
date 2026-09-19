/** Reconnecting authenticated SSE transport with abortable backoff. */
export function subscribeSSE(
  url: string,
  getToken: () => Promise<string | null>,
  onEvent: (event: Record<string, unknown>) => void,
  onError?: (error: unknown) => void,
  onConnect?: () => void,
): () => void {
  const controller = new AbortController();
  const delay = (ms: number) => new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    controller.signal.addEventListener("abort", done, { once: true });
    if (controller.signal.aborted) done();
  });
  void (async () => {
    let failures = 0;
    while (!controller.signal.aborted) {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const token = await getToken();
        if (controller.signal.aborted) return;
        const response = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Stream connection failed (${response.status})`);
        onConnect?.();
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let match: RegExpExecArray | null;
          while ((match = /\r?\n\r?\n/.exec(buffer))) {
            const frame = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
            if (!data) continue;
            let event: Record<string, unknown>;
            try { event = JSON.parse(data); } catch { continue; }
            failures = 0;
            try { onEvent(event); } catch (error) { onError?.(error); }
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) onError?.(error);
      } finally {
        await reader?.cancel().catch(() => {});
        reader?.releaseLock();
      }
      if (!controller.signal.aborted) {
        await delay(Math.min(30000, 1000 * 2 ** Math.min(failures++, 5)) + Math.random() * 250);
      }
    }
  })();
  return () => controller.abort();
}
