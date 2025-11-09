#!/bin/bash

echo "🔍 Validating Railway deployment..."

if [ -z "$1" ]; then
    echo "❌ Please provide Railway app URL"
    echo "Usage: ./scripts/validate-deploy.sh https://your-app.railway.app"
    exit 1
fi

APP_URL=$1

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "\n${YELLOW}[1/5]${NC} Testing health check endpoint..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/health")

if [ "$HEALTH_RESPONSE" == "200" ]; then
    echo -e "${GREEN}✅ Health check passed${NC}"
    curl -s "$APP_URL/api/health" | jq
else
    echo -e "${RED}❌ Health check failed (Status: $HEALTH_RESPONSE)${NC}"
fi

echo -e "\n${YELLOW}[2/5]${NC} Checking database connection..."
DB_STATUS=$(curl -s "$APP_URL/api/health" | jq -r '.services.database')

if [ "$DB_STATUS" == "healthy" ]; then
    echo -e "${GREEN}✅ Database connected${NC}"
else
    echo -e "${RED}❌ Database connection failed${NC}"
fi

echo -e "\n${YELLOW}[3/5]${NC} Checking Redis connection..."
REDIS_STATUS=$(curl -s "$APP_URL/api/health" | jq -r '.services.redis')

if [ "$REDIS_STATUS" == "healthy" ]; then
    echo -e "${GREEN}✅ Redis connected${NC}"
else
    echo -e "${RED}❌ Redis connection failed${NC}"
fi

echo -e "\n${YELLOW}[4/5]${NC} Checking OpenAI configuration..."
OPENAI_STATUS=$(curl -s "$APP_URL/api/health" | jq -r '.services.openai')

if [ "$OPENAI_STATUS" == "configured" ]; then
    echo -e "${GREEN}✅ OpenAI configured${NC}"
else
    echo -e "${RED}❌ OpenAI not configured${NC}"
fi

echo -e "\n${YELLOW}[5/5]${NC} Checking SSL certificate..."
if [[ $APP_URL == https* ]]; then
    SSL_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL")
    if [ "$SSL_RESPONSE" == "200" ] || [ "$SSL_RESPONSE" == "404" ]; then
        echo -e "${GREEN}✅ SSL certificate valid${NC}"
    else
        echo -e "${RED}❌ SSL certificate issue${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Using HTTP (not recommended for production)${NC}"
fi

echo -e "\n${GREEN}🎉 Validation complete!${NC}"

