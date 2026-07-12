// Frankfurter (frankfurter.dev) is a free, no-API-key exchange rate service
// backed by the European Central Bank's daily reference rates - no signup,
// no rate limit documented, and CORS-enabled, so it's fetched directly from
// the browser rather than proxied through our own backend (this is public
// FX data, not anything tenant-specific).
const FX_ENDPOINT = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=CAD";

export async function fetchUsdToCadRate(): Promise<number> {
  const res = await fetch(FX_ENDPOINT);
  if (!res.ok) throw new Error(`FX rate fetch failed: ${res.status}`);
  const data = (await res.json()) as { rates: { CAD: number } };
  return data.rates.CAD;
}
