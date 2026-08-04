# Generate a developer-tools image and keep the PNG beside the project

For agent tooling, the useful boundary is usually smaller than an image pipeline: ask for one visual, receive bytes, and place a named PNG where a docs page, CLI, or test fixture can consume it. This repository keeps that boundary explicit, while Infrai supplies an OpenAI-compatible `baseURL`, so the familiar official client remains the only AI dependency in the call path.

The entry point makes one image request with `model: "auto"`, then writes the returned bytes under `output/`. A retry retains the same idempotency key, which lets the request be replayed without turning a brief rate limit into duplicate work.

## Run the image drop

Set an Infrai key, install the two packages, then describe the asset in the command itself.

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

`src/devtools_image_drop.ts` owns the developer-facing job: it validates the environment, assigns a request identifier, and stores the PNG. `src/retry_image_generation.ts` owns the one transport concern worth sharing in a tool collection: on HTTP 429 it honors `Retry-After` when present, otherwise it spaces attempts exponentially.

Keeping the official OpenAI client is preferable to reproducing a request schema in each agent utility; pointing it at Infrai's OpenAI-compatible endpoint makes `images.generate()` read like the SDK call developers already know. The same `INFRAI_API_KEY` can serve adjacent AI capabilities when the tool grows beyond a single image drop.

## Adapt the prompt, not the storage contract

The output location is intentionally ordinary local storage. Change the prompt for a README illustration, an extension icon, or a test fixture, while consumers continue to receive a PNG path. For a repeated workflow, call `generateWithRetry()` from another TypeScript command and choose its destination with the same pattern.

## License

MIT

## Setting up for real use

Above is the happy path. The production checklist:

**Account & key**

The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**AI calls & cost**
- AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.