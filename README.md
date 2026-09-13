# CellXpress Job Agent

Hands-free repair job intake for CellXpress (UWC Student Centre). Owner sends a
photo of the device + a recorded voice note; Gemini (Google AI Studio) extracts
the customer name, device model and fee; the job lands in Firestore; the
dashboard tracks status and flags jobs open more than 48 hours; marking a job
complete gives the owner a one-tap WhatsApp message to send the customer.

## Stack

- **Frontend + hosting:** Next.js on Vercel
- **Agent:** Google AI Studio (Gemini API) — multimodal call with image + audio
- **Backend:** Firebase Firestore (jobs collection), read/written via the
  Firebase Admin SDK from server-side API routes only (no client writes, so
  your Firestore security rules can stay locked down)

## 1. Create your Firebase project

1. Go to https://console.firebase.google.com → **Add project**.
2. Once created, go to **Build → Firestore Database → Create database**
   (start in production mode).
3. Go to **Project settings → Service accounts → Generate new private key**.
   This downloads a JSON file — you'll need three values from it:
   `project_id`, `client_email`, `private_key`.
4. Firestore security rules (Rules tab) — since all writes go through your
   server, lock the collection down:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /jobs/{jobId} {
         allow read, write: if false; // server (Admin SDK) bypasses rules
       }
     }
   }
   ```

## 2. Get a Google AI Studio API key

1. Go to https://aistudio.google.com/apikey → **Create API key**.
2. Copy it — this is `GEMINI_API_KEY` below.

## 3. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```
GEMINI_API_KEY=...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
OWNER_WHATSAPP_COUNTRY_CODE=27
```

`FIREBASE_PRIVATE_KEY` must keep the `\n` escapes literal (the code
un-escapes them at runtime) — easiest is to paste it in quotes exactly as it
appears in the downloaded JSON.

## 4. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000/intake to log a job, http://localhost:3000 for the
dashboard.

## 5. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Then in the Vercel project settings → **Environment Variables**, add the same
four variables from `.env.local`, and redeploy.

## How it maps to your Part 1 answer sheet

- **Job intake and logging (Step 2):** `/intake` page + `pages/api/extract.js`
  (Gemini call) + `pages/api/jobs/index.js` (Firestore write).
- **Job monitoring (Step 4):** dashboard computes "urgent" client-side from
  `createdAt`, no cron needed for the MVP.
- **Job completion & customer notification (Steps 5–6):**
  `pages/api/jobs/[id]/complete.js` flips status, dashboard then surfaces a
  `wa.me` link pre-filled with a collection message — this is the stand-in
  for the real WhatsApp Business API integration named in your MVI gap.
- **Confidence-scoring / human-in-the-loop (ethical considerations table):**
  Gemini is prompted to return a `confidence` field per extracted value;
  anything below the threshold is shown to the owner for a quick edit before
  it's saved, rather than being auto-logged.

## What's still a real gap (be honest about this in Part 2/3)

- No continuous ASR — audio is recorded per-job and sent to Gemini in one
  shot, not live streaming transcription.
- WhatsApp is a manual-tap `wa.me` link, not the authenticated Business API
  (that needs a Meta Business verification + a paid BSP like Twilio).
- No auth on the dashboard — anyone with the URL can see/edit jobs. Add
  Firebase Auth + a Vercel middleware check before this goes near production.
