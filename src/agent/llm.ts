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

/** The reply hit max_tokens — usually the model looping on the same nodes. The harness retries with a nudge. */
export class TruncatedOutputError extends Error {
  constructor(readonly partial: string) { super("model output was truncated (token limit)"); this.name = "TruncatedOutputError"; }
}

export interface DeepSeekConfig { apiKey?: string; baseUrl?: string; model?: string; thinking?: boolean }

/** DeepSeek exposes an OpenAI-compatible API; V4.1 Flash is the id "deepseek-flash". */
export function createDeepSeekClient(cfg: DeepSeekConfig | NodeJS.ProcessEnv = process.env): LLMClient {
  const c: DeepSeekConfig = "DEEPSEEK_API_KEY" in cfg || "PATH" in cfg
    ? { apiKey: (cfg as NodeJS.ProcessEnv).DEEPSEEK_API_KEY, baseUrl: (cfg as NodeJS.ProcessEnv).DEEPSEEK_BASE_URL, model: (cfg as NodeJS.ProcessEnv).DEEPSEEK_MODEL, thinking: (cfg as NodeJS.ProcessEnv).DEEPSEEK_THINKING === "1" }
    : (cfg as DeepSeekConfig);
  const apiKey = c.apiKey;
  if (!apiKey) throw new Error("DeepSeek API key is not set (Admin → Integrations or DEEPSEEK_API_KEY)");
  const client = new OpenAI({ apiKey, baseURL: c.baseUrl || "https://api.deepseek.com" });
  const model = c.model || "deepseek-flash";
  return {
    model,
    async complete(messages, opts = {}) {
      // DeepSeek V4.x "thinking" mode can spend its whole token budget reasoning
      // about geometry and return empty content; the harness supplies the
      // verification loop instead, so we run the model in direct (non-thinking)
      // mode. Opt back in with DEEPSEEK_THINKING=1.
      const thinking = c.thinking ? "enabled" : "disabled";
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
      if (choice?.finish_reason === "length") throw new TruncatedOutputError(choice.message?.content ?? "");
      return choice?.message?.content ?? "";
    },
  };
}
