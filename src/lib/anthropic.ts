import Anthropic from "@anthropic-ai/sdk";

// Haiku 4.5 handles structured generation for loan / program seeds well —
// the schemas are tight (tool-use ensures JSON conformance) and individual
// records are short, so Sonnet's extra reasoning headroom is unnecessary.
// ~5× cheaper input / ~3× cheaper output than Sonnet 4.6 with comparable
// schema adherence on this workload. 200K context window is plenty given
// each seed call returns at most a few hundred loan rows.
export const SEED_MODEL = "claude-haiku-4-5";

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
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === opts.tool.name,
  );
  if (!toolUse) {
    throw new Error(
      `Claude did not call the expected tool "${opts.tool.name}". Stop reason: ${message.stop_reason}`,
    );
  }
  return opts.tool.parse(toolUse.input);
}
