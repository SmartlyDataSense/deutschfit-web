import { getServerClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { requireOperator } from "@/lib/auth/requireOperator";
import { listSubscriptions } from "@/lib/admin/subscriptionQueries";
import { toCsv, todayIsoDate } from "@/lib/csv";

export const dynamic = "force-dynamic";

const CSV_COLUMNS = [
  "id",
  "user_id",
  "user_email",
  "plan_code",
  "plan_name",
  "status",
  "payment_method",
  "payment_ref",
  "amount_xaf",
  "valid_from",
  "valid_until",
  "created_at",
  "assigned_by",
  "assigned_by_email",
] as const;

function rangeIsoBoundary(value: string | null, kind: "from" | "to"): string | undefined {
  if (!value) return undefined;
  return kind === "from" ? `${value}T00:00:00Z` : `${value}T23:59:59Z`;
}

export async function GET(req: Request) {
  const sb = await getServerClient();
  // requireOperator throws notFound() on miss; let that propagate so anon
  // callers see a generic 404 page rather than a CSV download error.
  await requireOperator(sb);

  const url = new URL(req.url);
  const sp = url.searchParams;

  const svc = getServiceClient();

  const rows: Record<string, unknown>[] = [];
  const pageSize = 200;
  // Cap aggregate export at 10k rows. v1 cohort sizes don't get close, but
  // we still want a hard ceiling so a slipped filter can't blow up memory.
  const maxRows = 10_000;

  for (let page = 1; rows.length < maxRows; page += 1) {
    const result = await listSubscriptions(svc, {
      status: sp.get("status") ?? undefined,
      payment_method: sp.get("method") ?? undefined,
      plan: sp.get("plan") ?? undefined,
      q: sp.get("q") ?? undefined,
      from: rangeIsoBoundary(sp.get("from"), "from"),
      to: rangeIsoBoundary(sp.get("to"), "to"),
      page,
      pageSize,
    });
    rows.push(...result.rows);
    if (result.rows.length < pageSize || rows.length >= result.total) break;
    if (page > 100) break; // belt-and-suspenders
  }

  if (!rows.length && sp.toString() === "") {
    // Empty export with no filters means there really are no subs — still
    // return a CSV with just the header so the consumer's pipeline doesn't
    // choke on an empty body.
  }

  const csv = toCsv(rows, [...CSV_COLUMNS]);

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="subscriptions-${todayIsoDate()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
