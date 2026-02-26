import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import healthRouter from './routes/health';
import authRouter from './routes/auth';
import organizationsRouter from './routes/organizations';
import employeesRouter from './routes/employees';
import attendanceRouter from './routes/attendance';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ──────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');

app.use(helmet());
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS blocked: ${origin}`));
        }
    },
    credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Self-ping to keep Render free tier alive ────────────────
if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
    const selfUrl = `${process.env.RENDER_EXTERNAL_URL}/api/health`;
    setInterval(async () => {
        try {
            await fetch(selfUrl);
            console.log('[keep-alive] pinged', selfUrl);
        } catch (e) {
            console.warn('[keep-alive] ping failed', e);
        }
    }, 14 * 60 * 1000); // every 14 minutes
}

// ── Routes ──────────────────────────────────────────────────
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/organizations', organizationsRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/attendance', attendanceRouter);

// ── 404 handler ─────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ AttendSys API running on http://localhost:${PORT}`);
});

export default app;
