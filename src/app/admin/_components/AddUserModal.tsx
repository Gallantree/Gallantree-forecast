"use client";

import { useRef, useState, useTransition } from "react";
import { createUser, type CreateUserPayload } from "../_actions";

interface OrgOption {
  _id: string;
  name: string;
}

const USER_TYPES: { value: CreateUserPayload["userType"]; label: string }[] = [
  { value: "admin", label: "admin" },
  { value: "superadmin", label: "superadmin" },
  { value: "viewer", label: "viewer" },
];
const STATUSES: { value: CreateUserPayload["status"]; label: string }[] = [
  { value: "active", label: "active" },
  { value: "pending", label: "pending" },
  { value: "disabled", label: "disabled" },
];

export function AddUserModal({ orgs }: { orgs: OrgOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileCountry, setMobileCountry] = useState("+61");
  const [mobileNumber, setMobileNumber] = useState("");
  const [userType, setUserType] = useState<CreateUserPayload["userType"]>("admin");
  const [designation, setDesignation] = useState("");
  const [organisationId, setOrganisationId] = useState("");
  const [membershipRole, setMembershipRole] = useState<"admin" | "member">("admin");
  const [status, setStatus] = useState<CreateUserPayload["status"]>("active");

  function show() {
    setError(null);
    setOpen(true);
    requestAnimationFrame(() => ref.current?.showModal());
  }
  function hide() {
    ref.current?.close();
    setOpen(false);
  }

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setMobileNumber("");
    setUserType("admin");
    setDesignation("");
    setOrganisationId("");
    setMembershipRole("admin");
    setStatus("active");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createUser({
        firstName,
        lastName,
        email,
        mobileCountry,
        mobileNumber,
        userType,
        designation,
        organisationId: organisationId || undefined,
        membershipRole,
        status,
      });
      if (!res.ok) {
        setError(res.error ?? "Failed to create user");
        return;
      }
      reset();
      hide();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
      >
        <span className="text-base leading-none">+</span>
        Add user
      </button>
      {open && (
        <dialog
          ref={ref}
          onClose={() => setOpen(false)}
          className="w-[640px] max-w-[92vw] rounded-lg border border-zinc-200 p-0 shadow-xl backdrop:bg-zinc-900/40"
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
            <h2 className="text-base font-semibold tracking-tight text-zinc-900">
              Add user
            </h2>
            <button
              type="button"
              onClick={hide}
              className="grid h-7 w-7 place-items-center rounded-md border border-zinc-300 text-zinc-500 hover:bg-zinc-100"
            >
              ×
            </button>
          </div>

          <div className="flex flex-col gap-6 px-6 py-5 text-sm">
            <section>
              <div className="mb-3 text-xs font-semibold text-zinc-500">
                Personal details
              </div>
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
                <Field label="Email" required>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  />
                </Field>
                <Field label="Mobile">
                  <div className="flex gap-2">
                    <select
                      value={mobileCountry}
                      onChange={(e) => setMobileCountry(e.target.value)}
                      className="rounded-md border border-zinc-300 px-2 py-2"
                    >
                      <option value="+61">AUS +61</option>
                      <option value="+64">NZ +64</option>
                      <option value="+1">US +1</option>
                      <option value="+44">UK +44</option>
                    </select>
                    <input
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="450140100"
                      className="flex-1 rounded-md border border-zinc-300 px-3 py-2"
                    />
                  </div>
                </Field>
              </div>
            </section>

            <section className="border-t border-zinc-200 pt-5">
              <div className="mb-3 text-xs font-semibold text-zinc-500">Role</div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="User type" required>
                  <select
                    value={userType}
                    onChange={(e) =>
                      setUserType(e.target.value as CreateUserPayload["userType"])
                    }
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
              </div>
            </section>

            <section className="border-t border-zinc-200 pt-5">
              <div className="mb-3 text-xs font-semibold text-zinc-500">
                Organisation
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Organisation" hint="Assign the user to an organisation">
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
                    onChange={(e) =>
                      setMembershipRole(e.target.value as "admin" | "member")
                    }
                    disabled={!organisationId}
                    className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 disabled:text-zinc-400"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                </Field>
              </div>
              <div className="mt-4">
                <Field label="Status">
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as CreateUserPayload["status"])
                    }
                    className="w-full rounded-md border border-zinc-300 px-3 py-2"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>

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
              disabled={pending || !email}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "Creating…" : "Create"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-zinc-900">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </span>
      {hint ? (
        <span className="text-[11px] text-zinc-500 -mt-0.5">{hint}</span>
      ) : null}
      {children}
    </label>
  );
}
