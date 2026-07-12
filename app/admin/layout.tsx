import { CurrencyProvider } from "@/components/currency-context";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <CurrencyProvider>{children}</CurrencyProvider>;
}
