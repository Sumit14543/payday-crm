# 🚀 Quick Start Guide - PayDay Loan CRM

Get up and running in **3 simple steps**!

## Prerequisites

✅ Node.js installed (v16+) - Download from [nodejs.org](https://nodejs.org/)

## Installation & Running

### Step 1: Install Dependencies

Open terminal in project folder and run:

```bash
npm install
```

Wait for installation to complete (2-3 minutes).

### Step 2: Start the Application

```bash
npm run dev
```

### Step 3: Open in Browser

Visit: **http://localhost:5173**

---

## That's It! 🎉

You should now see the PayDay Loan CRM dashboard.

## Navigation

- **Dashboard** - Main overview with stats and charts
- **Lead Management** - Manage leads
- **Customer Management** - Manage customers  
- **Team Management** - Team performance
- **Commission Tracking** - Track commissions
- **Income Details** - Income reports
- **Invoice & Payout** - Invoicing
- **MIS Reports** - Management reports
- **Analytics Reports** - Analytics

## Using Production Server

For production deployment:

```bash
# Build the app
npm run build

# Start production server  
npm start

# Visit http://localhost:3000
```

## Troubleshooting

**Problem:** Port 5173 already in use  
**Solution:** Close other apps using that port or change port in vite.config.ts

**Problem:** Installation fails  
**Solution:** Delete `node_modules` folder and run `npm install` again

**Problem:** Page is blank  
**Solution:** Check browser console (F12) for errors

## Need Help?

1. Check the full [README.md](./README.md) for detailed documentation
2. Look at error messages in the terminal
3. Check browser console (press F12)

## File Structure (Simplified)

```
src/
├── app/
│   ├── pages/          ← All page components
│   ├── components/     ← Reusable components
│   └── App.tsx         ← Main app
├── styles/             ← Styling
└── main.tsx            ← Entry point

server.js               ← Backend server
index.html              ← HTML template
```

## Making Changes

1. Edit files in `src/` folder
2. Save the file
3. Browser auto-refreshes (in dev mode)

## Common Tasks

### Change Dashboard Data

Edit: `src/app/pages/Dashboard.tsx`

### Add New Page

1. Create file: `src/app/pages/MyPage.tsx`
2. Add route: `src/app/routes.tsx`
3. Add menu: `src/app/components/Layout.tsx`

### Change Colors

Edit: `src/styles/index.css`

---

**Happy Coding! 💻**
