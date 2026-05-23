import { connectToDatabase } from "@/lib/db";
import { Organisation, User } from "@/models";
import { AddOrganisationModal } from "../_components/AddOrganisationModal";
import { EditOrganisationModal } from "../_components/EditOrganisationModal";

export const dynamic = "force-dynamic";

function fmtDate(d?: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function OrganisationsPage() {
  await connectToDatabase();
  const orgs = await Organisation.find({})
    .select("name status notes createdAt")
    .sort({ createdAt: -1 })
    .lean<
      Array<{
        _id: { toString: () => string };
        name: string;
        status: string;
        notes?: string;
        createdAt?: Date;
      }>
    >();

  // Member count per organisation.
  const counts = await User.aggregate<{ _id: string; count: number }>([
    { $match: { organisationId: { $ne: null } } },
    { $group: { _id: "$organisationId", count: { $sum: 1 } } },
  ]);
  const countByOrg = new Map<string, number>();
  for (const c of counts) countByOrg.set(String(c._id), c.count);

  return (
    <div className="px-8 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Organisations</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Customer / tenant organisations on the platform.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500">
            {orgs.length} organisation{orgs.length === 1 ? "" : "s"}
          </span>
          <AddOrganisationModal />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
            <tr>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th>Members</Th>
              <Th>Notes</Th>
              <Th>Created</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {orgs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-500">
                  No organisations yet.
                </td>
              </tr>
            ) : (
              orgs.map((o) => {
                const id = o._id.toString();
                return (
                  <tr
                    key={id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-yellow-50/40"
                  >
                    <Td className="font-semibold text-zinc-900">{o.name}</Td>
                    <Td>
                      <Badge tone={statusTone(o.status)}>{o.status.toUpperCase()}</Badge>
                    </Td>
                    <Td className="tabular-nums text-zinc-700">{countByOrg.get(id) ?? 0}</Td>
                    <Td className="text-zinc-500">{o.notes || "—"}</Td>
                    <Td className="text-zinc-500">{fmtDate(o.createdAt)}</Td>
                    <Td className="text-right">
                      <EditOrganisationModal
                        org={{ _id: id, name: o.name, status: o.status, notes: o.notes }}
                      />
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusTone(s: string): "green" | "amber" | "zinc" {
  if (s === "active") return "green";
  if (s === "pending") return "amber";
  return "zinc";
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "amber" | "zinc";
}) {
  const styles: Record<typeof tone, string> = {
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    zinc: "bg-zinc-100 text-zinc-700",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[tone]}`}
    >
      {children}
    </span>
  );
}
