import { SignIn } from "@clerk/nextjs";
import { AuroraBackground } from "@/components/aurora-background";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;

  return (
    <div className="fixed inset-0 isolate overflow-hidden bg-background">
      <AuroraBackground />
      <div className="relative flex h-full items-center justify-center">
        <SignIn forceRedirectUrl={redirect_url} />
      </div>
    </div>
  );
}
