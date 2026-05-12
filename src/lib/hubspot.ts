const BASE = "https://api.hubapi.com";

export class HubSpotError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`HubSpot ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

function token(): string {
  const t = process.env.HUBSPOT_TOKEN;
  if (!t) throw new Error("HUBSPOT_TOKEN is not set in .env");
  return t;
}

async function call<T>(path: string, init?: RequestInit, retries = 3): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    if (res.status === 429 || res.status >= 500) {
      const backoff = 500 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new HubSpotError(res.status, body);
    }
    return (await res.json()) as T;
  }
  throw new Error(`HubSpot request failed after ${retries} retries: ${path}`);
}

export async function pingDeals(): Promise<{ ok: true }> {
  // Cheapest endpoint that exercises the deals scope and works for both
  // Private App tokens and Service Keys (no /account-info dependency).
  await call("/crm/v3/objects/deals?limit=1");
  return { ok: true };
}


export type DealPropertyMeta = {
  name: string;
  label?: string;
  type: string;
  fieldType: string;
  groupName?: string;
  description?: string;
};
export async function listDealProperties(): Promise<DealPropertyMeta[]> {
  const data = await call<{ results: DealPropertyMeta[] }>("/crm/v3/properties/deals");
  return data.results;
}

export type DealPipeline = {
  id: string;
  label: string;
  displayOrder: number;
  stages: Array<{ id: string; label: string; displayOrder: number; metadata: Record<string, string> }>;
};
export async function listDealPipelines(): Promise<DealPipeline[]> {
  const data = await call<{ results: DealPipeline[] }>("/crm/v3/pipelines/deals");
  return data.results;
}

type Owner = {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  archived?: boolean;
};
export async function* iterateOwners(): AsyncGenerator<Owner> {
  // Pull both active and archived owners — HubSpot deals can reference owners
  // who've left the company, and we still need them for historical attribution.
  for (const archived of ["false", "true"]) {
    let after: string | undefined;
    while (true) {
      const qs = new URLSearchParams({ limit: "100", archived });
      if (after) qs.set("after", after);
      const data = await call<{
        results: Owner[];
        paging?: { next?: { after: string } };
      }>(`/crm/v3/owners?${qs.toString()}`);
      for (const o of data.results) yield { ...o, archived: archived === "true" };
      after = data.paging?.next?.after;
      if (!after) break;
    }
  }
}

export type DealRecord = {
  id: string;
  properties: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
};

// HubSpot returns datetime properties as ISO 8601 strings. Older / different
// endpoints sometimes return ms epoch as a numeric string. Accept both.
function hsTimestampMs(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return n;
  const d = Date.parse(v);
  return Number.isFinite(d) ? d : 0;
}

export async function countDeals(sinceMs = 0): Promise<number> {
  const data = await call<{ total: number }>(
    "/crm/v3/objects/deals/search",
    {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              { propertyName: "hs_lastmodifieddate", operator: "GTE", value: String(sinceMs) },
            ],
          },
        ],
        properties: ["dealname"],
        limit: 1,
      }),
    }
  );
  return data.total;
}

export async function* iterateDeals(opts: {
  properties: string[];
  sinceMs?: number;
}): AsyncGenerator<DealRecord> {
  let watermark = opts.sinceMs ?? 0;
  // HubSpot's search endpoint hard-caps at 10,000 results per query (and errors
  // on after >= 10000). To get past that, we sort ASCENDING by
  // hs_lastmodifieddate, page until we approach the cap, then re-issue with a
  // new GTE watermark anchored at the most recently seen timestamp. We also
  // dedupe by id so deals at the boundary timestamp aren't yielded twice.
  const yieldedIds = new Set<string>();
  while (true) {
    let after: string | undefined;
    let lastSeenAt = watermark;
    let countThisRound = 0;
    let newThisRound = 0;
    let exhausted = false;
    while (true) {
      const body = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "hs_lastmodifieddate",
                operator: "GTE",
                value: String(watermark),
              },
            ],
          },
        ],
        sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }],
        properties: opts.properties,
        limit: 100,
        after,
      };
      const data = await call<{
        results: DealRecord[];
        paging?: { next?: { after: string } };
        total: number;
      }>("/crm/v3/objects/deals/search", {
        method: "POST",
        body: JSON.stringify(body),
      });
      for (const d of data.results) {
        countThisRound++;
        const ts = hsTimestampMs(d.properties.hs_lastmodifieddate);
        if (ts > lastSeenAt) lastSeenAt = ts;
        if (yieldedIds.has(d.id)) continue;
        yieldedIds.add(d.id);
        newThisRound++;
        yield d;
      }
      after = data.paging?.next?.after;
      if (!after) {
        // No more pages from HubSpot at this watermark.
        exhausted = true;
        break;
      }
      // Stay safely below the 10k cap (after=10000 errors out).
      if (countThisRound >= 9500) break;
    }
    // Decide whether to continue with a new watermark.
    if (lastSeenAt > watermark) {
      // Use lastSeenAt itself (not +1) so deals at the boundary timestamp
      // aren't dropped if there are ties; dedupe protects against re-yield.
      watermark = lastSeenAt;
    } else if (exhausted || newThisRound === 0) {
      return;
    } else {
      // Watermark stuck (all ties at one ts) but we got new deals — fall
      // through and retry once; if still stuck, we'll exit next round.
    }
    if (exhausted && newThisRound === 0) return;
  }
}
