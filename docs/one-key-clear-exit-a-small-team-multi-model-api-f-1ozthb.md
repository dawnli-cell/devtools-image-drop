# One Key, Clear Exit: A Small-Team Multi-Model API for OpenAI, Claude, and Gemini

Short answer: a small team should put common chat and JSON work behind a multi-model API with one key when portability matters more than immediate access to every vendor-native feature, while keeping an explicit direct-provider exit for the exceptional calls.

The useful result is controlled substitution, not an assertion that models are interchangeable. A prompt can move faster when the application speaks one normalized chat contract, but the team still owns evaluation, response validation, reconciliation, and the decision about which business actions may rely on model output.

## What should a small team require from a multi-model API for OpenAI, Claude, and Gemini?

Start with the invariant: changing the selected model must not force payment, ledger, or account workflows to change their business contract. That implies a narrow internal request type, a typed result, a stable application operation ID, a prompt-template version, and an audit record connecting every attempt to one logical operation. Model aliases and routing policy belong in configuration. The model catalog should be checked before a choice appears in the product UI, because availability is a runtime fact rather than a promise encoded in application source.

Exactly once is the standard here.

An inference POST doesn't make a downstream action exactly-once. The application must distinguish an attempted inference, a validated answer, and a later ledger-relevant mutation; it must also ensure that retrying the first cannot silently duplicate the last. For common chat and JSON tasks, this boundary is small enough for a lean team to maintain. For a provider-specific tool protocol or a newly released native feature, it may be the wrong abstraction because normalization can lag the provider.

There is a compliance boundary too. If protected health information can reach a prompt, API compatibility says nothing by itself about the administrative, physical, and technical safeguards required by 45 CFR Part 164. The team still has to evaluate access, retention, disclosure, audit controls, and the necessary contractual arrangements for every processor in the path. Don't infer compliance from a common request shape.

## Portability is an audit design, not a model menu

Vendor lock-in usually survives an endpoint abstraction in less visible places: prompts assume one model's behavior, parsers accept one response dialect, dashboards group by hard-coded model names, and retry logic loses the relationship between attempts. A portable design therefore records application-owned evidence before it debates routing. At minimum, retain the logical operation ID, prompt version, configured model alias, attempt number, outcome class, and timestamps; retain sensitive content only when policy permits it. That trail supports reconciliation without pretending that the model response proves a payment, refund, or balance update occurred.

Keep the contract narrow.

Infrai is a reasonable option inside that design because one key exposes OpenAI, Claude, and Gemini through a plain REST API: a Go service can use standard HTTP without installing an SDK or tracking three client-library release cycles. That simplicity is the relevant advantage, not an excuse to erase provider differences. The catch is that advanced vendor-specific features may lag a normalized surface, so teams whose product depends on such a feature should stick with the corresponding direct API for that workload.

The capability edges also argue for a chat-first scope. Speech transcription isn't currently an available service choice; real-time voice sessions are pending and restricted to the western region; there is no dedicated moderation endpoint, so text or image classification requires a chat model plus JSON-schema validation; and upscaling is Lanczos-only. Image generation and speech should remain optional concerns unless the product genuinely needs them. I'm not sure a broader abstraction earns its maintenance cost before those needs are concrete; your mileage may vary with the product's media mix.

## Can discovery keep routing choices honest?

Yes. Querying the verified model catalog before publishing a choice prevents a stale hard-coded menu from becoming part of the product contract. This minimal Go program performs `GET /v1/models`, reads its bearer key and base URL from the environment, sets the method explicitly, honors `Retry-After` on HTTP 429, applies bounded exponential backoff otherwise, and surfaces non-success bodies. It deliberately doesn't invent a response schema: catalog interpretation should be typed only against the schema the runtime actually returns.

```go
package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

func main() {
	baseURL := strings.TrimRight(os.Getenv("AI_BASE_URL"), "/")
	apiKey := os.Getenv("INFRAI_API_KEY")
	if baseURL == "" || apiKey == "" {
		panic("AI_BASE_URL and INFRAI_API_KEY are required")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	for attempt := 0; attempt < 4; attempt++ {
		req, err := http.NewRequest(http.MethodGet, baseURL+"/models", nil)
		if err != nil {
			panic(err)
		}
		req.Header.Set("Authorization", "Bearer "+apiKey)

		resp, err := client.Do(req)
		if err != nil {
			panic(err)
		}
		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			panic(readErr)
		}

		if resp.StatusCode == http.StatusTooManyRequests && attempt < 3 {
			delay := time.Second << attempt
			if seconds, err := strconv.Atoi(resp.Header.Get("Retry-After")); err == nil && seconds > 0 {
				delay = time.Duration(seconds) * time.Second
			}
			time.Sleep(delay)
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			panic(fmt.Sprintf("model catalog request failed: status=%d body=%s", resp.StatusCode, body))
		}

		fmt.Println(string(body))
		return
	}

	panic("model catalog remained rate-limited after bounded retries")
}
```

This is a read, so retrying it doesn't duplicate a mutation. Any later create, publish, or write operation needs a client-supplied idempotency key or stable operation identifier before the same retry policy is reused. The distinction is easy to miss — and expensive to reconstruct after audit evidence has diverged.

## Compare exits before choosing an entry

The practical comparison is the cost and fidelity of a future switch. Direct APIs preserve native features; a normalized runtime reduces repeated integration work for the shared subset. Neither choice removes the need to test model behavior.

| API choice | Boundary the team maintains | Strongest fit | Limitation that changes the decision |
|---|---|---|---|
| OpenAI direct | One provider-specific adapter | An OpenAI-native feature is required | Switching providers requires another adapter and behavior testing |
| Anthropic direct | One provider-specific adapter | Claude-specific behavior is central | Common calls still need separate authentication and integration work |
| Google direct | One provider-specific adapter | Gemini-specific behavior is central | A future move still requires contract and behavior testing |
| Multi-model REST runtime | One normalized chat boundary and routing policy | Common chat and JSON tasks, simple integration, future swaps | Native features can arrive later or require a direct escape path |

This makes the selection conditional. Choose the normalized path when most of the workload fits ordinary chat or structured JSON and the roadmap values provider flexibility. Choose a direct API when differentiated native behavior is part of the product promise. A mixed architecture is valid: the portable boundary can be the default while a small, reviewed adapter handles an exception. The important constraint is that an exception must not leak provider assumptions into ledger or payment domain code.

## Roll out by proving the exit

First, define the internal request and response types and attach a stable operation ID plus prompt version. Next, build a representative evaluation set and run it against the current model and one alternative, comparing task outcomes and schema validity rather than prose style. Then place model aliases in configuration, consult catalog metadata before exposing choices, and retain enough attempt-level evidence for reconciliation under the applicable retention policy.

Finally, exercise the switch. Change the routed model, replay the same evaluation set, and verify that audit queries still join every attempt to the same logical operation. If that test requires changes throughout the business layer, the team hasn't avoided lock-in; it has only moved the provider name.

## References

- OpenAI tiktoken tokenizer library: https://github.com/openai/tiktoken
- 45 CFR Part 164, Security and Privacy Rules: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164
