# 💸 SplitBuddy - Premium Splitwise Clone

**SplitBuddy** is a modern, 100% mobile-friendly, premium Progressive Web App (PWA) that clones the core functionality of Splitwise. Built using **React + TypeScript + Vite** and powered by **Supabase Online Database**, it allows users to track joint expenses, create custom groups, maintain separate friend ledgers, and settle debts using an automated **Debt Simplification Algorithm**.

🚀 **Live Demo:** [https://split-buddy-hybp.vercel.app/](https://split-buddy-hybp.vercel.app/)

---

## ✨ Features

- **PWA Ready**: Installable as a standalone app on both iOS and Android smartphones, featuring custom branding, standalone layouts, and offline shell caching.
- **Supabase Authentication**: Leverages Supabase Auth directly. Users are created inside Supabase, and a database trigger automatically synchronizes and initializes user profiles in the public space.
- **Flexible Expense Splitting**: Supports dividing bills:
  - **Equally**: Divides automatically among checked participants.
  - **Unequally**: Input exact currency amounts for each individual.
  - **Percentage-wise**: Allocate shares based on percentages summing to 100%.
- **Debt Simplification**: Built-in greedy matching algorithm that calculates the absolute minimum number of payments required to settle all debts in a group.
- **Categorization**: Visual category tags (Food 🍔, Travel 🚗, Rent 🏠, Bills ⚡, Movies 🎬, Others 📦).
- **Mobile First, Desktop Ready**: Features a native-feeling mobile bottom nav-bar and slide-up modals alongside a full-screen desktop sidebar.

---

## 🛠️ Tech Stack

- **Core**: React, TypeScript, Vite
- **Styling**: Vanilla CSS (CSS Variables, Backdrop blur glassmorphism, responsive viewports)
- **Database & Auth**: Supabase (PostgreSQL with RLS, triggers, indexes)
- **Icons**: Lucide React
- **Deployment**: Vercel ready (`vercel.json` included for single page routing)

---

## 🚀 Step 1: Supabase Database Setup

1. Create a free account at [Supabase](https://supabase.com) and spin up a new project.
2. Once your database is provisioned, navigate to the **SQL Editor** in the Supabase Dashboard.
3. Open a **New Query**, copy the entire contents of the SQL migration file:
   👉 [init_schema.sql](file:///E:/CAPGEMINI/MAIN/DevSecOps/paisaKaGame/supabase/migrations/20260606000000_init_schema.sql)
4. Paste the SQL query and click **Run**. This will build the following tables, triggers, indexes, and RLS policies:
   - `profiles`: Synced with Supabase Auth users.
   - `friends`: Friend link list.
   - `groups` & `group_members`: Group structures.
   - `expenses` & `expense_splits`: Debt split records.
   - `settlements`: Settlement logs.
   - `handle_new_user()` trigger: Automatically converts every email-registered Auth signup into a functional application profile.
5. In your Supabase dashboard, go to **Project Settings** -> **API**, and copy:
   - **Project URL**
   - **API Anon Key** (under `Project API keys`)

---

## 💻 Step 2: Local Setup & Running

1. Clone or navigate to the project directory:
   ```bash
   cd paisaKaGame
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file at the project root and add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
   Open your browser to `http://localhost:3000` to start testing!

---

## 📦 Step 3: Vercel Deployment

Deploying "SplitBuddy" to Vercel is extremely straightforward. The directory contains a [vercel.json](file:///E:/CAPGEMINI/MAIN/DevSecOps/paisaKaGame/vercel.json) file that automatically rewrites all request paths to `index.html` (vital for preserving Router states when deep linking).

1. Push your code to a GitHub repository.
2. Go to [Vercel](https://vercel.com) and click **Add New** -> **Project**.
3. Select your repository.
4. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = *(Your Supabase URL)*
   - `VITE_SUPABASE_ANON_KEY` = *(Your Supabase Anon Key)*
5. Click **Deploy**. Vercel will install, build, and deploy your site in under a minute!

---

## 📱 Step 4: Installing as a Smartphone App

Once deployed on Vercel (using an HTTPS connection):

### On Android (Google Chrome):
1. Navigate to your deployed URL.
2. Chrome will prompt a banner at the top or you can click the **three dots** in the top-right corner.
3. Select **"Install App"**.
4. The app will install and appear directly in your smartphone launcher as a standalone fullscreen app.

### On iOS (Safari):
1. Open your deployed URL in the native **Safari** browser on your iPhone.
2. Tap the **Share** button (up-arrow box) in the Safari bottom bar.
3. Scroll down the option sheet and tap **"Add to Home Screen"**.
4. Tap **Add** in the top right. It is now installed on your device with native display configurations!
