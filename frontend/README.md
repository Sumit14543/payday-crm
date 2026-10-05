# PayDay Loan CRM - Sales Management System

A comprehensive CRM system for managing payday loans, leads, customers, and team performance. Built with React, TypeScript, Tailwind CSS, and Node.js.

![CRM Dashboard](./preview.png)

## 🚀 Features

- **Dashboard** - Interactive dashboard with real-time stats and charts
- **Lead Management** - Track and manage potential customers
- **Customer Management** - View and manage customer profiles
- **Team Management** - Monitor team performance and commissions
- **Commission Tracking** - Track sales commissions
- **Income & Payout** - Manage invoices and payouts
- **Reports & Analytics** - MIS reports and analytics
- **Responsive Design** - Works on desktop, tablet, and mobile

## 📋 Prerequisites

Before you begin, ensure you have installed:

- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **npm** or **pnpm** (pnpm is recommended)

To check if you have Node.js installed:
```bash
node --version
npm --version
```

## 🛠️ Installation

### Step 1: Clone or Download the Project

Download this project to your computer.

### Step 2: Install Dependencies

Open terminal/command prompt in the project folder and run:

```bash
# Using npm
npm install

# OR using pnpm (recommended - faster)
npm install -g pnpm
pnpm install
```

This will install all required packages.

## 🎯 Running the Application

### Option 1: Development Mode (Recommended)

For development with hot-reload (changes reflect automatically):

```bash
# Using npm
npm run dev

# Using pnpm
pnpm dev
```

The application will start at: **http://localhost:5173**

Open your browser and visit the URL shown in the terminal.

### Option 2: Production Mode

For production deployment:

```bash
# Step 1: Build the application
npm run build

# Step 2: Start the server
npm start
```

The application will start at: **http://localhost:3000**

## 📁 Project Structure

```
payday-loan-crm/
├── src/
│   ├── app/
│   │   ├── components/     # React components
│   │   │   ├── ui/        # UI components (buttons, cards, etc.)
│   │   │   └── Layout.tsx # Main layout with sidebar
│   │   ├── pages/         # Page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Leads.tsx
│   │   │   ├── Customers.tsx
│   │   │   └── ...
│   │   ├── App.tsx        # Main app component
│   │   └── routes.tsx     # React Router configuration
│   ├── styles/            # CSS and styling
│   │   └── index.css
│   └── main.tsx           # Application entry point
├── server.js              # Node.js/Express backend server
├── index.html             # HTML template
├── package.json           # Dependencies and scripts
├── vite.config.ts         # Vite configuration
└── README.md              # This file
```

## 🔧 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (Vite) at http://localhost:5173 |
| `npm run build` | Build for production |
| `npm start` | Start production server at http://localhost:3000 |
| `npm run preview` | Preview production build locally |

## 🌐 API Endpoints

The server includes mock API endpoints for testing:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Server health check |
| GET | `/api/leads` | Get all leads |
| GET | `/api/leads/:id` | Get specific lead |
| POST | `/api/leads` | Create new lead |
| GET | `/api/loans` | Get all loans |
| GET | `/api/loans/:id` | Get specific loan |
| GET | `/api/customers` | Get all customers |
| GET | `/api/customers/:id` | Get specific customer |
| GET | `/api/dashboard/stats` | Get dashboard statistics |
| GET | `/api/team` | Get team members |

### Testing API Endpoints

You can test the API endpoints using:

**Browser:**
```
http://localhost:3000/api/health
```

**Curl:**
```bash
curl http://localhost:3000/api/health
```

**Postman/Thunder Client:**
Import the endpoints and test them.

## 🎨 Customization

### Changing Colors and Styles

Edit the file: `src/styles/index.css` or `src/styles/theme.css`

### Adding New Pages

1. Create a new file in `src/app/pages/YourPage.tsx`
2. Add the route in `src/app/routes.tsx`
3. Add navigation link in `src/app/components/Layout.tsx`

Example:
```typescript
// src/app/pages/NewPage.tsx
export function NewPage() {
  return (
    <div>Your content here</div>
  );
}

// Add to routes.tsx
import { NewPage } from "./pages/NewPage";
// Then add route: { path: "new-page", Component: NewPage }
```

### Connecting to Real Backend

Replace the mock API calls in components with real API calls:

```typescript
// Example: Fetch real data
const response = await fetch('https://your-api.com/api/leads');
const data = await response.json();
```

## 🐛 Troubleshooting

### Port Already in Use

If port 3000 or 5173 is already in use:

```bash
# Change the port
PORT=3001 npm start

# Or for dev server, edit vite.config.ts
```

### Dependencies Not Installing

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Build Errors

```bash
# Clear Vite cache
rm -rf .vite
npm run dev
```

## 📱 Responsive Design

The application is fully responsive and works on:
- Desktop (1920px and above)
- Laptop (1024px - 1919px)
- Tablet (768px - 1023px)
- Mobile (below 768px)

## 🔒 Environment Variables

Create a `.env` file in the root directory for environment variables:

```env
PORT=3000
NODE_ENV=development
```

## 📦 Tech Stack

- **Frontend:**
  - React 18.3.1
  - TypeScript
  - Tailwind CSS v4
  - React Router DOM 7.14
  - Recharts (for charts)
  - Lucide React (for icons)
  - Radix UI (for components)

- **Backend:**
  - Node.js
  - Express.js
  - CORS

- **Build Tools:**
  - Vite 6.3.5
  - pnpm (package manager)

## 📄 License

This project is for educational and commercial use.

## 👥 Support

For issues or questions:
1. Check the troubleshooting section
2. Review the code comments
3. Check console for error messages

## 🚢 Deployment

### Deploy to Production Server

1. Build the application:
```bash
npm run build
```

2. Upload the `dist` folder and `server.js` to your server

3. Install dependencies on server:
```bash
npm install --production
```

4. Start the server:
```bash
node server.js
```

### Deploy to Cloud (Vercel, Netlify, etc.)

For Vercel/Netlify, connect your Git repository and they will automatically:
- Install dependencies
- Run `npm run build`
- Deploy the `dist` folder

## 🎉 Getting Started - Quick Guide

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev

# 3. Open browser
# Visit: http://localhost:5173

# That's it! You're ready to go! 🚀
```

## 📸 Screenshots

The application includes:
- Interactive dashboard with charts
- Lead management table
- Customer profiles
- Team performance tracking
- Responsive sidebar navigation
- Modern UI with Tailwind CSS

---

**Made with ❤️ for PayDay Loan Management**
