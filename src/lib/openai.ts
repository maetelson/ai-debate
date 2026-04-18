import OpenAI from "openai";

export function createOpenAIClient(apiKey?: string) {
  const key = apiKey || process.env.OPENAI_API_KEY;

  if (!key) {
    throw new Error("OpenAI API key is required. Provide one in the form or set OPENAI_API_KEY.");
  }

  return new OpenAI({ apiKey: key });
}
