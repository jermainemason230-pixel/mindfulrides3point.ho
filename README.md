# Mindful Rides — NEMT Booking Platform

A full-stack non-emergency medical transportation (NEMT) ride booking platform. Built with Next.js 14, Supabase, Stripe, and Mapbox.

## What This App Does

- **Facility staff** book rides for patients (ASAP or scheduled, one-way or round-trip)
- **Drivers** see their schedule, accept/complete rides, and share live GPS
- **Admins** manage everything: drivers, facilities, rides, invoicing, and analytics
- Real-time status updates across all users
- Auto-assignment of drivers based on proximity and availability
- Shared ride matching for cost savings
- Stripe invoicing and payments
- SMS/email notifications via GoHighLevel webhooks

---

## Prerequisites

You need these accounts (all have free tiers):

1. **Node.js 18+** — [Download here](https://nodejs.org/)
2. **Supabase** account — [Sign up free](https://supabase.com/)
3. **Mapbox** account — [Sign up free](https://www.mapbox.com/)
4. **Stripe** account — [Sign up](https://stripe.com/)
5. **Vercel** account (for deployment) — [Sign up free](https://vercel.com/)
6. **GoHighLevel** account (optional, for SMS/email notifications)

---

## Step-by-Step Setup

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd mindful-rides
npm install
```

### 2. Set Up Supabase

1. Go to [supabase.com](https://supabase.com/) and create a new project
2. Wait for the project to finish setting up
3. Go to **SQL Editor** in the left sidebar
4. Copy the entire contents of `supabase/migrations/001_initial_schema.sql` and paste it into the SQL editor
5. Click **Run** — this creates all your database tables
6. Go to **Settings** → **API** and copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)
   - **service_role key** (starts with `eyJ...`) — keep this secret!

### 3. Set Up Environment Variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` in a text editor and fill in your values:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ...your-mapbox-token
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
GOHIGHLEVEL_WEBHOOK_URL=https://...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Get Your Mapbox Token

1. Go to [mapbox.com](https://www.mapbox.com/) and sign in
2. Go to your **Account** → **Tokens**
3. Copy your **Default public token** (starts with `pk.eyJ`)
4. Paste it as `NEXT_PUBLIC_MAPBOX_TOKEN` in `.env.local`

### 5. Set Up Stripe

1. Go to [stripe.com](https://stripe.com/) and sign in
2. Go to **Developers** → **API keys**
3. Copy your **Publishable key** and **Secret key**
4. Paste them in `.env.local`
5. For webhooks: Go to **Developers** → **Webhooks** → **Add endpoint**
   - URL: `https://your-domain.com/api/webhooks/stripe`
   - Events: `invoice.paid`, `invoice.payment_failed`
   - Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

### 6. Seed the Database

This creates sample data so you can test the app immediately:

```bash
npm run seed
```

This will create:
- 3 sample facilities
- 1 admin account
- 3 facility staff accounts
- 4 driver accounts
- 5 sample rides
- 1 sample invoice

### 7. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Login Credentials (after seeding)

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@mindfulrides.com | admin123456 |
| **Staff (Sunrise Care)** | sarah@sunrisecare.com | staff123456 |
| **Staff (Valley Medical)** | mike@valleymedical.com | staff123456 |
| **Staff (Harmony Health)** | lisa@harmonyhealth.com | staff123456 |
| **Driver** | james@mindfulrides.com | driver123456 |
| **Driver** | maria@mindfulrides.com | driver123456 |
| **Driver** | david@mindfulrides.com | driver123456 |
| **Driver** | anna@mindfulrides.com | driver123456 |

---

## Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com/) and click **New Project**
3. Import your GitHub repository
4. Add all environment variables from `.env.local` in the Vercel dashboard
5. Click **Deploy**
6. After deployment, go to **Settings** → **Domains** and add your custom domain (e.g., `book.mindfulrides.com`)

---

## How to Use

### As Admin

1. Log in with admin credentials
2. **Dashboard**: See all rides across all facilities, live driver map
3. **Drivers**: Add/manage drivers, set vehicle types
4. **Facilities**: Add/manage facilities and their staff accounts
5. **Invoicing**: Generate and send invoices per facility
6. **Analytics**: View ride stats, revenue charts
7. **Settings**: Configure pricing, webhook URL

### As Facility Staff

1. Log in with staff credentials
2. Click **"Book a Ride"** to create a new ride
3. Fill in patient info, addresses, vehicle type, timing
4. See rides update in real-time as drivers accept and progress
5. View ride history and invoices

### As Driver

1. Log in with driver credentials on your phone
2. Toggle **Available** to start receiving rides
3. See today's assigned rides
4. Tap action buttons to progress through each ride:
   - "Start — Heading to Pickup"
   - "Arrived at Pickup"
   - "Patient Picked Up"
   - "Ride Complete"

---

## Configuring Pricing

Go to **Admin** → **Settings** and adjust:

- **Base rate**: Flat fee per ride (default: $25)
- **Per-mile rate**: Cost per mile (default: $2.50)
- **Vehicle multipliers**:
  - Ambulatory: 1.0x
  - Wheelchair: 1.3x
  - Bariatric: 1.5x
  - Stretcher: 2.0x
- **Shared ride discount**: 20% off per rider
- **Round-trip multiplier**: 1.8x one-way price

---

## GoHighLevel Setup (Optional)

To enable SMS and email notifications:

1. In GoHighLevel, create a new workflow
2. Set the trigger to "Inbound Webhook"
3. Copy the webhook URL
4. Paste it as `GOHIGHLEVEL_WEBHOOK_URL` in your environment variables
5. In the workflow, add actions based on the `event` field in the webhook payload

Events sent: `ride_requested`, `ride_assigned`, `driver_en_route`, `arrived_at_pickup`, `ride_completed`, `ride_cancelled`, `invoice_created`, `no_driver_available`

---

## Troubleshooting

**"Invalid login credentials"**
- Make sure you ran `npm run seed` to create the test accounts
- Check that your Supabase URL and keys are correct in `.env.local`

**Map not showing**
- Verify your Mapbox token is correct in `.env.local`
- Make sure it starts with `pk.eyJ`

**Rides not updating in real-time**
- Check that you enabled Realtime in Supabase: go to Database → Replication and make sure `rides` and `drivers` tables are enabled

**Stripe webhooks not working**
- Make sure your webhook endpoint URL is correct
- Check that you're using the correct webhook signing secret
- For local testing, use `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

**"Permission denied" errors**
- The Row Level Security policies require users to be authenticated
- Make sure you're logged in and your user has the correct role

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Real-time | Supabase Realtime |
| Maps | Mapbox GL JS |
| Payments | Stripe |
| Styling | Tailwind CSS |
| Notifications | GoHighLevel (webhooks) |
| Deployment | Vercel |
