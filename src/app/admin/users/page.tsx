import { connectToDatabase } from "@/lib/db";
import { Organisation, User } from "@/models";
import { AddUserModal } from "../_components/AddUserModal";
import { EditUserModal } from "../_components/EditUserModal";
import { UserRow } from "./_components/UserRow";

export const dynamic = "force-dynamic";

interface UserRowData {
  _id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  userType: string;
  status: string;
  designation?: string;
  organisationId?: string;
  membershipRole?: string;
  lastLogin?: string;
  createdAt?: string;
}

interface OrgOption {
  _id: string;
  name: string;
}

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

export default async function UsersPage() {
  await connectToDatabase();
  const [usersRaw, orgsRaw] = await Promise.all([
    User.find({})
      .select(
        "firstName lastName name email userType status designation organisationId membershipRole lastLogin createdAt",
      )
      .sort({ createdAt: -1 })
      .lean<
        Array<{
          _id: { toString: () => string };
          firstName?: string;
          lastName?: string;
          name?: string;
          email: string;
          userType: string;
          status: string;
          designation?: string;
          organisationId?: { toString: () => string };
          membershipRole?: string;
          lastLogin?: Date;
          createdAt?: Date;
        }>
      >(),
    Organisation.find({})
      .select("name")
      .sort({ name: 1 })
      .lean<Array<{ _id: { toString: () => string }; name: string }>>(),
  ]);

  const users: UserRowData[] = usersRaw.map((u) => ({
    _id: u._id.toString(),
    name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    userType: u.userType,
    status: u.status,
    designation: u.designation,
    organisationId: u.organisationId?.toString(),
    membershipRole: u.membershipRole,
    lastLogin: u.lastLogin ? u.lastLogin.toISOString() : undefined,
    createdAt: u.createdAt ? u.createdAt.toISOString() : undefined,
  }));

  const orgs: OrgOption[] = orgsRaw.map((o) => ({
    _id: o._id.toString(),
    name: o.name,
  }));

  return (
    <div className="px-8 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Users</h1>
          <p className="mt-1 text-sm text-zinc-500">All platform users.</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-zinc-500">
            {users.length} user{users.length === 1 ? "" : "s"}
          </span>
          <AddUserModal orgs={orgs} />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>User type</Th>
              <Th>Status</Th>
              <Th>Last login</Th>
              <Th>Created</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-zinc-500">
                  No users yet. Add your first one.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <UserRow key={u._id} userId={u._id}>
                  <Td className="font-semibold text-zinc-900">{u.name}</Td>
                  <Td className="text-zinc-700">{u.email}</Td>
                  <Td>
                    <Badge tone={userTypeTone(u.userType)}>{u.userType.toUpperCase()}</Badge>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(u.status)}>{u.status.toUpperCase()}</Badge>
                  </Td>
                  <Td className="text-zinc-500">{fmtDate(u.lastLogin)}</Td>
                  <Td className="text-zinc-500">{fmtDate(u.createdAt)}</Td>
                  <Td className="text-right" noRowNav>
                    <EditUserModal user={u} orgs={orgs} />
                  </Td>
                </UserRow>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function userTypeTone(t: string): "purple" | "blue" | "zinc" {
  if (t === "superadmin") return "purple";
  if (t === "admin") return "blue";
  return "zinc";
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

function Td({
  children,
  className = "",
  noRowNav,
}: {
  children: React.ReactNode;
  className?: string;
  noRowNav?: boolean;
}) {
  return (
    <td className={`px-4 py-3 ${className}`} data-no-row-nav={noRowNav ? "" : undefined}>
      {children}
    </td>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "purple" | "blue" | "green" | "amber" | "zinc";
}) {
  const styles: Record<typeof tone, string> = {
    purple: "bg-purple-100 text-purple-800",
    blue: "bg-sky-100 text-sky-800",
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
