# AGNI Smart Fleet AI — Project Memory

Full specification: see `PROJECT_SPEC.md` (repo root — contains all 9 sections: user roles, student module, driver module, admin dashboard, fleet maintenance, AI analytics, notifications, reports, security). Future Enhancements were intentionally excluded from this build — do not implement them unless explicitly asked.

Deployed as **ACT To Go** for Agni College of Technology — see `README.md` for setup/deploy instructions.

## Tech Stack (actual — this diverged from the original assumed defaults, keep this in sync)
- Frontend (web): React 18 + TypeScript + Vite (not Tailwind)
- Frontend (mobile): Capacitor wraps the same React app as a native Android shell (`frontend/android/`) — not React Native/Flutter. Used today for the driver app's background GPS tracking. iOS not set up.
- Backend: **none** — fully serverless. Firebase Spark (free) plan, no Cloud Functions; all logic is client-side + `firestore.rules`.
- Database: Cloud Firestore (also the realtime layer, via `onSnapshot` — no sockets)
- Auth: Firebase Authentication (Role-Based Access Control per section 9)
- Maps/GPS: **Leaflet + OpenStreetMap** (not Google Maps — no API key needed/wanted). Route drawing via OSRM + Nominatim, called once at admin bus-save time.
- Hosting: Firebase Hosting

## Build Phases

- [x] **Phase 1** — Firebase Auth + Firestore schema (all 6 roles modeled; `student`/`professor`/`driver`/`admin` have real sign-up + dashboards, `parent`/`maintenance`/`principal` are typed but have no UI yet — that's Phases 4/6) + Student module (login, assigned bus/stop, live tracking, ETA prediction from current speed + route-projected distance)
- [x] **Phase 2** — Driver module: start/end trip, GPS sharing (web + native Android background tracking), next-stop reminder, waiting-student count, boarding roster, incident/damage reporting all done. AI driver assistant intentionally deferred to Phase 5 — needs an AI provider decision this app doesn't have yet, not just more client code.
- [x] **Phase 3** — Admin Dashboard: bus CRUD + route drawing (now with seating capacity), driver CRUD, live tracking map, student→bus/stop assignment, driver reports, live Attendance (assigned/boarded/likely-absent, computed the same route-projection way as Next Stop — not a historical log), Missed Bus Recovery (student requests + admin approve/deny), Breakdown Management (suggest buses with free seats, bulk-reallocate riders), campus entry/exit geofence log all done. Dedicated Stop/Route entities as their own collections deliberately **not done** — the current bus-owns-its-route model works fine at this fleet's scale and decoupling them is a large rewrite the spec's CRUD wording doesn't actually require.
- [ ] **Phase 4** — Fleet Maintenance (vehicle profiles, fuel, service schedule, tyres, battery, document reminders)
- [ ] **Phase 5** — AI Analytics + AI Chat Assistants (Student/Driver/Admin/Principal)
- [ ] **Phase 6** — Notifications, Reports (PDF/Excel export), Parent module, Principal dashboard

**Current phase: Phases 1–3 are functionally complete. Start Phase 4 (Fleet Maintenance) next, per the one-phase/feature-per-session rule below.**

## Conventions
- Keep each Claude Code session scoped to ONE phase/feature — do not attempt multiple phases in a single session.
- Reference `PROJECT_SPEC.md` section numbers when asking Claude Code to build a feature (e.g. "build section 2's Missed Bus Recovery flow").
- Update the "Build Phases" checklist and "Current phase" line above as work completes — they drifted out of sync with reality once before, keep them honest.
- Firestore security rules must reflect the 6 roles defined in section 1 at all times.
- There is no location-history collection and no backend, so anything needing historical data or server-side computation (traffic-aware ETA, predictive maintenance, AI analytics) needs a deliberate architecture decision first — flag it rather than assuming Cloud Functions are available.
- To verify a driver- or admin-only flow without real credentials: `firebase emulators:start --only firestore,auth`, then `VITE_USE_EMULATOR=true npm run dev` (see `frontend/src/lib/firebase.ts`) and seed test accounts with `firebase-admin` pointed at `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST` — bypasses the self-signup role restrictions entirely, with zero risk to the live project.
