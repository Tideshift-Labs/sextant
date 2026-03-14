import { config } from '../config.ts';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

interface OllamaEmbedResponse {
  embeddings: number[][];
}

async function callOllamaEmbed(inputs: string[]): Promise<number[][]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${config.ollamaUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.embeddingModel,
          input: inputs,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as OllamaEmbedResponse;
      return data.embeddings;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await Bun.sleep(delay);
      }
    }
  }

  throw lastError;
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function embedTexts(texts: string[], isQuery = false): Promise<number[][]> {
  const instruction = isQuery ? config.queryInstruction : config.indexInstruction;
  const prefixedTexts = texts.map((t) => instruction + t);

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < prefixedTexts.length; i += config.embeddingBatchSize) {
    const batch = prefixedTexts.slice(i, i + config.embeddingBatchSize);
    try {
      const embeddings = await callOllamaEmbed(batch);
      allEmbeddings.push(...embeddings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('Failed')) {
        throw new Error(
          `Ollama is not reachable at ${config.ollamaUrl}. Ensure Ollama is running with '${config.embeddingModel}' model pulled (run: ollama pull ${config.embeddingModel}).`
        );
      }
      throw err;
    }
  }

  return allEmbeddings;
}

export async function embedQuery(query: string): Promise<number[]> {
  const results = await embedTexts([query], true);
  return results[0]!;
}
