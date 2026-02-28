import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { authenticate } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

const employeeSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    mobile: z.string().optional(),
    department: z.string().optional(),
    role: z.string().optional(),
    avatar_url: z.string().url().optional(),
    organization_id: z.number(),
    user_id: z.string().uuid().optional(),
});

// ── GET /api/employees ───────────────────────────────────────
router.get('/', authenticate, roleGuard(['admin', 'manager']), async (req: Request, res: Response) => {
    let query = supabaseAdmin.from('employees').select('*, organizations(name)');

    // Managers only see their own org's employees
    if (req.user?.role === 'manager' && req.user.organization_id) {
        query = query.eq('organization_id', req.user.organization_id);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ employees: data });
});

// ── GET /api/employees/me ──────────────────────────────────
router.get('/me', authenticate, async (req: Request, res: Response) => {
    const { data, error } = await supabaseAdmin
        .from('employees')
        .select('id, name, email, department, organization_id, avatar_url')
        .eq('user_id', req.user!.id)
        .single();

    if (error || !data) return res.status(404).json({ error: 'Employee record not found' });
    return res.json({ employee: data });
});

// ── GET /api/employees/:id ───────────────────────────────────
router.get('/:id', authenticate, roleGuard(['admin', 'manager']), async (req: Request, res: Response) => {
    const { data, error } = await supabaseAdmin
        .from('employees')
        .select('*, organizations(name), attendance_records(*)')
        .eq('id', req.params.id)
        .single();

    if (error) return res.status(404).json({ error: 'Employee not found' });
    return res.json({ employee: data });
});

import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

const upload = multer({ storage: multer.memoryStorage() });

// ── POST /api/employees ──────────────────────────────────────
router.post('/', authenticate, roleGuard(['admin', 'manager']), upload.single('avatar'), async (req: Request, res: Response) => {
    // If sent as FormData, organization_id comes as a string, so we need to convert it before parsing
    if (req.body.organization_id && typeof req.body.organization_id === 'string') {
        req.body.organization_id = parseInt(req.body.organization_id, 10);
    }

    console.log("INCOMING BODY:", req.body);

    const parsed = employeeSchema.safeParse(req.body);
    if (!parsed.success) {
        console.error("VALIDATION ERROR:", parsed.error.flatten());
        return res.status(400).json({ error: parsed.error.flatten() });
    }

    console.log("PARSED DATA:", parsed.data);

    // Managers can only add to their own org
    if (req.user?.role === 'manager' && parsed.data.organization_id !== req.user.organization_id) {
        return res.status(403).json({ error: 'You can only add employees to your own organization' });
    }

    let avatar_url = parsed.data.avatar_url;

    // If there's a file attached via multipart, upload it to Cloudinary
    if (req.file) {
        try {
            const uploadPromise = new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'avatars' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                stream.end(req.file!.buffer);
            });

            const result = await uploadPromise as any;
            avatar_url = result.secure_url;
        } catch (uploadError: any) {
            console.error('Avatar upload error:', uploadError);
            return res.status(500).json({ error: `Avatar upload failed: ${uploadError.message}` });
        }
    }
    // Auto-create a Supabase Auth User so the employee can actually log in eventually
    let authUserId: string | undefined;
    try {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: parsed.data.email,
            password: 'Attendance123!', // Secure default password
            email_confirm: true,
            user_metadata: {
                name: parsed.data.name,
                role: parsed.data.role || 'employee',
                organization_id: parsed.data.organization_id
            }
        });

        if (authError) {
            return res.status(400).json({ error: `Failed to create auth user: ${authError.message}. Make sure email isn't already used.` });
        }

        authUserId = authData.user.id;
    } catch (e: any) {
        return res.status(500).json({ error: `Failed to create auth user: ${e.message}` });
    }

    const { data, error } = await supabaseAdmin
        .from('employees')
        .insert({
            ...parsed.data,
            avatar_url,
            user_id: authUserId
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ employee: data });
});

// ── PATCH /api/employees/:id ─────────────────────────────────
router.patch('/:id', authenticate, roleGuard(['admin', 'manager']), async (req: Request, res: Response) => {
    const parsed = employeeSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { data, error } = await supabaseAdmin
        .from('employees')
        .update(parsed.data)
        .eq('id', req.params.id)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ employee: data });
});

// ── DELETE /api/employees/:id ────────────────────────────────
router.delete('/:id', authenticate, roleGuard(['admin', 'manager']), async (req: Request, res: Response) => {
    const { error } = await supabaseAdmin
        .from('employees')
        .delete()
        .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: 'Employee deleted' });
});

// ── POST /api/employees/assign-manager ───────────────────────
router.post('/assign-manager', authenticate, roleGuard(['admin']), async (req: Request, res: Response) => {
    const schema = z.object({
        user_id: z.string().uuid(),
        organization_id: z.number(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Update the profiles table role to manager and assign org
    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ role: 'manager', organization_id: parsed.data.organization_id })
        .eq('id', parsed.data.user_id);

    if (profileError) return res.status(500).json({ error: profileError.message });

    // Also update the employees table so the role is consistent everywhere
    const { error: employeeError } = await supabaseAdmin
        .from('employees')
        .update({ role: 'manager', organization_id: parsed.data.organization_id })
        .eq('user_id', parsed.data.user_id);

    if (employeeError) {
        console.warn('Could not update employees table role:', employeeError.message);
        // Non-fatal: profiles was updated, log and continue
    }

    return res.json({ message: 'Manager assigned successfully' });
});

export default router;
