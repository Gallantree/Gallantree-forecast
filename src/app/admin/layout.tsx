import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import type { IUser } from "@/models";
import { User } from "@/models";

export const dynamic = "force-dynamic";

async function logout() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin");

  await connectToDatabase();
  const me = await User.findOne({ email: session.user.email })
    .select("firstName lastName name email userType")
    .lean<Pick<IUser, "firstName" | "lastName" | "name" | "email" | "userType">>();

  const displayName =
    [me?.firstName, me?.lastName].filter(Boolean).join(" ") || me?.name || me?.email || "User";
  const initials = displayName
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const userType = me?.userType ?? "viewer";
  if (userType !== "superadmin") redirect("/");

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
          <span className="text-sm font-medium text-zinc-800">{displayName}</span>
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
        <nav className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white px-3 py-4">
          <div className="mb-3 flex items-center gap-2 px-2">
            <span className="text-sm font-semibold tracking-tight text-zinc-900">Admin</span>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-700">
              {userType}
            </span>
          </div>
          <ul className="flex flex-col gap-0.5">
            <NavLink href="/admin" label="Overview" icon={<OverviewIcon />} />
            <NavLink
              href="/admin/organisations"
              label="Organisations"
              icon={<OrganisationsIcon />}
            />
            <NavLink href="/admin/users" label="Users" icon={<UsersIcon />} />
          </ul>
          <div className="mt-auto border-t border-zinc-200 pt-3">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            >
              ← Back to app
            </Link>
          </div>
        </nav>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
      >
        <span className="grid h-4 w-4 shrink-0 place-items-center text-zinc-500">{icon}</span>
        <span>{label}</span>
      </Link>
    </li>
  );
}

function iconProps() {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

function OverviewIcon() {
  return (
    <svg {...iconProps()}>
      <title>Overview</title>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function OrganisationsIcon() {
  return (
    <svg {...iconProps()}>
      <title>Organisations</title>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01" />
      <path d="M10 21v-3h4v3" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg {...iconProps()}>
      <title>Users</title>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
