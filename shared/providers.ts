// Where the built-in chat can get a model from. All of these speak the
// OpenAI-style chat completions API with tool calls; model names are fetched
// from the provider (or typed), never hard-coded here, because they change.

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  /** Where the user gets an API key. */
  keyUrl?: string;
  /** Runs on this computer: no key needed. */
  local?: boolean;
}

export const PROVIDERS: Provider[] = [
  { id: 'xai', name: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai' },
  { id: 'openai', name: 'OpenAI (GPT)', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'openrouter', name: 'OpenRouter (Claude, Gemini, Llama, …)', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'ollama', name: 'Ollama (on this computer)', baseUrl: 'http://localhost:11434/v1', local: true },
  { id: 'custom', name: 'Other (OpenAI-compatible URL)', baseUrl: '' },
];

export const providerById = (id: string): Provider => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1];
