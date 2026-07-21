/**
 * Cloud Functions for ACT To Go.
 *
 * This is the one place in the whole app that isn't fully serverless — see
 * CLAUDE.md for why: a paid LLM API key can't be shipped to the browser
 * (anyone could extract it from the bundle and run up the bill), so the
 * Gemini call has to happen server-side. Requires the Blaze plan; Spark
 * can't deploy Cloud Functions at all.
 *
 * Design: the CLIENT computes whatever role-appropriate data summary it
 * already has on screen (assigned bus, next stop, fleet overview — reusing
 * the same logic StudentMap/DriverPanel/AdminDashboard already have) and
 * sends it as `context` alongside the message. This function does NOT
 * recompute route projections or re-fetch the fleet itself — it only
 * (a) verifies the caller is signed in and has a role the assistant
 * supports, to pick the right persona, and (b) proxies the Gemini call so
 * the API key never reaches the browser. Trusting client-supplied context
 * is fine here: worst case a user feeds their own chat assistant a
 * misleading summary, which only misinforms themselves — nothing is
 * written and no other user's data is exposed.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

initializeApp();
const db = getFirestore();

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const MODEL_NAME = 'gemini-flash-latest'; // confirmed working against the real API — currently resolves to gemini-3.5-flash
const MAX_MESSAGE_LENGTH = 500;
const MAX_CONTEXT_JSON_LENGTH = 4000;

const GUARDRAIL =
  'Only use the live data given below to answer — if the answer isn\'t in ' +
  'it (traffic, exact schedules, anything not listed), say you don\'t have ' +
  'that information rather than guessing. Keep answers short: 2-4 sentences.';

const ROLE_PERSONAS: Record<string, string> = {
  student: `You are the AI Travel Assistant inside ACT To Go, the bus tracking app for ` +
    `Agni College of Technology. You help students and staff with questions about ` +
    `their assigned bus, its live location and ETA, and what to do if they miss it. ${GUARDRAIL}`,
  driver: `You are the AI Driver Assistant inside ACT To Go. You help the driver ` +
    `currently on a trip with quick questions: next stop, how many students are ` +
    `waiting, trip status. You do NOT have live traffic conditions or fuel-station ` +
    `locations — say so plainly if asked, don't guess. ${GUARDRAIL} The driver is ` +
    `driving, so keep it to 1-2 sentences.`,
  admin: `You are the AI Admin Assistant inside ACT To Go, helping the transport ` +
    `administrator at Agni College of Technology get a quick read on the fleet: ` +
    `buses needing service or with expiring documents, open incident/damage reports, ` +
    `driver status, fuel costs, overcrowded buses. If asked to "generate a report," ` +
    `summarize the data given in text — you cannot produce a PDF or file. ${GUARDRAIL}`,
};

export const chatAssistant = onCall({ secrets: [GEMINI_API_KEY], cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.');
  }

  const message = String(request.data?.message ?? '').trim();
  if (!message) throw new HttpsError('invalid-argument', 'A message is required.');
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError('invalid-argument', `Keep messages under ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const contextJson = JSON.stringify(request.data?.context ?? {});
  if (contextJson.length > MAX_CONTEXT_JSON_LENGTH) {
    throw new HttpsError('invalid-argument', 'Context payload is too large.');
  }

  const userSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!userSnap.exists) throw new HttpsError('permission-denied', 'No profile found for this account.');

  const role = userSnap.data()!.role as string;
  // 'professor' rides the same experience as 'student' everywhere else in this app.
  const persona = ROLE_PERSONAS[role === 'professor' ? 'student' : role];
  if (!persona) {
    throw new HttpsError('permission-denied', 'The AI assistant is not available for your role yet.');
  }

  const systemPrompt = `${persona}\n\nLive data (JSON):\n${contextJson}`;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
  const model = genAI.getGenerativeModel({ model: MODEL_NAME, systemInstruction: systemPrompt });

  try {
    const result = await model.generateContent(message);
    return { reply: result.response.text() };
  } catch (e) {
    console.error('Gemini call failed:', e);
    throw new HttpsError('internal', 'The assistant is unavailable right now — try again shortly.');
  }
});
