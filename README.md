# AttendSys Web Platform

Full-stack web platform for the AttendSys employee attendance system.

## Structure

```
attendance-web/
├── api/    → Node.js + Express + TypeScript REST API (→ Render)
└── web/    → Next.js + TypeScript admin dashboard  (→ Vercel)
```

## Quick Start

### API
```bash
cd api
cp .env.example .env   # fill in your Supabase keys
npm install
npm run dev            # runs on http://localhost:4000
```

### Web
```bash
cd web
cp .env.local.example .env.local
npm install
npm run dev            # runs on http://localhost:3000
```

## API Endpoints

| Method | Endpoint | Access |
|--------|----------|--------|
| GET | /api/health | Public |
| POST | /api/auth/login | Public |
| POST | /api/auth/register | Admin |
| GET | /api/organizations | Admin |
| POST | /api/organizations | Admin |
| GET | /api/employees | Admin/Manager |
| POST | /api/employees | Admin/Manager |
| POST | /api/employees/assign-manager | Admin |
| GET | /api/attendance | All (role-scoped) |
| POST | /api/attendance/checkin | All |
| POST | /api/attendance/checkout | All |
| GET | /api/attendance/summary | Admin/Manager |

## Deployment

- **API** → [Render.com](https://render.com) (free tier)
- **Web** → [Vercel](https://vercel.com) (free tier)
- **Database** → Supabase (existing)
