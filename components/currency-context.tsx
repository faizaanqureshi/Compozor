"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import useSWR from "swr";
import { fetchUsdToCadRate } from "@/lib/currency";

export type CurrencyCode = "USD" | "CAD";

interface CurrencyContextValue {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  // 1 USD in the selected currency - always 1 for USD itself, otherwise the
  // live rate (undefined while the first fetch is in flight).
  rate: number | undefined;
  rateError: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  // ECB rates only update once a day on weekdays - a hour-long dedupe avoids
  // re-fetching on every admin page/tab visit for a number that hasn't moved.
  const { data: cadRate, error } = useSWR("usd-to-cad-rate", fetchUsdToCadRate, {
    dedupingInterval: 60 * 60 * 1000,
    revalidateOnFocus: false,
  });

  const rate = currency === "USD" ? 1 : cadRate;

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, rate, rateError: !!error }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
