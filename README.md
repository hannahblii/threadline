# Threadline — campus closet exchange

A real, working starting point for the app: React + Tailwind frontend, Supabase for
auth/database/storage. This gets you a live, shareable URL — not just a local demo.

## What's already built

- School-Google-account-gated sign in (Google OAuth, no passwords)
- Campus feed of all public listings
- Swipe-to-match on items, with mutual-match detection
- Real-time chat between matched users
- Barter circles: create, join, and circle-only listings
- Closet management: list an item with a photo, choose sell/trade/rent/borrow

## What you still need to add before real use

- Payments for the "sell"/"rent" flows (Stripe, added later — don't build this until
  you've validated people actually want to swap clothes this way)
- Reporting/blocking for safety
- Push/email notifications for new matches and messages

---

## Step 1 — Create your Supabase project (free)

1. Go to https://supabase.com, sign up, click **New project**.
2. Pick a name, a database password (save it somewhere), and a region close to your campus.
3. Once it's created, go to **SQL Editor → New query**, paste in the contents of
   `supabase/schema.sql` from this project, and click **Run**. This creates all your
   tables, security rules, and the photo storage bucket.
4. Go to **Project settings → API**. You'll need two values from this page in Step 3:
   - **Project URL**
   - **anon public** key

## Step 2 — Set up "Continue with Google" sign-in

Sign-in is a Google OAuth button, not a magic-link email — most students already
have a Google-backed school account, and it avoids email deliverability issues.
This needs a one-time setup in two places:

### 2a. Create a Google OAuth client

1. Go to https://console.cloud.google.com/apis/credentials (create a free Google
   Cloud account/project if you don't have one — no cost for this).
2. Click **Create credentials → OAuth client ID**. If prompted, configure the
   "OAuth consent screen" first — choose **External**, fill in an app name
   (e.g. "Threadline"), your email, and save. You can leave it in "Testing" mode
   while you build; you'll publish it later when you're ready for real users.
3. Back on **Create OAuth client ID**: Application type = **Web application**.
4. There are two separate boxes on this screen — they take different things,
   and mixing them up is the most common snag:
   - **Authorized JavaScript origins** — the bare domain only, **no path, no
     trailing slash** (Google rejects a `/` here):
     ```
     https://YOUR-PROJECT-REF.supabase.co
     ```
   - **Authorized redirect URIs** — this one *does* take a path:
     ```
     https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
     ```
   (find `YOUR-PROJECT-REF` in your Supabase Project URL from Step 1).
5. Click **Create**. You'll get a **Client ID** and **Client secret** — copy both.

### 2b. Enable Google in Supabase

1. In your Supabase project, go to **Authentication → Providers → Google**.
2. Toggle it on, paste in the **Client ID** and **Client secret** from 2a, save.

### 2c. Restrict sign-in to your school

Google OAuth can't filter by email domain before the redirect, so the app checks
*after* sign-in instead: in `src/lib/supabaseClient.js`, set `ALLOWED_EMAIL_DOMAIN`
to your school's domain (e.g. `"university.edu"`). Anyone who signs in with a
non-matching Google account gets an error message and is immediately signed back out.

This only works cleanly if students' school Google accounts use your school's
domain (true at most universities, since they run Google Workspace for
education). If your school uses Microsoft/Outlook instead, let me know and I'll
swap this for a Microsoft OAuth provider instead — same idea, different setup.

## Step 3 — Run it locally to test

You'll need [Node.js](https://nodejs.org) installed (the LTS version).

```bash
cd threadline
npm install
cp .env.example .env
```

Open `.env` and paste in your Project URL and anon key from Step 1.

```bash
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Sign in with your school
email, check your inbox for the magic link, and you're in.

## Step 4 — Put it on GitHub

1. Create a new repo at https://github.com/new (keep it private for now if you'd like).
2. In your project folder:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/threadline.git
git push -u origin main
```

`.env` is already excluded via `.gitignore` — your Supabase keys won't be pushed
(the anon key is safe to expose publicly anyway; it's designed for browser use, and
your Row Level Security rules are what actually protect the data).

## Step 5 — Deploy to a real URL (Vercel, free)

1. Go to https://vercel.com, sign up with your GitHub account.
2. Click **Add New → Project**, pick your `threadline` repo.
3. Vercel auto-detects Vite — leave the build settings as default.
4. Before deploying, add your environment variables (**Environment Variables** section):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (same values as your `.env` file)
5. Click **Deploy**. In about a minute you'll get a live URL like
   `threadline-yourname.vercel.app` — that's your shareable link.

Every time you `git push` to `main`, Vercel automatically redeploys.

### Optional: a nicer URL

Vercel lets you add a custom domain for free (you just need to own one, e.g. from
Namecheap/Google Domains — a `.com` is usually $10–15/year). Project → Settings →
Domains.

---

## Notes for extending this

- All data access goes through Supabase's Row Level Security policies (see
  `supabase/schema.sql`) — this is what enforces "circle members only see circle
  items" at the database level, not just in the UI. Any new table you add should
  get its own RLS policy or it'll be unreadable by default.
- Photos go to the `item-photos` storage bucket, created by the schema script.
- If you want to test with fake data before real students sign up, you can insert
  rows directly in the Supabase Table Editor.
