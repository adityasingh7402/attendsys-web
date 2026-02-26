'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredUser, getAttendanceRecords, logout, type AttendanceRecord } from '@/lib/api';
import Link from 'next/link';

interface DayData { date: string; present: number; absent: number; total: number; }

export default function ReportsPage() {
    const router = useRouter();
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [monthData, setMonthData] = useState<DayData[]>([]);

    useEffect(() => {
        const user = getStoredUser();
        if (!user) { router.push('/login'); return; }
        if (user.role === 'employee') { router.push('/attendance'); return; }

        // Get last 30 days
        const to = new Date().toISOString().split('T')[0];
        const fromDate = new Date(); fromDate.setDate(fromDate.getDate() - 30);
        const from = fromDate.toISOString().split('T')[0];

        getAttendanceRecords({ from, to }).then(data => {
            setRecords(data.records);
            // Group by date
            const byDate: Record<string, number> = {};
            data.records.forEach(r => {
                byDate[r.date] = (byDate[r.date] || 0) + 1;
            });
            // Build last 30 days
            const days: DayData[] = [];
            for (let i = 29; i >= 0; i--) {
                const d = new Date(); d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                days.push({ date: dateStr, present: byDate[dateStr] || 0, absent: 0, total: 0 });
            }
            setMonthData(days);
            setLoading(false);
        });
    }, [router]);

    const maxPresent = Math.max(...monthData.map(d => d.present), 1);
    const totalPresent = monthData.reduce((s, d) => s + d.present, 0);
    const avgPerDay = monthData.length > 0 ? Math.round(totalPresent / monthData.length) : 0;

    return (
        <div className="min-h-screen bg-gray-950 text-white">
            <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard" className="text-gray-400 hover:text-white transition">← Back</Link>
                        <span className="text-gray-600">|</span>
                        <span className="font-bold text-white">Attendance Reports</span>
                    </div>
                    <button onClick={() => { logout(); router.push('/login'); }} className="text-sm text-gray-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition">Sign out</button>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-white">Attendance Reports</h1>
                    <p className="text-gray-400 mt-1">Last 30 days overview</p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    {[
                        { label: 'Total Check-ins', value: totalPresent, icon: '✅', color: 'from-green-500 to-emerald-600' },
                        { label: 'Avg per Day', value: avgPerDay, icon: '📅', color: 'from-blue-500 to-indigo-600' },
                        { label: 'Days Tracked', value: monthData.length, icon: '📊', color: 'from-purple-500 to-violet-600' },
                    ].map(s => (
                        <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                            <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${s.color} text-xl mb-4`}>{s.icon}</div>
                            <p className="text-3xl font-bold text-white">{s.value}</p>
                            <p className="text-sm text-gray-400 mt-1">{s.label}</p>
                        </div>
                    ))}
                </div>

                {/* Bar Chart */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8">
                    <h2 className="text-lg font-semibold text-white mb-6">Daily Attendance — Last 30 Days</h2>
                    {loading ? (
                        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" /></div>
                    ) : (
                        <div className="flex items-end gap-1 h-48 overflow-x-auto pb-2">
                            {monthData.map(day => (
                                <div key={day.date} className="flex flex-col items-center gap-1 flex-1 min-w-[20px] group relative">
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-800 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap z-10 border border-gray-700">
                                        {day.date}: {day.present} present
                                    </div>
                                    <div
                                        className="w-full bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-t-sm transition-all duration-300 hover:from-indigo-500 hover:to-indigo-300 min-h-[4px]"
                                        style={{ height: `${(day.present / maxPresent) * 100}%` }}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex justify-between text-xs text-gray-600 mt-2">
                        <span>30 days ago</span>
                        <span>Today</span>
                    </div>
                </div>

                {/* Recent Records Table */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-800">
                        <h2 className="text-lg font-semibold text-white">Recent Records</h2>
                    </div>
                    {records.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <p>No attendance records found</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-800">
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase">Employee</th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase">Date</th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase hidden sm:table-cell">Check In</th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 uppercase hidden sm:table-cell">Check Out</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {records.slice(0, 20).map(r => (
                                    <tr key={r.id} className="hover:bg-gray-800/50 transition">
                                        <td className="px-6 py-4 text-sm text-white">{r.employees?.name || `Employee #${r.employee_id}`}</td>
                                        <td className="px-6 py-4 text-sm text-gray-300">{r.date}</td>
                                        <td className="px-6 py-4 text-sm text-gray-300 hidden sm:table-cell">
                                            {new Date(r.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-4 hidden sm:table-cell">
                                            {r.check_out ? (
                                                <span className="text-sm text-gray-300">{new Date(r.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 bg-green-500/10 text-green-400 rounded-full border border-green-500/20">
                                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                                                    Active
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </main>
        </div>
    );
}
