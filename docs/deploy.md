# Deploy (Easypanel + GHCR)

Every push to `main` runs the tests, builds `ghcr.io/marcelohfms/martrello`
(`latest` + `sha-<commit>`) and calls the Easypanel deploy webhook.

## One-time setup

1. **GHCR visibility.** After the first workflow run, the package appears under
   GitHub → Packages → `martrello`. Either make it public, or in Easypanel add
   registry credentials: `ghcr.io`, your GitHub user, and a PAT with
   `read:packages`.
2. **Easypanel project/service.** Create project `martrello` → service **App**:
   - Source: **Docker Image** `ghcr.io/marcelohfms/martrello:latest`.
   - Mounts: **Volume** at `/data`. If the container log shows
     `ERRO: /data não é gravável`, run
     `chown -R 1000:1000 /etc/easypanel/projects/martrello/<service>/volumes/data`
     on the host and restart the service.
   - Domains: your subdomain → port `3000`, HTTPS on. Do not add a **Ports**
     mapping for 3000 on the host: the app must only be reachable through
     Easypanel's proxy, because the login rate limit trusts its
     `x-forwarded-for` header.
   - Environment:
     ```
     MCP_TOKEN=<openssl rand -hex 32>
     SESSION_COOKIE_SECURE=true
     ```
     (`DATABASE_URL` and `BACKUP_DIR` already default to `/data/...` in the image.)
   - Keep a single replica (SQLite).
3. **Deploy webhook.** Copy the service's deploy webhook URL into the GitHub
   repo secret `EASYPANEL_DEPLOY_WEBHOOK`.

## Loading the existing data (once)

1. Locally: `sqlite3 <path>/martrello.db ".backup /tmp/martrello-upload.db"`
   (consistent copy, WAL included).
2. Stop the service in Easypanel.
3. Copy `/tmp/martrello-upload.db` into the volume as `martrello.db`
   (`scp` to the volume path on the host, e.g.
   `/etc/easypanel/projects/martrello/<service>/volumes/data/`, or Easypanel's
   file browser). Make sure the whole volume directory is owned by uid 1000,
   not just the file, since SQLite also writes WAL/journal files and the app
   creates `/data/backups` there:
   `chown -R 1000:1000 /etc/easypanel/projects/martrello/<service>/volumes/data`.
4. Start the service. Logs should show `migrations applied` then `Ready`.

## Creating / changing the login

In the service **Console** (Easypanel → service → Console):

```bash
node dist/scripts/user-set.js marcelo
```

It asks for the password twice (min. 12 chars). Changing a password signs out
every existing session.

## Connecting Claude Code to the remote MCP

```bash
claude mcp remove martrello --scope user
claude mcp add --scope user --transport http martrello https://<subdomain>/api/mcp --header "Authorization: Bearer <MCP_TOKEN>"
claude mcp list
```

Rotate the token by changing `MCP_TOKEN` in Easypanel, redeploying, and
re-running the `add` command.

## Backups

The app writes `/data/backups/martrello-<timestamp>.db` once a day and keeps
the newest 14 (`BACKUP_KEEP`). Manual backup from the console:
`node dist/scripts/backup.js`.

## Rollback

Change the service image tag to a previous `sha-<commit>` and deploy.
