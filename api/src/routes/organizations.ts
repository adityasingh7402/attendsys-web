import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { authenticate } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

const orgSchema = z.object({
    name: z.string().min(1),
    location: z.string().optional(),
    logo_url: z.string().url().optional(),
});

// ── GET /api/organizations ───────────────────────────────────
router.get('/', authenticate, roleGuard(['admin']), async (_req: Request, res: Response) => {
    const { data, error } = await supabaseAdmin
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ organizations: data });
});

// ── GET /api/organizations/:id ───────────────────────────────
router.get('/:id', authenticate, roleGuard(['admin', 'manager']), async (req: Request, res: Response) => {
    const { id } = req.params;

    // Managers can only view their own org
    if (req.user?.role === 'manager' && req.user.organization_id !== Number(id)) {
        return res.status(403).json({ error: 'You can only view your own organization' });
    }

    const { data, error } = await supabaseAdmin
        .from('organizations')
        .select('*, employees(count)')
        .eq('id', id)
        .single();

    if (error) return res.status(404).json({ error: 'Organization not found' });
    return res.json({ organization: data });
});

// ── POST /api/organizations ──────────────────────────────────
router.post('/', authenticate, roleGuard(['admin']), async (req: Request, res: Response) => {
    const parsed = orgSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { data, error } = await supabaseAdmin
        .from('organizations')
        .insert({ ...parsed.data, created_by: req.user!.id })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ organization: data });
});

// ── PATCH /api/organizations/:id ─────────────────────────────
router.patch('/:id', authenticate, roleGuard(['admin']), async (req: Request, res: Response) => {
    const parsed = orgSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { data, error } = await supabaseAdmin
        .from('organizations')
        .update(parsed.data)
        .eq('id', req.params.id)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ organization: data });
});

// ── DELETE /api/organizations/:id ────────────────────────────
router.delete('/:id', authenticate, roleGuard(['admin']), async (req: Request, res: Response) => {
    const { error } = await supabaseAdmin
        .from('organizations')
        .delete()
        .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ message: 'Organization deleted' });
});

export default router;
