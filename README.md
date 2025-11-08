# AI Conversational Chat System

Scaffolded Next.js 14 project with TypeScript, Tailwind CSS, Prisma ORM, and integrations for OpenAI, Twilio, SendGrid, and Stripe.

## Stack

- Next.js 14 (App Router)
- React 18 / TypeScript
- Tailwind CSS
- Prisma ORM (PostgreSQL)
- Integrations: OpenAI, Twilio, SendGrid, Stripe

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `env.example` to `.env` and fill the required secrets.

3. Generate Prisma client and run database migrations:

   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

4. Run the development server:

   ```bash
   npm run dev
   ```

## Project Structure

- `app/api` – route handlers for server APIs
- `app/admin` – admin dashboard pages
- `app/widget` – embeddable chat widget preview
- `components/chat` – chat-related UI components
- `components/admin` – admin dashboard components
- `lib` – utilities, Prisma client, and third-party integrations
- `prisma` – Prisma schema and migrations

