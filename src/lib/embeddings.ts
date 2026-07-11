import "server-only";

// Embeddings for RAG. Uses OpenAI text-embedding-3-small (1536 dims, ~1-2 cents
// per million tokens). Optional: if OPENAI_API_KEY isn't set, the app falls back
// to injecting the raw knowledge base, so nothing breaks.
const KEY = process.env.OPENAI_API_KEY;
const MODEL = "text-embedding-3-small";

export function embeddingsConfigured(): boolean {
  return !!KEY;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!KEY) throw new Error("OPENAI_API_KEY is not set");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`embeddings failed (HTTP ${res.status}): ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

// Split text into overlapping chunks for embedding. Overlap keeps context that
// straddles a boundary retrievable.
export function chunkText(text: string, size = 900, overlap = 150): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  const step = Math.max(1, size - overlap);
  for (let i = 0; i < clean.length; i += step) {
    const piece = clean.slice(i, i + size).trim();
    if (piece) chunks.push(piece);
    if (i + size >= clean.length) break;
  }
  return chunks.slice(0, 200); // safety cap
}

// pgvector accepts the JSON array text form "[0.1,0.2,...]" as a vector literal.
export function toVectorLiteral(vec: number[]): string {
  return JSON.stringify(vec);
}
