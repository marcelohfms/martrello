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
     ```
     (`DATABASE_URL`, `BACKUP_DIR` and `SESSION_COOKIE_SECURE=true` are
     already defaults in the image.)
   - Keep a single replica (SQLite).
3. **Deploy webhook.** Copy the service's deploy webhook URL into the GitHub
   repo secret `EASYPANEL_DEPLOY_WEBHOOK`.

## Loading the existing data (once)

1. Locally: `sqlite3 <path>/martrello.db ".backup /tmp/martrello-upload.db"`
   (consistent copy, WAL included).
2. Stop the service in Easypanel.
3. Still with the service stopped, remove any leftover WAL/SHM files from the
   volume directory. If the service already ran (e.g. you created a login on
   the empty DB), a stale `martrello.db-wal` would be replayed onto the
   uploaded file and could leave production empty or malformed:
   ```bash
   rm -f /etc/easypanel/projects/martrello/<service>/volumes/data/martrello.db-wal \
         /etc/easypanel/projects/martrello/<service>/volumes/data/martrello.db-shm
   ```
4. Copy `/tmp/martrello-upload.db` into the volume as `martrello.db`
   (`scp` to the volume path on the host, e.g.
   `/etc/easypanel/projects/martrello/<service>/volumes/data/`, or Easypanel's
   file browser). Make sure the whole volume directory is owned by uid 1000,
   not just the file, since SQLite also writes WAL/journal files and the app
   creates `/data/backups` there:
   `chown -R 1000:1000 /etc/easypanel/projects/martrello/<service>/volumes/data`.
5. Start the service. Logs should show `migrations applied` then `Ready`.
6. Create the login (see below), then take a backup right away from the
   service Console: `node dist/scripts/backup.js`. The scheduler only backs up
   when the newest backup is older than 24 h, so a backup of the empty
   pre-upload DB would otherwise delay the first real backup by up to a day.

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

Change the service image tag to a previous `sha-<commit>` and deploy. When
done, switch the image tag back to `latest`, otherwise later webhook deploys
keep redeploying the pinned tag.

Migrations only run forward, so rolling back across a migration may not work.
If needed, restore from `/data/backups`: stop the service, remove
`martrello.db-wal` and `martrello.db-shm` from the volume directory, copy the
chosen backup over `martrello.db`, then start the service.
