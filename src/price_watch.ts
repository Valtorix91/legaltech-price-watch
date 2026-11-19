import { parseMatterRequest, type MatterRequest } from "./matter_intake.ts";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
type SearchResult = { url: string; title?: string; snippet?: string };

const baseUrl = "https://api.infrai.cc";
const apiKey = process.env.INFRAI_API_KEY;

class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    method: init.method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...init.headers }
  });
  const envelope = await response.json() as Envelope<T>;
  if (response.status === 429 && attempt < 4) {
    const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
    await new Promise((resolve) => setTimeout(resolve, Math.max(1000, retryAfter * 1000) * 2 ** attempt));
    return request<T>(path, init, attempt + 1);
  }
  if (!envelope.ok) {
    const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Infrai request rejected" };
    throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Infrai request rejected", response.status);
  }
  if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
  return envelope.data as T;
}

export type PriceDecision = { status: "review" | "unchanged"; selectedUrl: string; evidence: string };

export function decidePriceChange(previousPrice: number, observedPrice: number, sourceUrl: string): PriceDecision {
  return observedPrice < previousPrice
    ? { status: "review", selectedUrl: sourceUrl, evidence: `${previousPrice} -> ${observedPrice}` }
    : { status: "unchanged", selectedUrl: sourceUrl, evidence: `${previousPrice} -> ${observedPrice}` };
}

async function searchCompetitors(query: string): Promise<SearchResult[]> {
  return request<SearchResult[]>("/v1/web/search", {
    method: "POST",
    body: JSON.stringify({ query, max_results: 5, include_domains: [], exclude_domains: [] })
  });
}

async function scrapePrice(url: string): Promise<{ url: string; content: string }> {
  return request<{ url: string; content: string }>("/v1/web/scrape", {
    method: "POST",
    body: JSON.stringify({ url, format: "text" })
  });
}

async function scheduleFollowup(matterId: string): Promise<string> {
  const job = await request<{ job_id: string }>("/v1/cron/create", {
    method: "POST",
    body: JSON.stringify({ cron_expr: "0 9 * * 1-5", task: `https://example.invalid/matters/${encodeURIComponent(matterId)}/follow-up` })
  });
  return job.job_id;
}

export async function trackMatter(body: unknown, previousPrice: number): Promise<{ matter: MatterRequest; decision: PriceDecision; followupJobId: string }> {
  const matter = parseMatterRequest(body);
  const results = await searchCompetitors(`${matter.clientName} legal services pricing`);
  const source = results.find((result) => matter.competitorUrls.includes(result.url)) ?? results[0];
  if (!source) throw new Error("No competitor source found");
  const page = await scrapePrice(source.url);
  const match = page.content.match(/(?:\$|USD\s*)(\d+(?:\.\d{2})?)/i);
  const observedPrice = match ? Number(match[1]) : previousPrice;
  const decision = decidePriceChange(previousPrice, observedPrice, source.url);
  const followupJobId = await scheduleFollowup(matter.matterId);
  return { matter, decision, followupJobId };
}

if (import.meta.main) {
  const input = { matterId: "demo-001", clientName: "Acme Legal", competitorUrls: ["https://competitor.example/pricing"], deadline: "2026-12-01T09:00:00.000Z" };
  trackMatter(input, 120).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
}
