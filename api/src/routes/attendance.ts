import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../config/supabase';
import { authenticate } from '../middleware/auth';
import { roleGuard } from '../middleware/roleGuard';

const router = Router();

// ── GET /api/attendance ──────────────────────────────────────
router.get('/', authenticate, async (req: Request, res: Response) => {
    const { from, to, employee_id, organization_id } = req.query;

    let query = supabaseAdmin
        .from('attendance_records')
        .select('*, employees(name, email, department, organizations(name))')
        .order('date', { ascending: false });

    // Employees can only see their own records
    if (req.user?.role === 'employee') {
        const { data: emp } = await supabaseAdmin
            .from('employees')
            .select('id')
            .eq('user_id', req.user.id)
            .single();

        if (!emp) return res.status(404).json({ error: 'Employee record not found' });
        query = query.eq('employee_id', emp.id);
    }

    // Managers only see their org
    if (req.user?.role === 'manager' && req.user.organization_id) {
        query = query.eq('employees.organization_id', req.user.organization_id);
    }

    // Optional filters
    if (from) query = query.gte('date', from as string);
    if (to) query = query.lte('date', to as string);
    if (employee_id && req.user?.role !== 'employee') query = query.eq('employee_id', employee_id as string);
    if (organization_id && req.user?.role === 'admin') query = query.eq('employees.organization_id', organization_id as string);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ records: data });
});

// ── POST /api/attendance/checkin ─────────────────────────────
router.post('/checkin', authenticate, async (req: Request, res: Response) => {
    const schema = z.object({
        employee_id: z.number(),
        check_in: z.string().datetime().optional(), // ISO string, defaults to now
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const today = new Date().toISOString().split('T')[0];
    const checkIn = parsed.data.check_in || new Date().toISOString();

    // Check for existing record today
    const { data: existing } = await supabaseAdmin
        .from('attendance_records')
        .select('id, check_in, check_out')
        .eq('employee_id', parsed.data.employee_id)
        .eq('date', today)
        .single();

    if (existing) {
        return res.status(409).json({
            error: 'Already checked in today',
            record: existing,
        });
    }

    const { data, error } = await supabaseAdmin
        .from('attendance_records')
        .insert({
            employee_id: parsed.data.employee_id,
            date: today,
            check_in: checkIn,
            is_synced: true,
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ record: data });
});

// ── POST /api/attendance/checkout ────────────────────────────
router.post('/checkout', authenticate, async (req: Request, res: Response) => {
    const schema = z.object({
        employee_id: z.number(),
        check_out: z.string().datetime().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const today = new Date().toISOString().split('T')[0];
    const checkOut = parsed.data.check_out || new Date().toISOString();

    const { data: existing } = await supabaseAdmin
        .from('attendance_records')
        .select('id, check_in, check_out')
        .eq('employee_id', parsed.data.employee_id)
        .eq('date', today)
        .single();

    if (!existing) {
        return res.status(404).json({ error: 'No check-in found for today. Please check in first.' });
    }

    if (existing.check_out) {
        return res.status(409).json({ error: 'Already checked out today', record: existing });
    }

    const { data, error } = await supabaseAdmin
        .from('attendance_records')
        .update({ check_out: checkOut })
        .eq('id', existing.id)
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ record: data });
});

// ── GET /api/attendance/summary ───────────────────────────────
router.get('/summary', authenticate, roleGuard(['admin', 'manager']), async (req: Request, res: Response) => {
    const today = new Date().toISOString().split('T')[0];

    let employeeQuery = supabaseAdmin.from('employees').select('id');
    if (req.user?.role === 'manager' && req.user.organization_id) {
        employeeQuery = employeeQuery.eq('organization_id', req.user.organization_id);
    }

    const { data: employees } = await employeeQuery;
    const totalEmployees = employees?.length || 0;

    const { data: presentToday } = await supabaseAdmin
        .from('attendance_records')
        .select('id')
        .eq('date', today)
        .in('employee_id', employees?.map(e => e.id) || []);

    const totalPresent = presentToday?.length || 0;
    const percentage = totalEmployees > 0 ? Math.round((totalPresent / totalEmployees) * 100) : 0;

    return res.json({
        date: today,
        total_employees: totalEmployees,
        present: totalPresent,
        absent: totalEmployees - totalPresent,
        attendance_percentage: percentage,
    });
});

// ── GET /api/attendance/daily ────────────────────────────────
router.get('/daily', authenticate, roleGuard(['admin', 'manager']), async (req: Request, res: Response) => {
    const today = new Date().toISOString().split('T')[0];

    // 1. Fetch all employees (filter by org if manager or explicitly requested)
    let employeeQuery = supabaseAdmin.from('employees').select('id, name, department, profile_picture_url, role');
    const orgId = req.query.organization_id || (req.user?.role === 'manager' ? req.user.organization_id : null);
    if (orgId) {
        employeeQuery = employeeQuery.eq('organization_id', orgId);
    }

    const { data: employees, error: empErr } = await employeeQuery;
    if (empErr) return res.status(500).json({ error: empErr.message });

    if (!employees || employees.length === 0) {
        return res.json({ present: [], absent: [] });
    }

    // 2. Fetch today's records for these employees
    const { data: records, error: recErr } = await supabaseAdmin
        .from('attendance_records')
        .select('*')
        .eq('date', today)
        .in('employee_id', employees.map(e => e.id));

    if (recErr) return res.status(500).json({ error: recErr.message });

    // 3. Map into Present vs Absent
    const present: any[] = [];
    const absent: any[] = [];

    for (const emp of employees) {
        const record = records?.find(r => r.employee_id === emp.id);
        const empData = {
            id: emp.id,
            name: emp.name,
            department: emp.department,
            profile_picture_url: emp.profile_picture_url,
            record: record || null
        };

        // If there's a record and they aren't marked explicitly absent, they are present
        if (record && !record.is_absent) {
            present.push(empData);
        } else {
            absent.push(empData);
        }
    }

    // Sort present by check_in time descending (most recent first)
    present.sort((a, b) => {
        if (!a.record?.check_in) return 1;
        if (!b.record?.check_in) return -1;
        return new Date(b.record.check_in).getTime() - new Date(a.record.check_in).getTime();
    });

    return res.json({ present, absent });
});

// ── POST /api/attendance/absent ──────────────────────────────
router.post('/absent', authenticate, roleGuard(['admin', 'manager']), async (req: Request, res: Response) => {
    const schema = z.object({
        employee_id: z.number(),
        date: z.string().optional(), // defaults to today
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const date = parsed.data.date || new Date().toISOString().split('T')[0];

    // Check for existing record
    const { data: existing } = await supabaseAdmin
        .from('attendance_records')
        .select('id, check_in, check_out, is_absent')
        .eq('employee_id', parsed.data.employee_id)
        .eq('date', date)
        .single();

    if (existing) {
        return res.status(409).json({ error: 'Attendance record already exists for today', record: existing });
    }

    const { data, error } = await supabaseAdmin
        .from('attendance_records')
        .insert({
            employee_id: parsed.data.employee_id,
            date,
            is_absent: true,
            is_synced: true,
        })
        .select()
        .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ record: data });
});

export default router;
