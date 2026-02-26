/**
 * AttendSys API client — typed fetch wrapper with JWT auth
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('attendsys_token');
}

async function request<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (res.status === 401) {
        // Token expired — clear and redirect
        if (typeof window !== 'undefined') {
            localStorage.removeItem('attendsys_token');
            localStorage.removeItem('attendsys_user');
            window.location.href = '/login';
        }
        throw new Error('Unauthorized');
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data as T;
}

// ── Auth ────────────────────────────────────────────────────
export async function login(email: string, password: string) {
    const data = await request<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('attendsys_token', data.token);
    localStorage.setItem('attendsys_user', JSON.stringify(data.user));
    return data;
}

export function logout() {
    localStorage.removeItem('attendsys_token');
    localStorage.removeItem('attendsys_user');
    window.location.href = '/login';
}

export function getStoredUser(): User | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('attendsys_user');
    return raw ? JSON.parse(raw) : null;
}

// ── Organizations ────────────────────────────────────────────
export const getOrganizations = () =>
    request<{ organizations: Organization[] }>('/api/organizations');

export const createOrganization = (body: Partial<Organization>) =>
    request<{ organization: Organization }>('/api/organizations', {
        method: 'POST', body: JSON.stringify(body),
    });

export const deleteOrganization = (id: number) =>
    request<{ message: string }>(`/api/organizations/${id}`, { method: 'DELETE' });

// ── Employees ────────────────────────────────────────────────
export const getEmployees = () =>
    request<{ employees: Employee[] }>('/api/employees');

export const createEmployee = (body: Partial<Employee>) =>
    request<{ employee: Employee }>('/api/employees', {
        method: 'POST', body: JSON.stringify(body),
    });

export const assignManager = (user_id: string, organization_id: number) =>
    request<{ message: string }>('/api/employees/assign-manager', {
        method: 'POST', body: JSON.stringify({ user_id, organization_id }),
    });

// ── Attendance ───────────────────────────────────────────────
export const getAttendanceSummary = () =>
    request<AttendanceSummary>('/api/attendance/summary');

export const getAttendanceRecords = (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ records: AttendanceRecord[] }>(`/api/attendance${qs}`);
};

// ── Types ────────────────────────────────────────────────────
export interface User {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'manager' | 'employee';
    organization_id?: number;
}

export interface Organization {
    id: number;
    name: string;
    location?: string;
    logo_url?: string;
    created_at: string;
}

export interface Employee {
    id: number;
    name: string;
    email: string;
    department?: string;
    avatar_url?: string;
    organization_id: number;
    created_at: string;
    organizations?: { name: string };
}

export interface AttendanceRecord {
    id: number;
    employee_id: number;
    date: string;
    check_in: string;
    check_out?: string;
    employees?: { name: string; email: string; department?: string };
}

export interface AttendanceSummary {
    date: string;
    total_employees: number;
    present: number;
    absent: number;
    attendance_percentage: number;
}
