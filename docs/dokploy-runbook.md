# Dokploy runbook

This takes MyanLex from an empty server to running in production, then covers
the everyday tasks: release, roll back, run a job, restore, and rotate secrets.
The decision and costs are in [0027](decisions/0027-self-hosted-dokploy.md);
image details are in the [deployment runbook](deployment.md).

> Status: prepared, not yet run against a real server. Dokploy's menus move a
> little between versions; if a label doesn't match your screen, look for the
> same idea nearby.

**Time:** about two hours the first time.

**You need:**

- a domain on Cloudflare;
- this GitHub repository;
- a card for the VPS (US$5–12 a month);
- free accounts at Cloudflare R2, Resend and Healthchecks.io.

Throughout:

- replace `example.com` with your domain;
- replace `your-github-user` with the repository owner, in lower case;
- container names (`myanlex-production-api-1`…) assume `STACK_NAME=production`,
  so check `docker ps` on your server.

---

## 1. Server

1. **Create a VPS:** Ubuntu 24.04 with 4 GB RAM (2 vCPU is enough). Add your SSH
   key while creating it, and don't use password login.
2. **Update the server and turn on automatic security updates:**

   ```bash
   ssh root@<server-ip>
   apt update && apt -y upgrade && apt -y install unattended-upgrades
   dpkg-reconfigure -plow unattended-upgrades
   ```

3. **Swap** (a safety net on small servers):

   ```bash
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```

4. **Turn off password SSH:** in `/etc/ssh/sshd_config`, set
   `PasswordAuthentication no`, then run `systemctl reload ssh`.
5. **Firewall** (your provider's firewall is easiest):
   - port 22 from your IP;
   - port 3000 from your IP, until step 2 gives the Dokploy dashboard a domain;
   - ports 80 and 443 **only from
     [Cloudflare's IP ranges](https://www.cloudflare.com/ips/)**.

   The Cloudflare-only rule matters: it means only Cloudflare can claim a client
   address (see [Client addresses](#client-addresses)). Open 80 to everyone just
   while the first certificates are issued (step 9).

## 2. Dokploy

1. Install it (this also installs Docker):

   ```bash
   curl -sSL https://dokploy.com/install.sh | sh
   ```

2. Open `http://<server-ip>:3000`, create the **admin account** with a strong
   password, and turn on **2FA** under your profile.
3. **Give the dashboard a domain:**
   - Add a DNS record `dokploy.example.com` pointing to the server (step 3).
   - In **Settings → Web Server → Domain**, enter it and enable HTTPS.
   - Once `https://dokploy.example.com` works, close port 3000.
4. **Settings → Cleanup:** turn on daily cleanup of unused images.

## 3. Cloudflare DNS

Add **A** records pointing to the server IP:

| Name                                             | Purpose                  |
| ------------------------------------------------ | ------------------------ |
| `console`                                        | the portal, port 3000    |
| `api`                                            | the API, port 3001       |
| `docs`                                           | the docs site, port 3002 |
| `dokploy`                                        | the Dokploy dashboard    |
| `console.staging`, `api.staging`, `docs.staging` | staging, if you run it   |

1. Start with **DNS only** (grey cloud), so Let's Encrypt can reach the server
   for the first certificates.
2. After the first deploy (step 9), switch them to **Proxied** (orange cloud).
3. Set **SSL/TLS → Overview** to **Full (strict)**, and turn on **Always use
   HTTPS** and **HSTS** (start with a max-age of 1 month).

## 4. Backups bucket (Cloudflare R2)

PostgreSQL runs on this server, so this bucket holds the copy that survives
losing it.

1. **R2 → Create bucket** `myanlex-production-backups`. Make it private, with
   location Automatic.
2. **R2 → Manage API tokens → Create API token** with **Object Read & Write** on
   this bucket only. Note the access key ID, the secret and the endpoint
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
3. On the bucket, add a **lifecycle rule** that deletes objects after 30 days.
   It's a second line of defence beside `BACKUP_RETENTION_DAYS=14`.

## 5. Email (Resend)

1. **Domains → Add domain.** Add the SPF, DKIM and DMARC records it shows in
   Cloudflare as **DNS only**, and wait for **Verified**.
2. **API Keys → Create** with sending access.
3. Your values:
   - `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`;
   - `SMTP_USER=resend`;
   - `SMTP_PASSWORD=<API key>`;
   - `SMTP_FROM=no-reply@example.com`, a plain address on the verified domain.

## 6. Heartbeat (Healthchecks.io)

1. Create a check named `myanlex-production daily` with **Period 1 day** and
   **Grace 1 hour**. The cron is `30 0 * * *` UTC.
2. Add your email (or Telegram) as an integration.
3. Copy the ping URL into `MYANLEX_HEARTBEAT_URL`. Treat it as a secret: anyone
   with it can mark runs as healthy.

## 7. GitHub: registry, environments, variables

1. **Let the server pull images.** Skip this if the packages are public.
   - In GitHub, go to **Settings → Developer settings → Personal access tokens
     (classic)** and create a token with only `read:packages`.
   - On the server, run:

     ```bash
     echo '<TOKEN>' | docker login ghcr.io -u your-github-user --password-stdin
     ```

   - Also add it in Dokploy under **Settings → Registry**.
2. **Repository → Settings → Environments:** create `staging` and `production`.
   On `production`, add yourself as a **Required reviewer**.
3. **Settings → Secrets and variables → Actions → Variables:**

   | Name                            | Example                       |
   | ------------------------------- | ----------------------------- |
   | `PRODUCTION_CONSOLE_URL`        | `https://console.example.com` |
   | `PRODUCTION_API_URL`            | `https://api.example.com`     |
   | `PRODUCTION_DOCS_URL`           | `https://docs.example.com`    |
   | `STAGING_CONSOLE_URL` and so on | the staging URLs              |

4. **Environment secrets** (on each environment):
   - `DOKPLOY_WEBHOOK`, added in step 8;
   - `SMOKE_API_KEY` (optional), a project key with `text.normalize` from a
     dedicated smoke-test workspace.

## 8. The MyanLex app in Dokploy

1. **Projects → Create project** `myanlex-production`, then **Create service →
   Compose**, named `myanlex`.
2. **General → Provider:** GitHub, pointing at this repository.
   - **Branch:** `main`.
   - **Compose path:** `./infra/compose.production.yaml`.
   - **Compose type:** Docker Compose.
   - Turn **Autodeploy off**. Deploys come from the workflow after approval.
3. **Environment:** paste
   [`infra/.env.production.example`](../infra/.env.production.example) and
   replace every placeholder.
   - Generate secrets with `openssl rand -base64 48 | tr -d '/+=' | cut -c1-48`.
   - Keep `MYANLEX_TRUST_PROXY=false` until
     [Client addresses](#client-addresses) is done.
   - Then save.
4. **Domains → Add domain**, three times, each with HTTPS on and Let's Encrypt:
   - `console.example.com` → service `web`, port 3000;
   - `api.example.com` → service `api`, port 3001;
   - `docs.example.com` → service `docs`, port 3002.

   Never add a domain for `/internal/metrics`.

5. **Deployments → Webhook:** copy the URL into the GitHub `production`
   environment secret `DOKPLOY_WEBHOOK`.

**Staging (optional, same server):** repeat step 8 with these changes:

- the project `myanlex-staging`;
- `STACK_NAME=staging` and `IMAGE_TAG=staging`;
- the staging domains;
- its own secrets, bucket prefix (`BACKUP_S3_PREFIX=staging`) and heartbeat
  check.

## 9. First deploy

1. In GitHub, go to **Actions → Deploy → Run workflow**, choose **production**,
   and approve.
   - It builds the four images and scans the API and web images for critical
     vulnerabilities.
   - It tags the build and calls Dokploy.
   - Dokploy pulls the images and runs `migrate` (`config:check`, then the
     migrations).
   - It then starts the API, console, docs and jobs.
   - `infra/smoke.sh` waits for the new build and checks:
     - readiness;
     - the sign-in page and auth;
     - the docs;
     - that metrics aren't public.
2. **Seed the permissions and the Free plan once** (later deploys don't need
   it):

   ```bash
   docker exec myanlex-production-jobs-1 pnpm db:seed
   ```

3. **Create the paid plans** (see
   [plans and pricing](operations.md#plans-and-pricing)):

   ```bash
   docker cp pro.json myanlex-production-jobs-1:/tmp/pro.json
   docker exec myanlex-production-jobs-1 pnpm billing:plans upsert /tmp/pro.json
   ```

4. Open `https://console.example.com`, **register** your owner account and
   create your workspace.
5. Switch the Cloudflare records to **Proxied**, and limit ports 80 and 443 to
   Cloudflare (step 1).
6. Do the [client address](#client-addresses) step.
7. **Test the jobs and the backup now**, while there's nothing to lose:

   ```bash
   docker exec myanlex-production-jobs-1 pnpm ops:daily
   ```

   Healthchecks should show a success, and R2 should have a dump.

8. **Do a restore drill:**
   - download that dump;
   - restore it into a new, empty database
     ([deployment runbook](deployment.md#backup-restoration-and-rollback));
   - check the table counts;
   - record how long it took.

## Client addresses

Rate limits for unauthenticated requests and sign-in limits use the client's
address. Behind Cloudflare and Traefik, the API only sees Traefik unless it
trusts the forwarding proxies.

1. **Let Traefik pass Cloudflare's forwarded addresses through.** In Dokploy, go
   to **Settings → Traefik** (`traefik.yml`). Under the `web` and `websecure`
   entry points, add:

   ```yaml
   forwardedHeaders:
     trustedIPs:
       - 173.245.48.0/20 # …every range from https://www.cloudflare.com/ips/
   ```

   Then restart Traefik.

2. **Find the Docker network Traefik reaches the API on:**

   ```bash
   docker network inspect dokploy-network -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
   ```

3. **Set the variable** in the app's environment to that subnet plus the same
   Cloudflare ranges, then redeploy:

   ```
   MYANLEX_TRUST_PROXY=10.0.1.0/24,173.245.48.0/20,103.21.244.0/22,…
   ```

4. **Check it:** sign in with a wrong password repeatedly from two networks (for
   example your phone on mobile data). Each should be limited separately.

Cloudflare's ranges change rarely. Check the list every few months, or when
limits behave oddly.

## Everyday tasks

| Task                                   | How                                                                                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Release**                            | Merge to `main`, then run `git tag v0.2.0 && git push origin v0.2.0` and approve in **Actions**. The smoke check confirms the release.                                                                                                                       |
| **Deploy staging**                     | **Actions → Deploy → Run workflow → staging**.                                                                                                                                                                                                               |
| **Roll back**                          | In Dokploy, under **Environment**, set `IMAGE_TAG=production-sha-<previous 7>` (each workflow summary lists it), save, and click **Deploy**. Afterwards, set it back to `production`. Migrations are additive, so the previous build runs on the new schema. |
| **Logs**                               | Dokploy → app → **Logs** (pick the service), or `docker logs -f myanlex-production-api-1`. Daily job lines are in the `jobs` service.                                                                                                                        |
| **Is it healthy?**                     | `curl https://api.example.com/v1/health/ready`, or run `infra/smoke.sh` with `API_URL` and `CONSOLE_URL` set.                                                                                                                                                |
| **Run the daily jobs by hand**         | `docker exec myanlex-production-jobs-1 pnpm ops:daily`. If another run is in progress, it exits with code 75.                                                                                                                                                |
| **Record a payment**                   | `docker exec myanlex-production-jobs-1 pnpm billing:invoices mark-paid MLX-2026-000123 --method bank_transfer --reference "…" --actor you@example.com`                                                                                                       |
| **Approve a plan change**              | `docker exec myanlex-production-jobs-1 pnpm billing:changes list`, then `approve <id> --actor …`                                                                                                                                                             |
| **Change a setting**                   | Dokploy → **Environment** → edit → save → **Deploy**. `migrate` re-checks the configuration first.                                                                                                                                                           |
| **Rotate a secret**                    | Generate a new one, update it in Dokploy and redeploy. Rotating `AUTH_SECRET` signs everyone out, and rotating `POSTGRES_PASSWORD` needs `ALTER ROLE` first.                                                                                                 |
| **Database shell**                     | `docker exec -it myanlex-production-postgres-1 psql -U myanlex myanlex`                                                                                                                                                                                      |
| **Disk filling up**                    | Run Dokploy's **Cleanup**, or `docker system prune -af` (never add `--volumes`). Check with `df -h`.                                                                                                                                                         |
| **Update Dokploy**                     | **Settings → Updates**. Read the release notes first.                                                                                                                                                                                                        |
| **Upgrade PostgreSQL** (major version) | Take a fresh backup, restore it into a new container running the new version, then switch over. Never change the image's major version over the existing volume.                                                                                             |

## Troubleshooting

| Symptom                                                       | Likely cause and fix                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The deploy stops at `migrate` with "Configuration is invalid" | The listed variables are missing or wrong in Dokploy. The previous version is still serving.                                                                                                                                                          |
| The deploy stops at `migrate` during migrations               | Read the `migrate` logs. Fix it forward in a new release; don't edit applied migrations.                                                                                                                                                              |
| `required variable … is missing a value`                      | A variable from `.env.production.example` isn't set.                                                                                                                                                                                                  |
| `pull access denied` for ghcr.io                              | Step 7.1 isn't done or the token expired. Run `docker login ghcr.io` again.                                                                                                                                                                           |
| Certificate errors right after setup                          | The records were proxied before the certificates were issued. Set them to DNS only, redeploy, then turn the proxy back on with Full (strict).                                                                                                         |
| The smoke check waits, then says "not serving"                | Dokploy didn't redeploy (check the webhook and Dokploy → Deployments), or the API is unhealthy (check its logs).                                                                                                                                      |
| Healthchecks alerts "down"                                    | The run didn't happen. Check that `jobs` is running (`docker ps`) and read its logs.                                                                                                                                                                  |
| Healthchecks alerts a failure code                            | Read the `jobs` logs for that night's `ops_step` lines. Fix the cause and run `ops:daily` by hand. Exit code `2` from close-month means a ledger that doesn't reconcile; see [usage statements](operations.md#usage-statements-and-ledger-retention). |
| Everyone shares one rate limit                                | `MYANLEX_TRUST_PROXY` isn't set, or Traefik isn't passing Cloudflare's address through ([Client addresses](#client-addresses)).                                                                                                                       |
| Emails don't arrive                                           | Check the API and jobs logs for SMTP errors, and that the Resend domain is verified and `SMTP_FROM` uses it.                                                                                                                                          |
