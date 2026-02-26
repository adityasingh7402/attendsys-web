'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, getAttendanceSummary, getOrganizations, getEmployees, logout, type User, type AttendanceSummary, type Organization, type Employee } from '@/lib/api';
import Link from 'next/link';

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [summary, setSummary] = useState<AttendanceSummary | null>(null);
    const [orgCount, setOrgCount] = useState(0);
    const [empCount, setEmpCount] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const stored = getStoredUser();
        if (!stored) { router.push('/login'); return; }
        if (stored.role === 'employee') { router.push('/attendance'); return; }
        setUser(stored);

        Promise.all([
            getAttendanceSummary().catch(() => null),
            stored.role === 'admin' ? getOrganizations().catch(() => null) : Promise.resolve(null),
            getEmployees().catch(() => null),
        ]).then(([sum, orgs, emps]) => {
            if (sum) setSummary(sum);
            if (orgs) setOrgCount((orgs as { organizations: Organization[] }).organizations.length);
            if (emps) setEmpCount((emps as { employees: Employee[] }).employees.length);
            setLoading(false);
        });
    }, [router]);

    if (loading) return <LoadingScreen />;

    const stats = [
        { label: 'Present Today', value: summary?.present ?? '–', icon: '✅', color: 'from-green-500 to-emerald-600', sub: `${summary?.attendance_percentage ?? 0}% attendance` },
        { label: 'Absent Today', value: summary?.absent ?? '–', icon: '❌', color: 'from-red-500 to-rose-600', sub: `${summary?.total_employees ?? 0} total employees` },
        ...(user?.role === 'admin' ? [{ label: 'Organizations', value: orgCount, icon: '🏢', color: 'from-blue-500 to-indigo-600', sub: 'Active organizations' }] : []),
        { label: 'Employees', value: empCount, icon: '👥', color: 'from-purple-500 to-violet-600', sub: user?.role === 'manager' ? 'In your organization' : 'Total across all orgs' },
    ];

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <Navbar user={user!} />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-white">Good morning, {user?.name?.split(' ')[0]} 👋</h1>
                    <p className="text-gray-400 mt-1">Here&apos;s what&apos;s happening today — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {stats.map(stat => (
                        <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition">
                            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} text-xl mb-4`}>
                                {stat.icon}
                            </div>
                            <p className="text-3xl font-bold text-white">{stat.value}</p>
                            <p className="text-sm font-medium text-gray-300 mt-1">{stat.label}</p>
                            <p className="text-xs text-gray-500 mt-1">{stat.sub}</p>
                        </div>
                    ))}
                </div>

                {/* Quick Actions */}
                <div className="mb-8">
                    <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {user?.role === 'admin' && (
                            <Link href="/organizations" className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-indigo-500/50 hover:bg-gray-800 transition group">
                                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center text-2xl group-hover:bg-indigo-500/20 transition">🏢</div>
                                <div>
                                    <p className="font-semibold text-white">Manage Organizations</p>
                                    <p className="text-sm text-gray-400">Add or view organizations</p>
                                </div>
                            </Link>
                        )}
                        <Link href="/employees" className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-purple-500/50 hover:bg-gray-800 transition group">
                            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center text-2xl group-hover:bg-purple-500/20 transition">👥</div>
                            <div>
                                <p className="font-semibold text-white">Manage Employees</p>
                                <p className="text-sm text-gray-400">Add or view employees</p>
                            </div>
                        </Link>
                        <Link href="/reports" className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-green-500/50 hover:bg-gray-800 transition group">
                            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-2xl group-hover:bg-green-500/20 transition">📊</div>
                            <div>
                                <p className="font-semibold text-white">Attendance Reports</p>
                                <p className="text-sm text-gray-400">View monthly charts</p>
                            </div>
                        </Link>
                    </div>
                </div>

                {/* Attendance Bar */}
                {summary && (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-white">Today&apos;s Attendance</h2>
                            <span className="text-sm text-gray-400">{summary.date}</span>
                        </div>
                        <div className="flex items-center gap-4 mb-3">
                            <span className="text-4xl font-bold text-white">{summary.attendance_percentage}%</span>
                            <div className="text-sm text-gray-400">
                                <div>{summary.present} present</div>
                                <div>{summary.absent} absent</div>
                            </div>
                        </div>
                        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-700"
                                style={{ width: `${summary.attendance_percentage}%` }}
                            />
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

function Navbar({ user }: { user: User }) {
    const router = useRouter();
    return (
        <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs font-bold">AS</span>
                    </div>
                    <span className="font-bold text-white text-lg">AttendSys</span>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-400 hidden sm:block">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-medium border border-indigo-500/20">
                            {user.role}
                        </span>
                    </span>
                    <span className="text-sm text-gray-300 font-medium hidden sm:block">{user.name}</span>
                    <button
                        onClick={() => { logout(); router.push('/login'); }}
                        className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition"
                    >
                        Sign out
                    </button>
                </div>
            </div>
        </nav>
    );
}

function LoadingScreen() {
    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">Loading dashboard...</p>
            </div>
        </div>
    );
}
