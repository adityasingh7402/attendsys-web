import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { authenticate } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

const employeeSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    department: z.string().optional(),
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

// ── POST /api/employees ──────────────────────────────────────
router.post('/', authenticate, roleGuard(['admin', 'manager']), async (req: Request, res: Response) => {
    const parsed = employeeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Managers can only add to their own org
    if (req.user?.role === 'manager' && parsed.data.organization_id !== req.user.organization_id) {
        return res.status(403).json({ error: 'You can only add employees to your own organization' });
    }

    const { data, error } = await supabaseAdmin
        .from('employees')
        .insert(parsed.data)
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

    // Update the profile role to manager and assign org
    const { error } = await supabaseAdmin
        .from('profiles')
        .update({ role: 'manager', organization_id: parsed.data.organization_id })
        .eq('id', parsed.data.user_id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: 'Manager assigned successfully' });
});

export default router;
