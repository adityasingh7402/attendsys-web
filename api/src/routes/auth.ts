import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase, supabaseAdmin } from '../config/supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

// ── Validation schemas ───────────────────────────────────────
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1),
    role: z.enum(['admin', 'manager', 'employee']).default('employee'),
});

// ── POST /api/auth/login ─────────────────────────────────────
router.post('/login', async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
        return res.status(401).json({ error: error?.message || 'Invalid credentials' });
    }

    // Fetch role from profiles
    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role, organization_id, name')
        .eq('id', data.user.id)
        .single();

    return res.json({
        token: data.session.access_token,
        user: {
            id: data.user.id,
            email: data.user.email,
            name: profile?.name,
            role: profile?.role,
            organization_id: profile?.organization_id,
        },
    });
});

// ── POST /api/auth/register (Admin only via service key) ──────
router.post('/register', authenticate, async (req: Request, res: Response) => {
    // Only admins can register new users
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can register users' });
    }

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { email, password, name, role } = parsed.data;

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
    });

    if (error || !data.user) {
        return res.status(400).json({ error: error?.message || 'Registration failed' });
    }

    // Update the profile with the correct role
    await supabaseAdmin
        .from('profiles')
        .update({ role, name })
        .eq('id', data.user.id);

    return res.status(201).json({
        message: 'User created successfully',
        userId: data.user.id,
        email,
        role,
    });
});

// ── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', authenticate, (req: Request, res: Response) => {
    return res.json({ user: req.user });
});

export default router;
