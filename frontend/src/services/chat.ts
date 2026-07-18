/**
 * Client side of the AI Chat Assistant (PROJECT_SPEC.md section 6). Just a
 * thin wrapper around the `chatAssistant` Cloud Function — see
 * functions/src/index.ts for why this can't be a direct client-to-Gemini
 * call (the API key would be exposed) and for how `context` is used.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

interface ChatRequest {
  message: string;
  context: Record<string, unknown>;
}

interface ChatResponse {
  reply: string;
}

const callChatAssistant = httpsCallable<ChatRequest, ChatResponse>(functions, 'chatAssistant');

export async function askAssistant(message: string, context: Record<string, unknown>): Promise<string> {
  const result = await callChatAssistant({ message, context });
  return result.data.reply;
}
