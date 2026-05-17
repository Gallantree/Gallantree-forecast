import Link from "next/link";
import { connectToDatabase } from "@/lib/db";
import { Scenario } from "@/models";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function createScenario(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await connectToDatabase();
  const s = await Scenario.create({ name });
  revalidatePath("/");
  redirect(`/scenarios/${s._id.toString()}`);
}

export default async function Home() {
  await connectToDatabase();
  const scenarios = await Scenario.find({}).sort({ updatedAt: -1 }).lean();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 font-sans">
      <h1 className="text-2xl font-semibold tracking-tight">Gallantree Forecast</h1>
      <p className="mt-1 text-sm text-zinc-600">Driver-based 5-year scenarios.</p>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-zinc-700">New scenario</h2>
        <form action={createScenario} className="mt-2 flex gap-2">
          <input
            type="text"
            name="name"
            required
            placeholder="Base FY27"
            className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            Create
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-zinc-700">Scenarios</h2>
        {scenarios.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">None yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200">
            {scenarios.map((s) => (
              <li key={String(s._id)} className="px-4 py-3">
                <Link
                  href={`/scenarios/${String(s._id)}`}
                  className="text-sm font-medium text-zinc-900 hover:underline"
                >
                  {s.name}
                </Link>
                <span className="ml-2 text-xs text-zinc-500">{s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
