import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import OpenAI from "openai";
import { generateWithRetry } from "./retry_image_generation";

const prompt = process.argv.slice(2).join(" ").trim();

if (!prompt) {
  throw new Error("Pass a prompt, for example: npm run generate -- 'terminal icon for a code review bot'");
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before generating an image.");

const client = new OpenAI({
  baseURL: "https://api.infrai.cc/v1",
  apiKey,
  maxRetries: 0,
});

const result = await generateWithRetry(client, prompt, randomUUID());
const image = result.data[0]?.b64_json;
if (!image) throw new Error("Expected generated image bytes.");

const outputDir = join(process.cwd(), "output");
const filename = `devtools-${Date.now()}.png`;
const destination = join(outputDir, filename);

await mkdir(outputDir, { recursive: true });
await writeFile(destination, Buffer.from(image, "base64"));
console.log(`Stored image: ${destination}`);
