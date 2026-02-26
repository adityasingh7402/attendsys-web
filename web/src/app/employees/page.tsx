'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, getEmployees, getOrganizations, createEmployee, logout, type Employee, type Organization } from '@/lib/api';
import Link from 'next/link';

export default function EmployeesPage() {
    const router = useRouter();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [orgs, setOrgs] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', department: '', organization_id: 0 });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');

    useEffect(() => {
        const user = getStoredUser();
        if (!user) { router.push('/login'); return; }
        if (user.role === 'employee') { router.push('/attendance'); return; }

        Promise.all([
            getEmployees(),
            user.role === 'admin' ? getOrganizations() : Promise.resolve({ organizations: [] }),
        ]).then(([empData, orgData]) => {
            setEmployees(empData.employees);
            setOrgs((orgData as { organizations: Organization[] }).organizations);
            if ((orgData as { organizations: Organization[] }).organizations.length > 0) {
                setForm(f => ({ ...f, organization_id: (orgData as { organizations: Organization[] }).organizations[0].id }));
            }
            if (user.role === 'manager' && user.organization_id) {
                setForm(f => ({ ...f, organization_id: user.organization_id! }));
            }
            setLoading(false);
        });
    }, [router]);

    async function handleCreate(e: FormEvent) {
        e.preventDefault();
        setSaving(true); setError('');
        try {
            const data = await createEmployee(form);
            setEmployees(prev => [data.employee, ...prev]);
            setShowForm(false);
            setForm(f => ({ ...f, name: '', email: '', department: '' }));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create');
        } finally {
            setSaving(false);
        }
    }

    const filtered = employees.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.email.toLowerCase().includes(search.toLowerCase()) ||
        (e.department || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard" className="text-gray-400 hover:text-white transition">← Back</Link>
                        <span className="text-gray-600">|</span>
                        <span className="font-bold text-white">Employees</span>
                    </div>
                    <button onClick={() => { logout(); router.push('/login'); }} className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition">Sign out</button>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Employees</h1>
                        <p className="text-gray-400 mt-1">{employees.length} employee{employees.length !== 1 ? 's' : ''} total</p>
                    </div>
                    <div className="flex gap-3">
                        <input
                            value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search employees..."
                            className="px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                        <button
                            id="add-employee-btn"
                            onClick={() => setShowForm(true)}
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-500/20 whitespace-nowrap"
                        >
                            + Add Employee
                        </button>
                    </div>
                </div>

                {/* Modal */}
                {showForm && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                            <h2 className="text-lg font-bold text-white mb-5">Add Employee</h2>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1.5">Full Name *</label>
                                    <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required placeholder="Rahul Sharma"
                                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1.5">Email *</label>
                                    <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required placeholder="rahul@company.com"
                                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1.5">Department</label>
                                    <input value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} placeholder="Engineering"
                                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                                {orgs.length > 0 && (
                                    <div>
                                        <label className="block text-sm text-gray-300 mb-1.5">Organization *</label>
                                        <select value={form.organization_id} onChange={e => setForm(p => ({ ...p, organization_id: Number(e.target.value) }))}
                                            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                        </select>
                                    </div>
                                )}
                                {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 border border-gray-700 rounded-xl text-gray-300 hover:bg-gray-800 transition">Cancel</button>
                                    <button type="submit" disabled={saving} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 rounded-xl text-white font-semibold transition">
                                        {saving ? 'Adding...' : 'Add'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" /></div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        <div className="text-5xl mb-4">👥</div>
                        <p className="text-lg font-medium">{search ? 'No employees found' : 'No employees yet'}</p>
                        <p className="text-sm mt-1">{search ? 'Try a different search' : 'Add your first employee to get started'}</p>
                    </div>
                ) : (
                    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-800">
                                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Employee</th>
                                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">Department</th>
                                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Organization</th>
                                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Joined</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {filtered.map(emp => (
                                    <tr key={emp.id} className="hover:bg-gray-800/50 transition">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                                                    {emp.name[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-white text-sm">{emp.name}</p>
                                                    <p className="text-xs text-gray-400">{emp.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-300 hidden md:table-cell">{emp.department || '–'}</td>
                                        <td className="px-6 py-4 text-sm text-gray-300 hidden lg:table-cell">{emp.organizations?.name || '–'}</td>
                                        <td className="px-6 py-4 text-xs text-gray-500 hidden sm:table-cell">{new Date(emp.created_at).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
