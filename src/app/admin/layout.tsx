import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models";
import type { IUser } from "@/models";

export const dynamic = "force-dynamic";

async function logout() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin");

  await connectToDatabase();
  const me = await User.findOne({ email: session.user.email })
    .select("firstName lastName name email userType")
    .lean<Pick<IUser, "firstName" | "lastName" | "name" | "email" | "userType">>();

  const displayName =
    [me?.firstName, me?.lastName].filter(Boolean).join(" ") ||
    me?.name ||
    me?.email ||
    "User";
  const initials = displayName
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const userType = me?.userType ?? "viewer";

  return (
    <div className="flex h-screen flex-col bg-zinc-50 font-sans">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-8 py-3">
        <Link href="/admin" className="inline-flex items-center" aria-label="Gallantree">
          <Image
            src="/gallantree-logo.png"
            alt="Gallantree"
            width={1356}
            height={216}
            priority
            className="h-6 w-auto"
          />
        </Link>
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-200 text-[11px] font-semibold text-zinc-700">
            {initials}
          </span>
          <span className="text-sm font-medium text-zinc-800">
            {displayName}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Log out
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-64 shrink-0 border-r border-zinc-200 bg-white px-3 py-4">
          <div className="mb-3 flex items-center gap-2 px-2">
            <span className="text-sm font-semibold tracking-tight text-zinc-900">
              Admin
            </span>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-700">
              {userType}
            </span>
          </div>
          <ul className="flex flex-col gap-0.5">
            <NavLink href="/admin" label="Overview" icon="□" />
            <NavLink href="/admin/organisations" label="Organisations" icon="◫" />
            <NavLink href="/admin/users" label="Users" icon="👥" />
          </ul>
        </nav>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
      >
        <span className="grid h-4 w-4 place-items-center text-xs text-zinc-500">
          {icon}
        </span>
        <span>{label}</span>
      </Link>
    </li>
  );
}
