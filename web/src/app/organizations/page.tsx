'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, getOrganizations, createOrganization, deleteOrganization, logout, type Organization } from '@/lib/api';
import Link from 'next/link';

export default function OrganizationsPage() {
    const router = useRouter();
    const [orgs, setOrgs] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ name: '', location: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const user = getStoredUser();
        if (!user) { router.push('/login'); return; }
        if (user.role !== 'admin') { router.push('/dashboard'); return; }
        fetchOrgs();
    }, [router]);

    async function fetchOrgs() {
        try {
            const data = await getOrganizations();
            setOrgs(data.organizations);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreate(e: FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            const data = await createOrganization(form);
            setOrgs(prev => [data.organization, ...prev]);
            setShowForm(false);
            setForm({ name: '', location: '' });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: number) {
        if (!confirm('Delete this organization? All its employees and records will be removed.')) return;
        await deleteOrganization(id);
        setOrgs(prev => prev.filter(o => o.id !== id));
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard" className="text-gray-400 hover:text-white transition">← Back</Link>
                        <span className="text-gray-600">|</span>
                        <span className="font-bold text-white">Organizations</span>
                    </div>
                    <button onClick={() => { logout(); router.push('/login'); }} className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition">Sign out</button>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Organizations</h1>
                        <p className="text-gray-400 mt-1">{orgs.length} organization{orgs.length !== 1 ? 's' : ''} registered</p>
                    </div>
                    <button
                        id="add-org-btn"
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-500/20"
                    >
                        <span>+</span> Add Organization
                    </button>
                </div>

                {/* Create Form Modal */}
                {showForm && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                            <h2 className="text-lg font-bold text-white mb-5">New Organization</h2>
                            <form onSubmit={handleCreate} className="space-y-4">
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1.5">Organization Name *</label>
                                    <input
                                        value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                        required placeholder="Acme Corp"
                                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1.5">Location</label>
                                    <input
                                        value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                                        placeholder="Mumbai, India"
                                        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3 border border-gray-700 rounded-xl text-gray-300 hover:bg-gray-800 transition">Cancel</button>
                                    <button type="submit" disabled={saving} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 rounded-xl text-white font-semibold transition">
                                        {saving ? 'Creating...' : 'Create'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="flex justify-center py-20">
                        <div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                    </div>
                ) : orgs.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        <div className="text-5xl mb-4">🏢</div>
                        <p className="text-lg font-medium">No organizations yet</p>
                        <p className="text-sm mt-1">Create your first organization to get started</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {orgs.map(org => (
                            <div key={org.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-700 transition">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-xl font-bold text-white">
                                        {org.name[0]}
                                    </div>
                                    <button
                                        onClick={() => handleDelete(org.id)}
                                        className="text-gray-600 hover:text-red-400 transition p-1"
                                        title="Delete organization"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                                <h3 className="font-semibold text-white text-lg">{org.name}</h3>
                                {org.location && <p className="text-sm text-gray-400 mt-1">📍 {org.location}</p>}
                                <p className="text-xs text-gray-600 mt-3">Created {new Date(org.created_at).toLocaleDateString()}</p>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
