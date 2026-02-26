import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';

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

    try {
        // Verify token against Supabase — returns the user if valid
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
