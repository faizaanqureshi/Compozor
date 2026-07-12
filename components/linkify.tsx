const URL_PATTERN = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

// Splits on bare URLs and renders them as clickable links, leaving
// everything else as plain text - used for email content, which often
// contains raw https:// links that plain-text rendering wouldn't linkify.
export function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        // split() with a capturing group puts matched URLs at odd indices.
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-accent"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}
