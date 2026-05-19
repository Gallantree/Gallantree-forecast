import Image from "next/image";
import Link from "next/link";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

type Params = {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
};

export default async function LoginPage({ searchParams }: Params) {
  const { error } = await searchParams;
  const googleEnabled = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
  );

  return (
    <main className="flex min-h-screen flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-8 py-4">
        <Link href="/" className="inline-flex items-center" aria-label="Gallantree">
          <Image
            src="/gallantree-logo.png"
            alt="Gallantree"
            width={1356}
            height={216}
            priority
            className="h-7 w-auto"
          />
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {error ? (
            <div className="mb-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              Sign-in failed. Please try again or contact your administrator.
            </div>
          ) : null}
          <LoginForm googleEnabled={googleEnabled} />
        </div>
      </div>
    </main>
  );
}
