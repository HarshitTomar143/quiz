# UPT TGT Hindi Exam Checker

A Next.js quiz application with two parts:

- **Quiz dashboard** (`/quiz`) — play through multiple-choice questions and get a score with a full answer review.
- **Admin panel** (`/admin`) — add and remove questions (password protected).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Prisma ORM → Neon Postgres

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

- `DATABASE_URL` / `DIRECT_URL` — your Neon connection strings.
  In the **Neon** dashboard → your project → **Connection Details**, copy the connection string:
  - `DATABASE_URL` = the **pooled** connection (hostname contains `-pooler`). Used at runtime.
  - `DIRECT_URL` = the **direct** connection (hostname **without** `-pooler`). Used for schema pushes/migrations.
  - Keep the `?sslmode=require` suffix that Neon includes.
- `ADMIN_PASSWORD` — the password required to use the admin panel.

### 3. Create the database tables

```bash
npm run db:push
```

This applies the Prisma schema (the `Question` and `Option` tables) to your database.

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- Go to **Admin** (`/admin`), enter your `ADMIN_PASSWORD`, and add a few questions.
- Go to **Play** (`/quiz`) to take the quiz.

## Useful scripts

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start the dev server                      |
| `npm run build`     | Production build                          |
| `npm run db:push`   | Push the Prisma schema to the database    |
| `npm run db:studio` | Open Prisma Studio to inspect/edit data   |

## How it works

### Data model (`prisma/schema.prisma`)

- `Question` — has text and many `Option`s.
- `Option` — has text and an `isCorrect` flag. Each question has exactly one correct option.

### API routes

| Method & path               | Auth  | Description                           |
| --------------------------- | ----- | ------------------------------------ |
| `GET /api/questions`        | —     | List all questions with options      |
| `POST /api/questions`       | Admin | Create a question                    |
| `DELETE /api/questions/:id` | Admin | Delete a question (cascades options) |
| `POST /api/admin/verify`    | Admin | Check the admin password             |

Admin routes are protected by a simple password sent in the `x-admin-password`
header and checked against `ADMIN_PASSWORD` (see `lib/auth.ts`). The admin UI
stores the password in `localStorage` after a successful unlock.

### A note on scoring

The quiz fetches questions (including which option is correct) and scores
answers in the browser. This keeps things simple, but a determined user could
inspect the network response to find answers. For a high-stakes quiz, move
scoring to a server-side `POST /api/quiz/submit` endpoint and stop sending
`isCorrect` to the client.

## Deploying

Deploy to Vercel and set the same environment variables (`DATABASE_URL`,
`DIRECT_URL`, `ADMIN_PASSWORD`) in the project settings. Use Neon's pooled
connection string (the `-pooler` hostname) for `DATABASE_URL` in serverless
environments.
