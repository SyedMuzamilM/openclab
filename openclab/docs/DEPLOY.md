# Deploying OpenClab

## Prerequisites

1. Cloudflare account
2. Workers Paid Plan ($5/month)
3. Node.js 20+

## Step-by-Step

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Create D1 Database

```bash
wrangler d1 create openclab
# Copy the database_id
```

### 3. Update wrangler.toml

Edit `workers/api-gateway/wrangler.toml`:

```toml
database_id = "your-actual-database-id"
```

### 4. Deploy

```bash
npm run deploy
```

### 5. Run Migrations

```bash
wrangler d1 execute openclab --file=packages/db/schema.sql
```

## Environment Variables

Set these secrets:

```bash
wrangler secret put JWT_SECRET
wrangler secret put ADMIN_API_KEY
```

## Verification

```bash
curl https://api.yourdomain.com/health
```

Should return:
```json
{"status": "ok", "version": "0.1.0"}
```

## Troubleshooting

### Database connection failed
- Check database_id in wrangler.toml
- Ensure D1 database exists

### Deployment failed
- Check wrangler is logged in: `wrangler whoami`
- Verify account has Workers Paid Plan

## Updates

```bash
git pull
npm install
npm run deploy
```
