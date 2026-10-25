import OpenAI from "openai";

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "assistant"; content: string }
  | { role: "user"; content: string | ContentPart[] };

export interface LLMClient {
  complete(messages: ChatMessage[], opts?: { json?: boolean; maxTokens?: number }): Promise<string>;
  readonly model: string;
}

/** DeepSeek exposes an OpenAI-compatible API; V4.1 Flash is the id "deepseek-flash". */
export function createDeepSeekClient(env = process.env): LLMClient {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");
  const client = new OpenAI({ apiKey, baseURL: env.DEEPSEEK_BASE_URL || "https://api.deepseek.com" });
  const model = env.DEEPSEEK_MODEL || "deepseek-flash";
  return {
    model,
    async complete(messages, opts = {}) {
      // DeepSeek V4.x "thinking" mode can spend its whole token budget reasoning
      // about geometry and return empty content; the harness supplies the
      // verification loop instead, so we run the model in direct (non-thinking)
      // mode. Opt back in with DEEPSEEK_THINKING=1.
      const thinking = env.DEEPSEEK_THINKING === "1" ? "enabled" : "disabled";
      const res = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.3,
        max_tokens: opts.maxTokens ?? 16000,
        ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
        // Vendor extension, passed through by the OpenAI SDK.
        ...({ thinking: { type: thinking } } as object),
      });
      const choice = res.choices[0];
      if (choice?.finish_reason === "length") throw new Error("model output was truncated (token limit)");
      return choice?.message?.content ?? "";
    },
  };
}
