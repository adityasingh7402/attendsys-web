import { Request, Response, NextFunction } from 'express';
import { AuthUser } from './auth';

type Role = 'admin' | 'manager' | 'employee';

/**
 * Middleware factory — only lets through users with one of the allowed roles.
 * Usage: router.get('/path', authenticate, roleGuard(['admin', 'manager']), handler)
 */
export function roleGuard(allowedRoles: Role[]) {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = req.user as AuthUser | undefined;

        if (!user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (!allowedRoles.includes(user.role)) {
            return res.status(403).json({
                error: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
                yourRole: user.role,
            });
        }

        next();
    };
}
