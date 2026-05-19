import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Params = {
  searchParams: Promise<{ email?: string }>;
};

export default async function VerifyRequestPage({ searchParams }: Params) {
  const { email } = await searchParams;
  const display = email?.trim() ?? "your inbox";

  return (
    <main className="flex min-h-screen flex-col bg-white">
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
        <div className="w-full max-w-md text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-sky-100 text-indigo-950">
            <EnvelopeIcon />
          </div>

          <h1 className="mt-6 text-3xl font-bold tracking-tight text-zinc-900">Check your email</h1>

          <p className="mt-3 text-sm text-zinc-600">
            We&apos;ve sent a sign-in link to{" "}
            <span className="font-semibold text-zinc-900">{display}</span>. The link expires in 60
            minutes. Click the link in your inbox to continue.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="text-xs text-zinc-500">
              Didn&apos;t receive the email? Check your spam folder or contact your administrator.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-zinc-700 hover:text-zinc-900"
            >
              <span>←</span>
              <span>Use a different email</span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function EnvelopeIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
