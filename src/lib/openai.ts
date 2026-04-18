import OpenAI from "openai";

export function createOpenAIClient(apiKey?: string) {
  const key = apiKey || process.env.OPENAI_API_KEY;

  if (!key) {
    throw new Error("OpenAI API key is required. Set OPENAI_API_KEY in the environment.");
  }

  return new OpenAI({ apiKey: key });
}
