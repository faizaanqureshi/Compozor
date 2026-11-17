// One-shot SSE reader for a POST response body (EventSource only does GET,
// and lib/sse.ts reconnects, which a single answer must not do).
/** Reads "data: <json>" frames off a fetch body until it ends. */
export async function readEventStream<T>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        let event: T;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        onEvent(event);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

