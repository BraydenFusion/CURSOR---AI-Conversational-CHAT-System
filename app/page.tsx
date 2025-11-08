"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-16">
      <section className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          AI Conversational Chat System
        </h1>
        <p className="text-lg text-slate-300">
          Scaffolded Next.js 14 project with Prisma, Tailwind CSS, and
          integrations for OpenAI, Twilio, SendGrid, and Stripe.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card
          title="Admin Dashboard"
          description="Manage conversations, agents, and integrations."
          href="/admin"
        />
        <Card
          title="Chat Widget"
          description="Preview the embeddable chat widget experience."
          href="/widget"
        />
        <Card
          title="API Routes"
          description="Explore the API via /app/api routes."
          href="/api"
        />
        <Card
          title="Developer Docs"
          description="Check the lib directory for utilities and integrations."
          href="https://nextjs.org/docs/app"
        />
      </section>
    </main>
  );
}

interface CardProps {
  title: string;
  description: string;
  href: string;
}

function Card({ title, description, href }: CardProps) {
  const isExternal = href.startsWith("http");
  return (
    <Link
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer" : undefined}
      className="group rounded-xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-slate-700 hover:bg-slate-900"
    >
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </Link>
  );
}

