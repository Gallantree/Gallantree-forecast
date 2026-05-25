import { Types } from "mongoose";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import type { ILoginActivity, IUser } from "@/models";
import { LoginActivity, Organisation, User } from "@/models";

export const dynamic = "force-dynamic";

function fmtDateTime(d?: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(d?: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type Params = { params: Promise<{ id: string }> };

export default async function UserDetailPage({ params }: Params) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  await connectToDatabase();
  const user =
    await User.findById(id).lean<
      Pick<
        IUser,
        | "_id"
        | "firstName"
        | "lastName"
        | "name"
        | "email"
        | "mobile"
        | "userType"
        | "designation"
        | "organisationId"
        | "membershipRole"
        | "status"
        | "lastLogin"
        | "createdAt"
        | "updatedAt"
      >
    >();
  if (!user) notFound();

  const [org, activity] = await Promise.all([
    user.organisationId
      ? Organisation.findById(user.organisationId).select("name").lean<{ name: string }>()
      : Promise.resolve(null),
    LoginActivity.find({ email: user.email.toLowerCase() })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean<ILoginActivity[]>(),
  ]);

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || user.email;

  const mobile = user.mobile?.number
    ? `${user.mobile.country ?? ""} ${user.mobile.number}`.trim()
    : "—";

  const details: Array<[string, React.ReactNode]> = [
    ["Full name", displayName],
    ["First name", user.firstName || "—"],
    ["Last name", user.lastName || "—"],
    ["Email", user.email],
    ["Mobile", mobile],
    [
      "User type",
      <Badge key="ut" tone={userTypeTone(user.userType)}>
        {user.userType.toUpperCase()}
      </Badge>,
    ],
    [
      "Status",
      <Badge key="st" tone={statusTone(user.status)}>
        {user.status.toUpperCase()}
      </Badge>,
    ],
    ["Designation", user.designation || "—"],
    ["Organisation", org?.name || "—"],
    ["Membership role", user.membershipRole || "—"],
    ["Last login", fmtDateTime(user.lastLogin)],
    ["Created", fmtDate(user.createdAt)],
    ["Updated", fmtDate(user.updatedAt)],
  ];

  return (
    <div className="px-8 py-8">
      <div className="mb-4">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900"
        >
          <span aria-hidden>←</span>
          <span>Back to users</span>
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">{displayName}</h1>
          <p className="mt-1 text-sm text-zinc-500">{user.email}</p>
        </div>
      </div>

      <section className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Basic details
        </div>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <tbody>
              {details.map(([label, value]) => (
                <tr key={label} className="border-b border-zinc-100 last:border-b-0">
                  <th className="w-1/3 bg-zinc-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    {label}
                  </th>
                  <td className="px-4 py-2.5 text-zinc-800">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Login activity
          </div>
          <div className="text-xs text-zinc-500">
            {activity.length === 0
              ? "No activity"
              : `Showing last ${activity.length} event${activity.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
              <tr>
                <Th>When</Th>
                <Th>Method</Th>
                <Th>Outcome</Th>
                <Th>Browser</Th>
                <Th>OS</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {activity.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-500">
                    No sign-in attempts recorded yet.
                  </td>
                </tr>
              ) : (
                activity.map((a) => (
                  <tr
                    key={String(a._id)}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50/60"
                  >
                    <Td className="text-zinc-700">{fmtDateTime(a.createdAt)}</Td>
                    <Td>
                      <Badge tone="zinc">{a.method.toUpperCase()}</Badge>
                    </Td>
                    <Td>
                      {a.outcome === "success" ? (
                        <Badge tone="green">SUCCESS</Badge>
                      ) : (
                        <span className="inline-flex flex-col gap-0.5">
                          <Badge tone="rose">FAILED</Badge>
                          {a.reason ? (
                            <span className="text-[11px] text-zinc-500">{a.reason}</span>
                          ) : null}
                        </span>
                      )}
                    </Td>
                    <Td className="text-zinc-700">{a.browser || "—"}</Td>
                    <Td className="text-zinc-700">{a.os || "—"}</Td>
                    <Td className="font-mono text-xs text-zinc-600">{a.ip || "—"}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider">
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
  tone: "purple" | "blue" | "green" | "amber" | "rose" | "zinc";
}) {
  const styles: Record<typeof tone, string> = {
    purple: "bg-purple-100 text-purple-800",
    blue: "bg-sky-100 text-sky-800",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    rose: "bg-rose-100 text-rose-800",
    zinc: "bg-zinc-100 text-zinc-700",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles[tone]}`}
    >
      {children}
    </span>
  );
}
