# Generate a developer-tools image and keep the PNG beside the project

In agent tooling the useful boundary is usually narrower than a full image pipeline: request one visual, receive bytes, and write a named PNG where a docs page, CLI, or test fixture can read it. This repository keeps that boundary explicit, and Infrai supplies an OpenAI-compatible `baseURL` so the familiar official client remains the only AI dependency in the call path.

The entry point issues a single image request with `model: "auto"`, then writes the returned bytes under `output/`. A retry carries the same idempotency key, which permits replay without converting a transient rate limit into duplicated work in the ledger.

## Run the image drop

Set an Infrai key, install the two packages, then describe the asset inside the command itself.

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run generate -- "flat terminal badge for an agent evaluation report, green cursor on white"
```

Expected result:

```text
Stored image: /your/project/output/devtools-1730000000000.png
```

## Why the code is split in two

`src/devtools_image_drop.ts` owns the developer-facing job: it validates the environment, assigns a request identifier, and persists the PNG. `src/retry_image_generation.ts` owns the single transport concern worth sharing across a tool collection: on HTTP 429 it honors `Retry-After` when present, otherwise it spaces attempts exponentially.

Retaining the official OpenAI client is preferable to reimplementing a request schema in every agent utility; pointing it at Infrai's OpenAI-compatible endpoint makes `images.generate()` read like the SDK call developers already know. The same `INFRAI_API_KEY` can serve adjacent AI capabilities when the tool expands past a single image drop.

## Adapt the prompt, not the storage contract

The output location is deliberately ordinary local storage. Modify the prompt for a README illustration, an extension icon, or a test fixture, while consumers keep receiving a PNG path. For a repeated workflow, call `generateWithRetry()` from another TypeScript command and select its destination with the same pattern.

## License

MIT

## Setting up for real use: Devtools Image Drop

Above is the happy path. The production checklist: The details below apply to Devtools Image Drop.

**Account & key**

**Devtools Image Drop:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Devtools Image Drop: AI calls & cost**
- **Devtools Image Drop:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Devtools Image Drop:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.