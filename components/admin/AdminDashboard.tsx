"use client";

import Link from "next/link";
import { useMemo } from "react";

const sections = [
  {
    title: "Conversations",
    description: "Monitor live chats and review historical transcripts.",
    href: "#conversations"
  },
  {
    title: "Agents",
    description: "Configure AI behaviors, routing rules, and availability.",
    href: "#agents"
  },
  {
    title: "Integrations",
    description: "Manage OpenAI, Twilio, SendGrid, and Stripe credentials.",
    href: "#integrations"
  },
  {
    title: "Analytics",
    description: "Track KPIs, user satisfaction, and revenue performance.",
    href: "#analytics"
  }
];

export default function AdminDashboard() {
  const stats = useMemo(
    () => [
      { label: "Active Agents", value: 4 },
      { label: "Open Conversations", value: 12 },
      { label: "Avg. Response Time", value: "1.2s" },
      { label: "Monthly Revenue", value: "$12.4k" }
    ],
    []
  );

  return (
    <div className="space-y-8">
      <section className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-6 md:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {stat.label}
            </p>
            <p className="text-2xl font-semibold text-white">{stat.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {sections.map((section) => (
          <article
            key={section.title}
            className="group flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-950/50 p-6 transition hover:border-indigo-500/60 hover:bg-slate-950/80"
            id={section.href.slice(1)}
          >
            <header>
              <h2 className="text-xl font-semibold text-white">
                {section.title}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {section.description}
              </p>
            </header>
            <footer className="mt-4">
              <Link
                href={section.href}
                className="text-sm font-medium text-indigo-400 transition group-hover:text-indigo-300"
              >
                View details →
              </Link>
            </footer>
          </article>
        ))}
      </section>
    </div>
  );
}

