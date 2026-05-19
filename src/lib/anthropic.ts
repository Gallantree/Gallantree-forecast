import Anthropic from "@anthropic-ai/sdk";

// Sonnet 4.6 is a good fit for high-quality structured generation: strong on
// schema adherence with materially cheaper output tokens than Opus, and 64K
// output tokens which is plenty for our largest seed (250 loan records).
export const SEED_MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.development.local to enable the Seed feature.",
    );
  }
  _client ??= new Anthropic();
  return _client;
}

export interface ToolDef<TInput> {
  name: string;
  description: string;
  input_schema: object;
  // Type-narrowing helper. Throws if the parsed input doesn't match.
  parse: (input: unknown) => TInput;
}

/**
 * Single-shot tool-use call. Claude is forced to emit one call to `tool` and
 * we return its `input` validated through the tool's `parse` function. The
 * static `systemPrompt` is cached (5-minute ephemeral) so repeat seeds within
 * a short window pay only ~0.1× on the cached prefix.
 *
 * Uses streaming because seed outputs can exceed the non-streaming HTTP
 * timeout (~16K tokens) — the loan-book tool returns up to ~50K tokens.
 */
export async function generateStructured<TInput>(opts: {
  systemPrompt: string;
  tool: ToolDef<TInput>;
  userMessage: string;
  maxTokens?: number;
}): Promise<TInput> {
  const client = getClient();
  const stream = client.messages.stream({
    model: SEED_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: [
      {
        type: "text",
        text: opts.systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: opts.tool.name,
        description: opts.tool.description,
        input_schema: opts.tool.input_schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.tool.name },
    messages: [{ role: "user", content: opts.userMessage }],
  });
  const message = await stream.finalMessage();
  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === opts.tool.name,
  );
  if (!toolUse) {
    throw new Error(
      `Claude did not call the expected tool "${opts.tool.name}". Stop reason: ${message.stop_reason}`,
    );
  }
  return opts.tool.parse(toolUse.input);
}
