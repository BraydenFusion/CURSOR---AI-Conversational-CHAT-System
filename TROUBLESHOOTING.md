# Troubleshooting Guide

## Common Issues and Solutions

### 1. Database Connection Errors

**Error:** `Can't reach database server`

**Solutions:**
- Check `DATABASE_URL` is set correctly in Railway environment variables
- Verify PostgreSQL service is running in Railway dashboard
- Test connection locally with `npx prisma db pull`
- Check Railway logs for database service issues

**Validation:**
```bash
curl https://your-app.railway.app/api/health
```

---

### 2. Redis Connection Errors

**Error:** `ECONNREFUSED` or `Redis connection timeout`

**Solutions:**
- Verify `REDIS_URL` format: `redis://default:password@host:6379`
- Check Redis service is running in Railway
- Ensure no firewall blocks port 6379
- Inspect worker service logs for authentication errors

**Validation:**
```bash
curl https://your-app.railway.app/api/health | jq '.services.redis'
```

---

### 3. Build Failures

**Error:** `Module not found` during build

**Solutions:**
- Clear Railway build cache: Settings → Clear Cache
- Confirm dependencies listed in `package.json`
- Ensure `npm run db:generate` executes during build (handled in Nixpacks)
- Verify Node version is 18.x

**Validation:**
```bash
npm run build
```

---

### 4. Environment Variables Not Loading

**Error:** `Environment variable X is not defined`

**Solutions:**
- Check Railway Variables tab for missing entries
- Restart service after adding variables
- Verify variable names and casing
- Review `lib/env.ts` validation output in logs

**Validation:**
```bash
echo $DATABASE_URL
```

---

### 5. Worker Not Processing Jobs

**Error:** Jobs stuck in queue

**Solutions:**
- Confirm worker service is deployed and running
- Tail worker logs for startup confirmation
- Ensure Redis connection succeeds
- Verify jobs are being added to queues

**Validation:**
```text
# Railway dashboard → Worker service → Logs
# Look for: "🚀 Workers started successfully"
```

---

### 6. Worker Builds or Jobs Failing

**Error:** Docker build fails or jobs crash with minimal context

**Solutions:**
- Check worker build logs for Prisma schema or dependency errors (the worker Dockerfile mirrors the web build; look for "schema.prisma not found" or missing environment vars).
- Worker now logs unhandled promise rejections and uncaught exceptions. Re-run the failing job and inspect the payload printed after `Job payload:` to reproduce locally.
- Ensure the worker has `DATABASE_URL` and `REDIS_URL` set in Railway; missing either will terminate the process on boot.
- For inventory imports, confirm CSV headers match expectations—invalid rows show up in the job result under `errors`.
- Use `railway run node worker.js` locally with the same environment variables to replicate issues.

**Validation:**
```bash
# Tail worker job status
railway logs --service worker --since 10m

# Check a specific job
curl https://<app-url>/api/admin/inventory/import/<jobId>
```

---

### 6. OpenAI API Errors

**Error:** `401 Unauthorized` or `Rate limit exceeded`

**Solutions:**
- Verify `OPENAI_API_KEY` correctness
- Confirm billing/credits are active for the key
- Implement rate limiting/backoff if necessary

**Validation:**
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

---

### 7. Twilio SMS Not Sending

**Error:** `Authentication failed` or `Phone number not verified`

**Solutions:**
- Confirm `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- Verify sender number format (`+1234567890`)
- In trial mode, ensure recipient numbers are verified
- Review Twilio console for detailed error logs

**Validation:**
```bash
curl -X GET "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN"
```

---

### 8. Migration Failures

**Error:** `Migration failed to apply`

**Solutions:**
- Check database permissions
- Ensure migration history is in sync
- Use `npx prisma migrate reset` to rebuild locally if needed
- Validate `prisma/schema.prisma` syntax

**Validation:**
```bash
npx prisma migrate status
```

---

## Railway-Specific Issues

### Service Won't Start
1. Review deployment logs in Railway
2. Verify `start` command in `package.json`
3. Ensure `/api/health` responds correctly
4. Confirm port `3000` is exposed

### Service Keeps Restarting
1. Check logs for uncaught exceptions
2. Verify database migrations completed
3. Review resource usage (CPU/RAM)
4. Ensure environment variables are present

### Slow Performance
1. Confirm Prisma connection pooling is enabled (`lib/prisma.ts`)
2. Add database indexes for heavy queries
3. Utilize Redis caching utilities
4. Monitor Railway metrics for bottlenecks

---

## Debug Commands

### Check Health Status
```bash
curl https://your-app.railway.app/api/health | jq
```

### View Recent Logs (Railway CLI)
```bash
railway logs --service web
railway logs --service worker
```

### Test Database Connection
```bash
railway run npx prisma db pull
```

### Test Redis Connection
```bash
railway run node -e "const Redis = require('ioredis'); const redis = new Redis(process.env.REDIS_URL); redis.ping().then(console.log);"
```

---

## Getting Help
1. Inspect Railway service logs
2. Review this troubleshooting guide
3. Confirm environment variable configuration
4. Test individual services using the commands above
5. Reach out via Railway support or project issue tracker

## Contact
- Railway Support: https://help.railway.app
- Project Issues: `<your-repo>/issues`

