"use client";

import { useRef, useState, useTransition } from "react";
import { type UpdateUserPayload, updateUser } from "../_actions";

interface OrgOption {
  _id: string;
  name: string;
}

interface UserRow {
  _id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  userType: string;
  status: string;
  designation?: string;
  organisationId?: string;
  membershipRole?: string;
  mobileCountry?: string;
  mobileNumber?: string;
}

const USER_TYPES: { value: UpdateUserPayload["userType"]; label: string }[] = [
  { value: "admin", label: "admin" },
  { value: "superadmin", label: "superadmin" },
  { value: "viewer", label: "viewer" },
];
const STATUSES: { value: UpdateUserPayload["status"]; label: string }[] = [
  { value: "active", label: "active" },
  { value: "pending", label: "pending" },
  { value: "disabled", label: "disabled" },
];

export function EditUserModal({ user, orgs }: { user: UserRow; orgs: OrgOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const [userType, setUserType] = useState<UpdateUserPayload["userType"]>(
    user.userType as UpdateUserPayload["userType"],
  );
  const [designation, setDesignation] = useState(user.designation ?? "");
  const [organisationId, setOrganisationId] = useState(user.organisationId ?? "");
  const [membershipRole, setMembershipRole] = useState<"admin" | "member">(
    (user.membershipRole as "admin" | "member") ?? "member",
  );
  const [status, setStatus] = useState<UpdateUserPayload["status"]>(
    user.status as UpdateUserPayload["status"],
  );

  function show() {
    setError(null);
    setOpen(true);
    requestAnimationFrame(() => ref.current?.showModal());
  }
  function hide() {
    ref.current?.close();
    setOpen(false);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await updateUser(user._id, {
        firstName,
        lastName,
        userType,
        designation,
        organisationId: organisationId || undefined,
        membershipRole,
        status,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to update user");
        return;
      }
      hide();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="rounded px-2 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        title="Edit user"
      >
        Edit
      </button>
      {open && (
        <dialog
          ref={ref}
          onClose={() => setOpen(false)}
          className="w-[600px] max-w-[92vw] rounded-lg border border-zinc-200 p-0 shadow-xl backdrop:bg-zinc-900/40"
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-zinc-900">Edit user</h2>
              <p className="mt-0.5 text-xs text-zinc-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={hide}
              className="grid h-7 w-7 place-items-center rounded-md border border-zinc-300 text-zinc-500 hover:bg-zinc-100"
            >
              ×
            </button>
          </div>

          <div className="flex flex-col gap-5 px-6 py-5 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First name">
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                />
              </Field>
              <Field label="Last name">
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                />
              </Field>
              <Field label="User type">
                <select
                  value={userType}
                  onChange={(e) => setUserType(e.target.value as UpdateUserPayload["userType"])}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                >
                  {USER_TYPES.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Designation">
                <input
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Compliance Officer"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                />
              </Field>
              <Field label="Status">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as UpdateUserPayload["status"])}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Organisation">
                <select
                  value={organisationId}
                  onChange={(e) => setOrganisationId(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-3 py-2"
                >
                  <option value="">None</option>
                  {orgs.map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Membership role">
                <select
                  value={membershipRole}
                  onChange={(e) => setMembershipRole(e.target.value as "admin" | "member")}
                  disabled={!organisationId}
                  className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 disabled:text-zinc-400"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
              </Field>
            </div>

            {error ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-6 py-4">
            <button
              type="button"
              onClick={hide}
              disabled={pending}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-zinc-900">{label}</span>
      {children}
    </label>
  );
}
