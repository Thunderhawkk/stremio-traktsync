# Deployment Guide - Stremio Trakt Multi-User

This guide covers various deployment options for the Stremio Trakt Multi-User application.

## Quick Start

### Prerequisites

- Node.js 18+ (for local development)
- Docker & Docker Compose (for containerized deployment)
- PostgreSQL 12+ (if not using Docker)
- Nginx (for production reverse proxy)

### Environment Setup

1. Copy the environment template:
   ```bash
   cp .env.production.template .env.production
   ```

2. Fill in your production values in `.env.production`

3. Generate secure secrets:
   ```bash
   # Generate random secrets
   node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"
   ```

## Deployment Options

### Option 1: Docker Compose (Recommended)

**Production deployment with PostgreSQL:**

```bash
# Build and start services
docker-compose up --build -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

**Development deployment:**

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up --build
```

### Option 2: Manual Deployment

**1. Install dependencies:**
```bash
npm ci --only=production
```

**2. Build the application:**
```bash
npm run build
```

**3. Set up database:**
```bash
# Run migrations
npm run migrate

# Seed initial data (optional)
npm run seed
```

**4. Start the application:**
```bash
npm start
```

### Option 3: PM2 Process Manager

**1. Install PM2 globally:**
```bash
npm install -g pm2
```

**2. Start with PM2:**
```bash
# Start application
npm run pm2:start

# Monitor
pm2 monit

# View logs
pm2 logs

# Restart
npm run pm2:restart
```

### Option 4: Systemd Service

**1. Create service file `/etc/systemd/system/stremio-trakt.service`:**

```ini
[Unit]
Description=Stremio Trakt Multi-User Service
After=network.target postgresql.service

[Service]
Type=simple
User=nodeapp
WorkingDirectory=/opt/stremio-trakt-multiuser
EnvironmentFile=/opt/stremio-trakt-multiuser/.env.production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
SyslogIdentifier=stremio-trakt

[Install]
WantedBy=multi-user.target
```

**2. Enable and start:**
```bash
sudo systemctl enable stremio-trakt
sudo systemctl start stremio-trakt
sudo systemctl status stremio-trakt
```

## Production Configuration

### Required Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: JWT signing secret (32+ characters)
- `JWT_REFRESH_SECRET`: Refresh token secret (32+ characters)
- `SESSION_SECRET`: Session secret (32+ characters)
- `TRAKT_CLIENT_ID`: Trakt.tv application client ID
- `TRAKT_CLIENT_SECRET`: Trakt.tv application secret
- `BASE_URL`: Your public domain URL

### Optional OAuth Providers

**Google OAuth:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

**GitHub OAuth:**
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

### Security Recommendations

1. **Use HTTPS in production:**
   ```bash
   COOKIE_SECURE=true
   BASE_URL=https://your-domain.com
   ```

2. **Configure rate limiting:**
   ```bash
   RL_APP_MAX=600
   RL_AUTH_MAX=20
   ```

3. **Set secure session configuration:**
   ```bash
   COOKIE_SAMESITE=strict
   SESSION_IDLE_MINUTES=30
   ```

### Nginx Configuration

1. Copy the provided `nginx.conf` to your Nginx configuration
2. Update domain names and SSL certificate paths
3. Obtain SSL certificates (Let's Encrypt recommended)
4. Restart Nginx

### Database Setup

**PostgreSQL configuration:**

```sql
-- Create database
CREATE DATABASE stremio_trakt;

-- Create user
CREATE USER stremio_user WITH PASSWORD 'secure_password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE stremio_trakt TO stremio_user;
```

### Monitoring & Maintenance

**Health checks:**
```bash
# Manual health check
curl -f http://localhost:8080/healthz

# Automated health check script
npm run health-check
```

**Database maintenance:**
```bash
# Run optimization
npm run db:optimize

# View statistics
npm run db:stats
```

**Log management:**
- Application logs are written to `./logs/` directory
- Configure log rotation for production
- Monitor error logs regularly

### Backup Strategy

**Database backups:**
```bash
# Create backup
pg_dump -U stremio_user stremio_trakt > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
psql -U stremio_user stremio_trakt < backup_20240905_120000.sql
```

**File backups:**
- User data directory (`.data/` if using filesystem storage)
- Configuration files (`.env.production`)
- SSL certificates

### Scaling Considerations

**Horizontal Scaling:**
- Use load balancer (nginx, HAProxy)
- Shared PostgreSQL database
- Session storage in Redis (future enhancement)

**Vertical Scaling:**
- Increase PM2 instances: `instances: 'max'`
- Adjust database connection pool size
- Monitor memory and CPU usage

### Troubleshooting

**Common Issues:**

1. **Port already in use:**
   ```bash
   # Check what's using the port
   lsof -i :8080
   
   # Change port in environment
   PORT=8081
   ```

2. **Database connection failed:**
   - Verify DATABASE_URL format
   - Check PostgreSQL service status
   - Ensure database exists and user has permissions

3. **OAuth redirect errors:**
   - Verify callback URLs in OAuth provider settings
   - Ensure BASE_URL matches your domain
   - Check HTTPS/HTTP configuration

4. **Session issues:**
   - Verify SESSION_SECRET is set
   - Check cookie settings (secure, sameSite)
   - Clear browser cookies and try again

**Performance Issues:**

1. **Slow database queries:**
   ```bash
   # Run database optimization
   npm run db:optimize
   
   # Check database statistics
   npm run db:stats
   ```

2. **High memory usage:**
   - Monitor PM2 processes: `pm2 monit`
   - Adjust max memory restart: `max_memory_restart: '512M'`
   - Review database connection pool settings

3. **Rate limiting issues:**
   - Adjust rate limits in environment variables
   - Consider implementing Redis for distributed rate limiting

### Security Checklist

- [ ] Use HTTPS in production
- [ ] Set secure, random secrets (32+ characters)
- [ ] Configure proper CORS origins
- [ ] Enable rate limiting
- [ ] Set secure cookie options
- [ ] Regular security updates
- [ ] Monitor access logs
- [ ] Implement proper backup strategy
- [ ] Use non-root user for application
- [ ] Configure firewall rules

### Support

For issues and questions:
- Check the troubleshooting section above
- Review application logs in `./logs/`
- Create an issue on the project repository
- Check the project documentation

---

**Note:** Always test your deployment in a staging environment before deploying to production.