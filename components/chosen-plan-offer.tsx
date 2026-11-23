"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChosenPlan } from "@/lib/chosen-plan";
import { PLANS } from "@/lib/pricing";

// End of onboarding, when the visitor picked a plan on the pricing page:
// pay for it now, or start with the free trial.
export function ChosenPlanOffer({
  offer,
  busy,
  error,
  onClose,
  onTrial,
  onPay,
}: {
  offer: ChosenPlan | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onTrial: () => void;
  onPay: (choice: ChosenPlan) => void;
}) {
  const plan = offer ? PLANS.find((p) => p.name.toLowerCase() === offer.plan) : null;
  const price = plan?.price && offer ? plan.price[offer.currency === "USD" ? "usd" : "cad"] : null;
  return (
    <Dialog open={offer !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start {plan?.name ?? "your plan"} now?</DialogTitle>
          <DialogDescription>
            You picked {plan?.name}
            {price ? ` at ${price} a month` : ""}. Pay now, or use your 14-day free trial first and choose a plan
            anytime in Settings.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onTrial}>
            Start free trial
          </Button>
          <Button disabled={busy} onClick={() => offer && onPay(offer)}>
            {busy && <Loader2 className="animate-spin" />}
            Pay now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
