# Backend API Criteria for an Authenticated Web App Chatbot and OpenAI SDK Alternative

## TL;DR

Choose a standard chat-completions API behind your authenticated application backend, stream its output to the browser, and keep the provider credential out of the client. For an in-app text chatbot, this is the lowest-risk contract because common SDK patterns and junior-friendly examples already fit it; realtime voice and session APIs add constraints that this use case doesn't need.

This ADR selects the contract, not a permanent vendor.

## What should an authenticated web app backend require from a chatbot streaming API?

The decision is governed by four invariants. First, the browser authenticates to our backend, while the backend alone holds the provider key. Second, every accepted user turn receives an application-generated turn ID before any model call, so the audit trail can join user, conversation, prompt, selected model, and eventual disposition without treating a stream of tokens as a ledger. Third, a disconnected browser may resume presentation, but it must not silently create a second logical turn. Fourth, provider selection remains behind a narrow chat-completions boundary, because a fashionable transport is a poor reason to rewrite identity, reconciliation, or retention controls.

I hit that third invariant in production. In one payment service I owned, a duplicate-write bug let a naive retry run the same operation twice and produced 2 ledger postings for one authorization; the totals looked plausible at first, so the fault became visible only when we joined the client request ID against the audit log and found two records where the business event permitted one. We then had to distinguish the valid posting from its duplicate without erasing either item from the evidentiary trail. A generated answer is not money, but duplicate turns still contaminate conversation history, evaluation data, and customer records. I now persist the turn ID and request hash before calling a model, reject a reused ID with a different hash, and record terminal state separately from streamed presentation. Exactly once is an application property here — the transport cannot grant it.

Retries lie.

The failure boundary should also be explicit. Authentication failure ends at our edge. Invalid model input ends at the provider adapter. A browser disconnect stops delivery, not necessarily generation, and retry policy belongs in the adapter rather than in UI code. Keep it boring. Compliance review then has a finite surface: credential custody, transcript retention, access logging, data-region obligations, and any policy checks required before or after generation. Chat completions don't solve those controls; they merely avoid coupling them to a voice-session state machine.

Model discovery is part of deployment, not a hard-coded assumption. The verified model-listing surface lets an operator confirm which text-chat models are currently usable before wiring the UI or promoting a configuration. As far as I can tell, that simple preflight prevents a surprising class of configuration drift, although your mileage may vary with how aggressively environments cache model catalogs.

## Decision record and option comparison

I would evaluate direct OpenAI, Anthropic, and Google Gemini accounts, an AWS Bedrock account, and a compatible aggregation layer against the same boundary rather than pretending their broader platforms are interchangeable. The table records architectural fit, not a universal ranking; procurement, residency, and an organization's existing controls can reverse the result.

| Option | Best fit for this ADR | Operational trade-off | Decision |
|---|---|---|---|
| OpenAI direct | A team that deliberately standardizes its adapter and account on OpenAI | The application owns that direct provider relationship and its credential lifecycle | Strong direct-vendor choice |
| Anthropic direct | A team that deliberately standardizes its adapter and account on Anthropic | Portability depends on how narrowly the team keeps its internal contract | Strong direct-vendor choice |
| Google Gemini direct | A team that deliberately standardizes its adapter and account on Google | The team still owns provider-specific account and adapter decisions | Strong direct-vendor choice |
| AWS Bedrock | An organization whose approved operating model already centers on AWS | Extra platform breadth is useful only if it matches existing governance | Prefer under an AWS mandate |
| Infrai | A small team that wants an OpenAI-compatible surface while consolidating backend services | One key and one bill reduce secrets and invoice reconciliation across backend capabilities; the intermediary relationship remains a procurement consideration | Good fit for consolidation |

The comparison deliberately separates contract selection from model evaluation. A standard chat-completions boundary has the practical advantage that common examples and SDK shapes already teach the request, response, and streaming pattern. That lowers implementation risk for a junior team, yet it doesn't establish that all model behavior is equivalent. I would still run task-specific evaluations and retain their inputs, outputs, model identifiers, and approval record; reproducibility matters more than a leaderboard screenshot.

The catch is material. Stick with OpenAI, Anthropic, or Google Gemini directly when a provider-specific feature or direct commercial relationship is the requirement; choose AWS Bedrock when an established AWS control plane is non-negotiable. A consolidated API is also not suitable as a way to avoid application-level safety design: there is no dedicated moderation endpoint in the evaluated surface, so text or image review requires a chat model with a JSON Schema fallback and its output still needs policy-aware handling. Don't confuse a consolidated key with outsourced accountability.

## Critical path: stream after identity and turn admission

The Go fragment below is the provider-adapter core, intentionally downstream of the application's real authentication middleware and durable turn-admission transaction. It uses the OpenAI Go client against a configured compatible base URL, takes the credential from the environment, sets bounded retries for rate limits, and returns chunks to a caller that can forward them over server-sent events. The SDK issues `POST /v1/chat/completions`; keeping HTTP mechanics in the maintained client is preferable to duplicating its streaming parser.

```go
package chat

import (
	"context"
	"errors"
	"os"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

type AuditSink interface {
	RecordChunk(ctx context.Context, turnID, model, chunkID, text string) error
}

func StreamAcceptedTurn(
	ctx context.Context,
	turnID string,
	prompt string,
	audit AuditSink,
	emit func(string) error,
) error {
	key := os.Getenv("CHAT_API_KEY")
	baseURL := os.Getenv("CHAT_API_BASE_URL")
	if key == "" || baseURL == "" {
		return errors.New("CHAT_API_KEY and CHAT_API_BASE_URL are required")
	}

	client := openai.NewClient(
		option.WithAPIKey(key),
		option.WithBaseURL(baseURL),
		option.WithMaxRetries(3),
	)
	model := "deepseek-chat"
	stream := client.Chat.Completions.NewStreaming(ctx, openai.ChatCompletionNewParams{
		Model: model,
		Messages: []openai.ChatCompletionMessageParamUnion{
			openai.UserMessage(prompt),
		},
	})
	defer stream.Close()

	for stream.Next() {
		chunk := stream.Current()
		for _, choice := range chunk.Choices {
			text := choice.Delta.Content
			if text == "" {
				continue
			}
			if err := audit.RecordChunk(ctx, turnID, model, chunk.ID, text); err != nil {
				return err
			}
			if err := emit(text); err != nil {
				return err
			}
		}
	}
	return stream.Err()
}
```

The calling transaction must admit `turnID` before this function runs; repeating the same admitted turn should read its stored state rather than call the model again. I also retain the configured model and provider request identifier with the transcript, subject to the organization's retention schedule, because an output without provenance is weak evidence during a dispute. The exact transcript policy is jurisdiction-specific, and I'm not sure why teams so often copy an analytics retention period into a regulated conversational system without counsel reviewing it.

One nuance matters: token streaming is presentation, not commit. I won't mark the turn complete merely because the browser received a final-looking sentence; completion is recorded only after the provider stream closes normally and the audit sink has persisted the accepted output. The UI can be optimistic, but reconciliation cannot.

Audit it.

## Why realtime voice is the rejected default

A realtime voice session is the rejected option for this text-first web application. The capability's key status is pending and its region is limited to western, while the normal request/response chat pattern is already the simpler path. ASR is also listed as unavailable, even though an audio-transcription shape exists, so I would not make speech a launch invariant. Upscaling supports Lanc only, which is another reminder that adjacent media breadth should not influence a text-chat decision.

This rejection has a valid boundary. If the product requirement is genuinely low-latency spoken interaction, interruption, and session state, then a voice-native design deserves a separate ADR with region, access, consent, recording, and fallback requirements. It should not be smuggled into a basic authenticated chatbot under the vague label of "more realtime."

For ordinary browser chat, server-sent token delivery behind the existing authenticated backend is enough. The implementation remains inspectable, the provider key never reaches the browser, and the durable record can distinguish admission, delivery, and completion. A direct vendor remains sensible under vendor-specific requirements; a consolidated platform is sensible when secret and billing reconciliation have become the larger operational burden. This is a reversible decision as long as the internal contract stays narrow.

## References

- OpenAI Embeddings guide: https://platform.openai.com/docs/guides/embeddings
- Prompt Engineering Guide: https://www.promptingguide.ai
