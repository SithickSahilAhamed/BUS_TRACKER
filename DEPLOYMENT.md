# College Bus Tracker — Deployment Guide

## Architecture

```
Frontend (React/Vite)  →  Vercel
Backend (Node/Express) →  Render or Railway
Database (MongoDB)     →  MongoDB Atlas
```

---

## 1. MongoDB Atlas (Database)

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → Create a free cluster
2. **Database Access** → Add a user with password → save credentials
3. **Network Access** → Add IP `0.0.0.0/0` (allow all — restrict later per platform)
4. **Connect** → Drivers → copy the connection string:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/bus-tracking?retryWrites=true&w=majority
   ```
5. Save this as `MONGODB_URI` in your backend environment

---

## 2. Backend on Render

1. Push code to GitHub (backend folder or monorepo)
2. Go to [render.com](https://render.com) → New → **Web Service**
3. Connect your repo, set:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Environment**: Node

4. Add these **Environment Variables** in Render dashboard:

   | Key | Value |
   |-----|-------|
   | `PORT` | `5000` |
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | your Atlas connection string |
   | `TOKEN_SECRET` | random 32+ char string |
   | `PIN_SALT` | random 16+ char string |
   | `ADMIN_EMAIL` | your admin email |
   | `ADMIN_PASSWORD` | strong password |
   | `CORS_ORIGIN` | `https://your-frontend.vercel.app` |
   | `LOG_LEVEL` | `info` |

   Generate secrets:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. Deploy — Render gives you a URL like `https://bus-tracker-api.onrender.com`

---

## 3. Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → import your repo
2. Set:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

3. Add these **Environment Variables** in Vercel dashboard:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://bus-tracker-api.onrender.com/api` |
   | `VITE_SOCKET_URL` | `https://bus-tracker-api.onrender.com` |
   | `VITE_GOOGLE_MAPS_API_KEY` | your Google Maps API key (see step 4) |

4. Deploy — Vercel gives you `https://bus-tracker.vercel.app`

5. Go back to Render → update `CORS_ORIGIN` to your Vercel URL → redeploy backend

---

## 4. Google Maps API Key

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create or select a project
3. **APIs & Services** → **Enable APIs**:
   - Maps JavaScript API
   - Directions API
   - Places API
4. **Credentials** → Create API Key
5. **Restrict the key** (important for production):
   - Application restrictions: HTTP referrers
   - Add: `https://your-frontend.vercel.app/*`
   - API restrictions: select only the 3 APIs above
6. Copy the key → add as `VITE_GOOGLE_MAPS_API_KEY` in Vercel

---

## 5. First-time Setup

After deploying, create your first bus via the Admin Dashboard:

1. Open `https://your-frontend.vercel.app/admin/login`
2. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
3. Click **+ Add Bus** and fill in:
   - **Bus ID**: e.g. `BUS001`
   - **Bus Name**: e.g. `Route 1 Express`
   - **Origin**: e.g. `Navalur, Chennai`
   - **Destination**: e.g. `Agni College of Technology, Chennai`
   - **Waypoints**: e.g. `Sholinganallur, Chennai, Semmenchery, Chennai`
4. Give the driver their Bus ID and PIN (default: `1234`)
5. Use the **PIN** button to change it

---

## 6. Testing Checklist

### Student
- [ ] Open `/student`, select a bus → route line appears on map
- [ ] When driver starts tracking, bus marker moves in real time
- [ ] Offline banner shows when backend is unreachable

### Driver
- [ ] Open `/driver/login`, enter Bus ID + PIN → redirects to panel
- [ ] Press **Start Tracking** → GPS status shows Active
- [ ] Student map updates within 5 seconds
- [ ] Press **Stop Tracking** → bus goes offline

### Admin
- [ ] Open `/admin/login` → dashboard loads with bus list
- [ ] Add bus → appears in student dropdown immediately
- [ ] Edit origin/destination → student route updates on next bus select
- [ ] Change PIN → driver can log in with new PIN, old PIN rejected
- [ ] Delete bus → removed from all views

### Real-time
- [ ] Open student map and driver panel side-by-side
- [ ] Start tracking on driver → marker appears on student map within 3 s
- [ ] Disconnect backend → student sees "Offline" chip
- [ ] Reconnect backend → student reconnects automatically

---

## 7. Environment Summary

### Backend `.env` (copy from `backend/.env.example`)
```env
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
TOKEN_SECRET=<32-char random>
PIN_SALT=<16-char random>
ADMIN_EMAIL=admin@yourschool.edu
ADMIN_PASSWORD=<strong password>
CORS_ORIGIN=https://your-frontend.vercel.app
LOG_LEVEL=info
```

### Frontend `.env` (copy from `frontend/.env.example`)
```env
VITE_API_URL=https://your-backend.onrender.com/api
VITE_SOCKET_URL=https://your-backend.onrender.com
VITE_GOOGLE_MAPS_API_KEY=AIza...
```

---

## 8. Local Development

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env   # fill in values
npm install
node server.js

# Terminal 2 — frontend
cd frontend
cp .env.example .env   # fill in values
npm install
npm run dev
```

Open `http://localhost:5173`

Default admin login: `admin@bustrack.com` / `admin123`
Default driver PIN: `1234`
