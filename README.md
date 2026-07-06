# ACT To Go 🚌

Real-time college bus tracking for **Agni College of Technology**. Students and
professors watch every bus move live on a map; drivers share their phone's GPS;
the admin manages buses and driver accounts.

**100% serverless and free to run** — no backend server, no paid APIs.

## Architecture

| Piece | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Hosting | Firebase Hosting (free HTTPS) |
| Login | Firebase Authentication (email/password) |
| Database + realtime | Cloud Firestore (`onSnapshot` listeners) |
| Map | Leaflet + OpenStreetMap (no API key) |
| Route drawing | OSRM public router + Nominatim geocoding (no API key) |

Firebase project: **`bustracking-fe9fe`**

### How it works

- Every bus is a document in the `buses` collection. Its `lastLocation` field is
  updated by the driver's phone every ~5 seconds while on a trip.
- Everyone watching the map holds one Firestore listener on the `buses`
  collection, so all buses move in real time on a single subscription.
- Roles live in `users/{uid}` docs (`student`, `professor`, `driver`, `admin`)
  and are enforced by `firestore.rules` — signup can only create
  student/professor accounts; only admins create drivers and buses; only the
  driver who claimed a bus can write its location.
- When the admin saves a bus route (origin, stops, destination), the app
  geocodes the place names with Nominatim and fetches the road path from OSRM
  **once**, storing the polyline on the bus document. Viewers never call
  external APIs.

## Roles

| Role | How they get an account | What they see |
|---|---|---|
| Student / Professor | Self-signup at `/signup` | Live map of all buses (`/map`) |
| Driver | Admin creates it (Drivers tab) | Driver panel (`/driver`): pick bus → Start Trip → GPS streams |
| Admin | One-time manual bootstrap (below) | Dashboard (`/admin`): buses, drivers, live tracking |

## First-time setup

### 1. Firebase console (one time)

1. [console.firebase.google.com](https://console.firebase.google.com) → project `bustracking-fe9fe`.
2. **Authentication → Sign-in method** → enable **Email/Password**.
3. **Project settings (gear) → General → Your apps** → register a **Web app** (`</>` icon)
   if none exists → copy the config values into `frontend/.env`
   (use `frontend/.env.example` as the template).
4. Create the admin account:
   - **Authentication → Users → Add user** — e.g. `admin@act.edu.in` + a strong password. Copy the **UID**.
   - **Firestore Database → Start collection** `users` → **Document ID = that UID** with fields:
     `name` (string), `email` (string), `role` = `"admin"` (string), `active` = `true` (boolean),
     `createdAt` (timestamp).
5. Deploy the security rules (see Deploy below), or paste `firestore.rules`
   into **Firestore Database → Rules** and publish.

### 2. Run locally

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

Geolocation works on `localhost` without HTTPS. Log in as the admin, create a
bus (Buses tab) and a driver (Drivers tab), then try the driver flow in a
second browser window.

## Deploy

```bash
npm install -g firebase-tools   # once
firebase login                  # once

cd frontend && npm run build && cd ..
firebase deploy                 # rules + hosting
```

The app goes live at **https://bustracking-fe9fe.web.app** — share that URL
with drivers (GPS needs the HTTPS that Firebase Hosting provides) and students.

## Free-tier notes (Spark plan)

- Driver phones write at most one location per 5 s **and only when the bus has
  moved ≥ 10 m** (plus a 25 s heartbeat when stopped) — ~10 buses × 4 h/day
  stays inside the free 20K writes/day.
- The map detaches its listener when the browser tab is hidden for a minute,
  so abandoned tabs don't burn the 50K reads/day quota.
- If usage grows, check **Firebase console → Usage**. Upgrading to Blaze keeps
  the same free allowance; overages for this app cost pennies.

## Project structure

```
firebase.json / .firebaserc     # Hosting + rules deploy config
firestore.rules                 # Role-based security (the real access control)
frontend/src/
├── lib/firebase.ts             # Firebase init (env-driven)
├── context/AuthContext.tsx     # Auth state + live user profile
├── components/
│   ├── RequireRole.tsx         # Route guard by role
│   └── BusMap.tsx              # Shared Leaflet map (markers, route, popups)
├── hooks/useBuses.ts           # Live `buses` subscription (quota-aware)
├── services/
│   ├── firestore.ts            # All reads/writes (claim/release/locations/CRUD)
│   └── geo.ts                  # Nominatim geocoding + OSRM routing
└── pages/                      # Home, Login, Signup, StudentMap, DriverPanel, AdminDashboard
```

## Known limitations

- "Deactivate driver" blocks them from starting trips, but doesn't disable
  their Firebase Auth login — do that in the console if needed.
- Deleting a driver's Auth account entirely requires the Firebase console
  (client apps can't delete other users).
- OSRM/Nominatim are free community servers: route drawing at bus-save time
  can occasionally fail — the bus still saves, just re-edit and save to retry.
