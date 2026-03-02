import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase, supabaseAdmin } from '../config/supabase';
import { authenticate } from '../middleware/auth';
import jwt from 'jsonwebtoken';

const router = Router();

// ── Validation schemas ───────────────────────────────────────
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1), // Relaxed min to allow flexible passwords
    loginType: z.enum(['admin', 'employee']).default('employee'),
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

    const { email, password, loginType } = parsed.data;

    // 1. Fetch user from our database to check role & mobile
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id, role, organization_id, name, mobile')
        .eq('email', email)
        .single();

    if (profileError && profileError.code !== 'PGRST116') {
        console.error("Supabase Profile Error:", profileError);
    }

    // Fallback: Check employees table if not in profiles directly
    let userRecord = profile;
    if (!userRecord) {
        const { data: employee, error: empError } = await supabaseAdmin
            .from('employees')
            .select('user_id, role, organization_id, name, mobile')
            .eq('email', email)
            .single();

        if (empError && empError.code !== 'PGRST116') {
            console.error("Supabase Employee Error:", empError);
        }

        if (employee && employee.user_id) {
            userRecord = { id: employee.user_id, ...employee };
        }
    } else if (!userRecord.mobile || !userRecord.organization_id) {
        // Profile found but missing mobile or org — fetch both from employees table
        const { data: employee } = await supabaseAdmin
            .from('employees')
            .select('mobile, organization_id')
            .eq('email', email)
            .single();

        if (employee?.mobile && !userRecord.mobile) {
            userRecord = { ...userRecord, mobile: employee.mobile };
        }
        if (employee?.organization_id && !userRecord.organization_id) {
            userRecord = { ...userRecord, organization_id: employee.organization_id };
        }
    }

    if (!userRecord) {
        console.log(`Login failed: User not found for email ${email}`);
        return res.status(401).json({ error: 'User not found' });
    }

    let accessToken: string;
    let userId = userRecord.id;

    // Verify the requested login method matches their actual role
    const isActuallyAdmin = userRecord.role === 'admin';
    if (loginType === 'admin' && !isActuallyAdmin) {
        return res.status(403).json({ error: 'This account does not have Admin privileges.' });
    }
    if (loginType === 'employee' && isActuallyAdmin) {
        return res.status(403).json({ error: 'Admin accounts must use the Admin login tab.' });
    }

    if (isActuallyAdmin) {
        // Admin: Standard Supabase Auth password check
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.user) {
            return res.status(401).json({ error: error?.message || 'Invalid admin credentials' });
        }
        accessToken = data.session.access_token;
        userId = data.user.id;
    } else {
        // Employee/Manager: Custom password rule (Mobile + ADi or just Mobile)
        const expectedPassword = userRecord.mobile ? `${userRecord.mobile}ADi` : null;
        const fallbackPassword = userRecord.mobile ? userRecord.mobile : null;

        if (!expectedPassword && !fallbackPassword) {
            return res.status(401).json({ error: 'Mobile number not set for this account. Cannot login.' });
        }

        if (password !== expectedPassword && password !== fallbackPassword) {
            return res.status(401).json({ error: 'Invalid password. Use your mobile number or mobile number + ADi.' });
        }

        // Generate custom JWT since we bypassed Supabase Auth
        const jwtSecret = process.env.JWT_SECRET || 'super-secret-key-change-in-production';
        accessToken = jwt.sign(
            {
                sub: userId,
                email: email,
                name: userRecord.name,          // include name so /auth/me has it from token too
                role: userRecord.role,
                organization_id: userRecord.organization_id
            },
            jwtSecret,
            { expiresIn: '7d' }
        );
    }

    return res.json({
        token: accessToken,
        user: {
            id: userId,
            email: email,
            name: userRecord.name,
            role: userRecord.role,
            organization_id: userRecord.organization_id,
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
// Returns full user profile by querying the RIGHT table based on role:
//   admin            → profiles  (they live in Supabase Auth / profiles)
//   manager/employee → employees (they were added manually by admin)
router.get('/me', authenticate, async (req: Request, res: Response) => {
    const user = req.user!;

    try {
        if (user.role === 'admin') {
            // Admins: fetch from profiles table
            const { data, error } = await supabaseAdmin
                .from('profiles')
                .select('id, name, email, role, organization_id')
                .eq('id', user.id)
                .single();

            if (error || !data) {
                return res.status(404).json({ error: 'Profile not found' });
            }

            return res.json({
                user: {
                    id: data.id,
                    name: data.name,
                    email: data.email,
                    role: data.role,
                    organization_id: data.organization_id,
                }
            });
        } else {
            // Managers & Employees: fetch from employees table
            const { data, error } = await supabaseAdmin
                .from('employees')
                .select('id, name, email, role, organization_id, department, mobile')
                .eq('email', user.email)
                .single();

            if (error || !data) {
                return res.status(404).json({ error: 'Employee record not found' });
            }

            return res.json({
                user: {
                    id: user.id,                        // use auth id (sub from JWT)
                    name: data.name,
                    email: data.email,
                    role: data.role,
                    organization_id: data.organization_id,
                    department: data.department,
                    mobile: data.mobile,
                }
            });
        }
    } catch (e) {
        console.error('[/auth/me]', e);
        return res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

export default router;
