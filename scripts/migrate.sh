#!/bin/bash

echo "🔄 Running database migrations..."

if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL is not set"
    exit 1
fi

echo "📊 Database URL: ${DATABASE_URL:0:30}..."

echo "⚙️  Generating Prisma Client..."
npx prisma generate

if [ $? -ne 0 ]; then
    echo "❌ Failed to generate Prisma Client"
    exit 1
fi

echo "🚀 Running migrations..."
npx prisma migrate deploy

if [ $? -eq 0 ]; then
    echo "✅ Migrations completed successfully"
else
    echo "❌ Migrations failed"
    exit 1
fi

