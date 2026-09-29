import { VoiceLabClient } from './client.js';

export interface Model {
  id: string;
  object: 'model';
  name?: string;
  description?: string;
  parameters?: number;
  context_window?: number;
  owned_by: string;
  created: number;
  pricing: {
    version: string;
    model: string;
    input_usd_cents_per_million_tokens: number;
    output_usd_cents_per_million_tokens: number;
    credits_per_usd: number;
  };
  limits: {
    max_input_bytes: number;
    max_output_tokens: number;
  };
}

export interface ModelsResponse {
  object: 'list';
  data: Model[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface FunctionDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  stream_options?: { include_usage: boolean };
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  seed?: number;
  n?: number;
  tools?: FunctionDefinition[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  parallel_tool_calls?: boolean;
  thinking?: boolean;
  reasoning?: { enabled: boolean; effort?: string };
  reasoning_effort?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: ToolCall[];
      reasoning_content?: string;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: { cached_tokens: number };
    completion_tokens_details?: { reasoning_tokens: number };
  } | null;
}

export interface LLMRequestStatus {
  id: string;
  model: string;
  status: 'running' | 'completed' | 'failed' | 'usage_pending' | 'waived';
  reserved_credits: number;
  charged_credits: number | null;
  credit_units: number | null;
  credit_unit_scale: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cached_tokens: number | null;
  reasoning_tokens: number | null;
  elapsed_ms: number | null;
  ttft_ms: number | null;
  price_version: string;
  created_at: string;
  failure_code?: string;
  resolution_required?: boolean;
}

export class LLMModule {
  constructor(private client: VoiceLabClient) {}

  async listModels(): Promise<ModelsResponse> {
    return this.client.request<ModelsResponse>('GET', '/v1/models');
  }

  async createChatCompletion(
    request: ChatCompletionRequest,
    idempotencyKey: string
  ): Promise<ChatCompletionResponse> {
    return this.client.request<ChatCompletionResponse>('POST', '/v1/chat/completions', {
      headers: { 'Idempotency-Key': idempotencyKey },
      body: request,
    });
  }

  async getRequest(requestId: string): Promise<LLMRequestStatus> {
    return this.client.request<LLMRequestStatus>('GET', `/v1/llm/requests/${requestId}`);
  }
}
