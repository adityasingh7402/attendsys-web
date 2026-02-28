import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import jwt from 'jsonwebtoken';

export interface AuthUser {
    id: string;
    email: string;
    role: 'admin' | 'manager' | 'employee';
    organization_id?: number;
}

// Extend Express Request to carry the authenticated user
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET || 'super-secret-key-change-in-production';

    try {
        // First: try verifying as a custom JWT (for managers/employees)
        try {
            const decoded = jwt.verify(token, jwtSecret) as {
                sub: string;
                email: string;
                role: 'admin' | 'manager' | 'employee';
                organization_id?: number;
            };

            // Custom JWT verified — set req.user directly from token payload
            req.user = {
                id: decoded.sub,
                email: decoded.email,
                role: decoded.role,
                organization_id: decoded.organization_id,
            };

            // If org_id is missing from token, try fetching from employees table
            if (!req.user.organization_id && req.user.role !== 'admin') {
                const { data: emp } = await supabaseAdmin
                    .from('employees')
                    .select('organization_id')
                    .eq('email', decoded.email)
                    .single();
                if (emp?.organization_id) {
                    req.user.organization_id = emp.organization_id;
                }
            }

            return next();
        } catch {
            // Not a valid custom JWT — fall through to Supabase verification
        }

        // Second: try verifying as a Supabase token (for admins)
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        // Fetch the user's profile to get their role and org
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('role, organization_id')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            return res.status(401).json({ error: 'User profile not found' });
        }

        req.user = {
            id: user.id,
            email: user.email!,
            role: profile.role,
            organization_id: profile.organization_id,
        };

        next();
    } catch (err) {
        console.error('[auth middleware]', err);
        return res.status(500).json({ error: 'Authentication failed' });
    }
}
