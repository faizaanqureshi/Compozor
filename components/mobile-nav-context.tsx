"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface MobileNavContextValue {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <MobileNavContext.Provider value={{ mobileOpen, setMobileOpen }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("useMobileNav must be used within MobileNavProvider");
  return ctx;
}
