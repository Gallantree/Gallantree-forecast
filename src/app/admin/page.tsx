import Link from "next/link";
import { connectToDatabase } from "@/lib/db";
import { User, Organisation } from "@/models";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await connectToDatabase();
  const [userCount, activeUsers, orgCount, pendingUsers] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ status: "active" }),
    Organisation.countDocuments({}),
    User.countDocuments({ status: "pending" }),
  ]);

  return (
    <div className="px-8 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Overview</h1>
      <p className="mt-1 text-sm text-zinc-500">Platform-wide health and counts.</p>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-4">
        <Tile label="Users" value={userCount} sub={`${activeUsers} active`} href="/admin/users" />
        <Tile label="Organisations" value={orgCount} href="/admin/organisations" />
        <Tile label="Pending invites" value={pendingUsers} />
        <Tile label="Modules" value="—" sub="Coming soon" />
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  href?: string;
}) {
  const body = (
    <div className="flex h-full flex-col gap-1 bg-white px-5 py-4">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="text-2xl font-semibold tabular-nums text-zinc-900">{value}</span>
      {sub ? <span className="text-xs text-zinc-500">{sub}</span> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:bg-zinc-50">
      {body}
    </Link>
  ) : (
    body
  );
}
