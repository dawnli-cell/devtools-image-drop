import OpenAI from "openai";

const MAX_ATTEMPTS = 3;

function retryDelay(error: unknown, attempt: number): number {
  if (error instanceof OpenAI.APIError && error.status === 429) {
    const retryAfter = error.headers?.get("retry-after");
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  }
  return 500 * 2 ** attempt;
}

function isRateLimit(error: unknown): boolean {
  return error instanceof OpenAI.APIError && error.status === 429;
}

export async function generateWithRetry(
  client: OpenAI,
  prompt: string,
  requestId: string,
) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await client.images.generate(
        {
          model: "auto",
          prompt,
          size: "1024x1024",
          n: 1,
          response_format: "b64_json",
        },
        { headers: { "Idempotency-Key": requestId } },
      );
    } catch (error) {
      if (!isRateLimit(error) || attempt === MAX_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, retryDelay(error, attempt)));
    }
  }
  throw new Error("Image generation did not produce a response.");
}
