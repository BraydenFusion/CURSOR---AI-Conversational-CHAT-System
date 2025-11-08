"use client";

import AdminDashboard from "@/components/admin/AdminDashboard";

export default function AdminPage() {
  return (
    <main className="flex min-h-screen flex-col bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-4">
        <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-sm text-slate-400">
          Manage conversations, agents, integrations, and analytics.
        </p>
      </header>
      <section className="flex-1 overflow-y-auto px-6 py-8">
        <AdminDashboard />
      </section>
    </main>
  );
}

