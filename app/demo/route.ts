import { redirect } from "next/navigation";

// One public destination for every demo CTA. Booking never creates an app account.
export function GET() {
  redirect("https://cal.com/faizaan-qureshi/30min");
}
