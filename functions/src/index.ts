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
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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
  principal: `You are the AI assistant inside ACT To Go, helping college leadership at ` +
    `Agni College of Technology with a high-level view of the transport operation: ` +
    `fleet utilization, fuel and maintenance spend, student ridership, and driver ` +
    `performance. Answer in a brief executive-summary tone, not operational detail. ${GUARDRAIL}`,
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

// ============================================================================
// NOTIFICATIONS (PROJECT_SPEC.md section 7)
//
// In-app only, not push — see CLAUDE.md for that call. These triggers are
// the only thing that ever writes to `notifications`; the client can only
// read its own and mark them read (firestore.rules has no client create
// rule for the collection at all).
// ============================================================================

function notify(doc: Record<string, unknown>) {
  return db.collection('notifications').add({ read: false, createdAt: FieldValue.serverTimestamp(), ...doc });
}

export const onSosAlertCreated = onDocumentCreated('sosAlerts/{alertId}', async (event) => {
  const alert = event.data?.data();
  if (!alert) return;
  await notify({
    recipientUid: null,
    recipientRole: 'admin',
    type: 'sos',
    title: '🆘 SOS Alert',
    body: `${alert.userName} (${alert.role}) pressed SOS${alert.busId ? ` on ${alert.busId}` : ''}.`,
  });
});

export const onReportCreated = onDocumentCreated('reports/{reportId}', async (event) => {
  const report = event.data?.data();
  if (!report) return;

  if (report.type === 'incident') {
    await notify({
      recipientUid: null,
      recipientRole: 'admin',
      type: 'incident',
      title: `🚧 Incident: ${report.category}`,
      body: `${report.driverName} reported ${report.category} on ${report.busNumber}.`,
    });
  } else if (report.type === 'damage') {
    const body = `${report.driverName} reported ${report.category} damage on ${report.busNumber}.`;
    await Promise.all([
      notify({ recipientUid: null, recipientRole: 'admin', type: 'damage', title: `🔧 Damage: ${report.category}`, body }),
      notify({ recipientUid: null, recipientRole: 'maintenance', type: 'damage', title: `🔧 Repair needed: ${report.category}`, body }),
    ]);
  }
});

export const onReportUpdated = onDocumentUpdated('reports/{reportId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.status === 'open' && after.status === 'resolved' && after.type === 'damage' && after.driverId) {
    await notify({
      recipientUid: after.driverId,
      recipientRole: null,
      type: 'repair_closed',
      title: '✅ Repair completed',
      body: `Your ${after.category} report on ${after.busNumber} was fixed.` +
        (after.repairNotes ? ` Notes: ${after.repairNotes}` : ''),
    });
  }
});

export const onMissedBusRequestCreated = onDocumentCreated('missedBusRequests/{requestId}', async (event) => {
  const req = event.data?.data();
  if (!req) return;
  await notify({
    recipientUid: null,
    recipientRole: 'admin',
    type: 'missed_bus_request',
    title: '🚌 Missed bus request',
    body: `${req.studentName} missed ${req.originalBusId} and requested ${req.requestedBusNumber}.`,
  });
});

export const onMissedBusRequestUpdated = onDocumentUpdated('missedBusRequests/{requestId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.status === 'pending' && after.status !== 'pending') {
    await notify({
      recipientUid: after.studentId,
      recipientRole: null,
      type: 'missed_bus_decision',
      title: after.status === 'approved' ? '✅ Alternative bus approved' : '❌ Request denied',
      body: after.status === 'approved'
        ? `You're approved to take ${after.requestedBusNumber} instead of ${after.originalBusId}.`
        : `Your request to take ${after.requestedBusNumber} instead of ${after.originalBusId} was denied.`,
    });
  }
});

export const onUserAssignmentChanged = onDocumentUpdated('users/{uid}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (!['student', 'professor'].includes(after.role as string)) return;
  if (before.assignedBusId === after.assignedBusId) return;

  await notify({
    recipientUid: event.params.uid,
    recipientRole: null,
    type: 'bus_assignment',
    title: after.assignedBusId ? '🚌 Bus assignment updated' : '🚌 Bus assignment removed',
    body: after.assignedBusId
      ? `You've been assigned to ${after.assignedBusId}` + (after.assignedStopName ? ` — stop: ${after.assignedStopName}.` : '.')
      : 'Your bus assignment was cleared — contact the transport office.',
  });
});
