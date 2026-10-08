# Deploy na VPS (Easypanel + GHCR), login com argon2 e MCP remoto — design spec

**Data:** 2026-10-08
**Status:** aprovado para implementação
**Autor:** Marcelo + Claude (brainstorming)
**Branch:** `feat/vps-deploy-auth`

---

## 1. Objetivo

Hoje o martrello só roda localmente: a interface web (Next.js) e o servidor MCP
(stdio) leem arquivos SQLite locais, e nem são o mesmo arquivo. O objetivo é
hospedar o app na VPS Hostinger do usuário, que roda o Easypanel, com:

- um único banco de produção, compartilhado entre a interface web e o Claude;
- login (usuário único) com senha armazenada em argon2id;
- o MCP exposto como servidor HTTP remoto, protegido por token, para o Claude
  Code acessar o mesmo banco de qualquer máquina;
- deploy automático a cada push na `main`, com a imagem publicada no GHCR.

## 2. Escopo

### Inclui

- `Dockerfile` multi-stage (Next `output: 'standalone'`, Node 24) e
  `scripts/start.sh` (roda migrações pendentes e depois sobe o servidor).
- Workflow do GitHub Actions: testes → build → push no GHCR → webhook de
  deploy do Easypanel.
- Tabelas `users` e `sessions`, hash argon2id, cookie de sessão, `proxy.ts`
  protegendo as rotas, tela `/login`, logout e rate limit de login.
- Script `pnpm user:set <username>` para criar o usuário ou trocar a senha.
- Rota `/api/mcp` com transporte Streamable HTTP (stateless) e autenticação
  por bearer token.
- Backup diário do banco em `/data/backups`, mantendo os últimos 14,
  agendado dentro do próprio app.
- Runbook de configuração do Easypanel e da migração inicial dos dados
  (`docs/deploy.md`).

### Não inclui

- Múltiplos usuários, papéis ou permissões por projeto.
- Reset de senha por e-mail, 2FA, OAuth/SSO.
- Mais de uma réplica (SQLite com escrita por um único processo).
- Migrar ou mesclar o banco que o MCP local usa hoje
  (`/Users/marceloferro/martrello/martrello.db`). Decisão do usuário: o banco
  da interface web (`.claude/worktrees/run-app-locally-ddb752/martrello.db`,
  com Motim, Villela, Nubank, Edu-TO, BDD, EIA, Axivero, Berzerk, Vigília e
  Smartspace) vira o banco de produção. O outro fica intocado.

## 3. Deploy

### 3.1 Imagem Docker

`Dockerfile` multi-stage na raiz:

1. **deps:** `node:24-bookworm-slim` + `python3 make g++` (fallback para o
   build do `better-sqlite3`), `corepack enable`, `pnpm install --frozen-lockfile`.
2. **build:** copia o código, `pnpm build` (Next com `output: 'standalone'` em
   `next.config.ts`).
3. **runtime:** `node:24-bookworm-slim`, usuário não-root `node`, copia
   `.next/standalone`, `.next/static`, `public`, `lib/db/migrations` e um
   bundle esbuild do script de migração (`dist/scripts/migrate.js`), além de
   `scripts/start.sh`. `ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0`
   e `EXPOSE 3000`.

O standalone do Next não inclui ferramentas de dev (`tsx`), então o migrador e
o script `user:set` são empacotados com esbuild no estágio de build, no mesmo
padrão do `scripts/build-mcp.ts` que já existe, com `better-sqlite3` como
`external`. O standalone já traz `better-sqlite3` em `node_modules`.

O tracing do standalone precisa incluir o binário nativo do
`better-sqlite3`. Se o build não copiar `build/Release/better_sqlite3.node`,
usar `outputFileTracingIncludes` no `next.config.ts`. A verificação é o
`docker run` local da seção 6.

`scripts/start.sh`:

```sh
#!/bin/sh
set -e
node dist/scripts/migrate.js
exec node server.js
```

### 3.2 Pipeline (GitHub Actions → GHCR → Easypanel)

`.github/workflows/deploy.yml`, disparado em `push` na `main` e manualmente
(`workflow_dispatch`):

1. **test:** checkout, pnpm, Node 24, `pnpm install --frozen-lockfile`,
   `pnpm test`.
2. **build-push** (depende de `test`): `docker/login-action` no `ghcr.io`
   com `GITHUB_TOKEN` (`permissions: packages: write, contents: read`),
   `docker/build-push-action` para `linux/amd64`, com as tags
   `ghcr.io/marcelohfms/martrello:latest` e `:sha-<short-sha>`. Usa cache de
   build do GitHub Actions (`cache-from/to: type=gha`).
3. **deploy** (depende de `build-push`): `curl -fsS -X POST
   "$EASYPANEL_DEPLOY_WEBHOOK"`, com a URL no secret do repositório. Se o
   secret não existir, o passo é pulado com aviso, sem falhar.

### 3.3 Configuração no Easypanel

Projeto `martrello`, serviço **App**:

- **Fonte:** Docker Image `ghcr.io/marcelohfms/martrello:latest`. Se o pacote
  GHCR for privado, cadastrar as credenciais do registry (usuário GitHub + PAT
  com `read:packages`).
- **Volume (mount):** `/data`.
- **Domínio:** o subdomínio do usuário → porta 3000, HTTPS ligado (Let's
  Encrypt do próprio Easypanel).
- **Ambiente:**
  - `DATABASE_URL=file:/data/martrello.db`
  - `MCP_TOKEN=<openssl rand -hex 32>`
  - `SESSION_COOKIE_SECURE=true`
- **Réplicas:** 1.
- **Deploy webhook:** copiar a URL para o secret `EASYPANEL_DEPLOY_WEBHOOK`
  do GitHub.

O volume precisa ser gravável pelo usuário `node` (uid 1000). O `start.sh`
falha com uma mensagem clara se `/data` não for gravável.

### 3.4 Carga inicial dos dados

Com o serviço parado, copiar o `martrello.db` da worktree para o volume
(`scp` para o caminho do volume no host, ou o gerenciador de arquivos do
Easypanel). Antes de copiar, rodar localmente
`sqlite3 martrello.db "PRAGMA wal_checkpoint(TRUNCATE);"` para que tudo esteja
no arquivo principal. Depois, subir o serviço: o `start.sh` aplica a migração
nova (`users`/`sessions`), e então rodar `user:set` pelo console do container.

### 3.5 Backup

A lógica de backup vai para `lib/backup.ts` e usa o `db.backup()` do
better-sqlite3 (backup online e consistente com WAL). Destino em
`BACKUP_DIR` e retenção em `BACKUP_KEEP` (padrão 14). Só arquivos
`martrello-*.db` contam para a retenção.

O agendamento fica dentro do próprio app, sem depender de cron do Easypanel:
`instrumentation.ts` (hook `register()` do Next, executado uma vez na subida
do servidor Node) inicia um agendador quando `BACKUP_DIR` está definido. A
cada hora ele verifica se o último backup tem mais de 24 h e, se tiver, cria
um novo. Na imagem Docker, `BACKUP_DIR=/data/backups` já vem definido. Em
desenvolvimento local, sem a variável, o agendador fica desligado.
`scripts/backup.ts` continua como CLI para backup manual
(`node dist/scripts/backup.js` no container, `pnpm backup` localmente, com
padrão `./backups`).

## 4. Login

### 4.1 Modelo de dados

Migração Drizzle nova:

```ts
users: id (text PK, ulid), username (text, unique, not null),
       passwordHash (text, not null), createdAt (integer, not null)
sessions: idHash (text PK), userId (text FK → users.id, on delete cascade),
          createdAt (integer, not null), expiresAt (integer, not null)
```

### 4.2 Módulo `lib/auth/`

- `password.ts`: `hashPassword(plain)` e `verifyPassword(hash, plain)` com
  `@node-rs/argon2` (argon2id, `memoryCost: 19456`, `timeCost: 2`,
  `parallelism: 1`, formato PHC). `verifyPassword` nunca lança erro para hash
  malformado: devolve `false`.
- `sessions.ts`:
  - `createSession(db, userId)` gera 32 bytes com `crypto.randomBytes`,
    devolve o token em base64url e grava apenas `sha256(token)`, com
    `expiresAt = now + 30 dias`;
  - `validateSession(db, token)` devolve o usuário ou `null`, apagando a
    sessão se estiver expirada;
  - `deleteSession(db, token)`.
  Recebem `db` como parâmetro, igual a `lib/core/*`.
- `rate-limit.ts`: limitador em memória por chave (IP). Bloqueia a 6ª
  tentativa dentro de 15 minutos por 15 minutos, `reset(key)` no sucesso.
  O relógio é injetável, para teste.
- `cookie.ts`: nome `martrello_session`, `HttpOnly`, `SameSite=Lax`,
  `Path=/`, `Max-Age` de 30 dias, `Secure` quando
  `SESSION_COOKIE_SECURE=true`.
- `current-user.ts`: `requireUser()` para server components e server actions.
  Lê o cookie, valida e redireciona para `/login` se não houver sessão.

### 4.3 Proteção de rotas

`proxy.ts` (Next 16; Proxy usa o runtime Node por padrão e não aceita a opção
`runtime`) roda em todas as rotas, exceto
`/_next/static`, `/_next/image`, `favicon.ico`, `/login` e `/api/mcp`.
Valida a sessão do cookie contra o banco. Sem sessão válida, páginas recebem
`302` para `/login` e rotas `/api/*` recebem `401` em JSON.

Cada server action em `app/actions.ts` chama `requireUser()` no início, como
defesa em profundidade, já que o proxy não deve ser a única barreira para
actions. O `/api/stream` e o `/api/card/[id]` são cobertos pelo proxy (o
`EventSource` envia cookies na mesma origem).

### 4.4 Tela `/login` e logout

- `app/login/page.tsx` + server action `login(formData)`: campos usuário e
  senha. Fluxo: checa o rate limit → busca o usuário → verifica a senha. Se o
  usuário não existir, verifica contra um hash falso fixo para igualar o
  tempo de resposta. Em caso de sucesso: cria a sessão, envia o cookie, zera o
  rate limit e redireciona para `/`. Em caso de falha: mensagem genérica
  "Usuário ou senha inválidos" (ou "Muitas tentativas. Tente de novo em N
  minutos" quando bloqueado). O IP vem do **último** valor de
  `x-forwarded-for` (o que o Traefik do Easypanel anexa com o endereço que ele
  viu; os valores à esquerda podem ser forjados pelo cliente), com fallback
  para `x-real-ip` e depois `unknown`.
- Visual alinhado ao app: fundo escuro, tokens `--color-mt-*`, wordmark
  "martrello".
- Logout: botão "Sair" no rodapé da sidebar (`SidebarClient.tsx`, no lugar do
  texto "Claude · MCP"), que chama a action `logout()`. A action apaga a
  sessão e o cookie e redireciona para `/login`.

### 4.5 Script `user:set`

`scripts/user-set.ts <username>`: pede a senha duas vezes no TTY sem eco
(`readline` com saída silenciada). Quando o stdin não é um TTY (senha via
pipe, para automação e testes), lê a senha uma vez do stdin. Exige no mínimo
12 caracteres e faz upsert
em `users`. Ao trocar a senha, apaga todas as sessões daquele usuário.
Empacotado como `dist/scripts/user-set.js`. Na VPS, roda pelo console do container:
`node dist/scripts/user-set.js marcelo`. Localmente: `pnpm user:set marcelo`.

## 5. MCP remoto

### 5.1 Rota `app/api/mcp/route.ts`

- `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`. Exporta `POST`, `GET` e
  `DELETE`.
- Em cada requisição: autentica, cria `createServer()` (de `mcp/server.ts`,
  sem mudanças) e um `WebStandardStreamableHTTPServerTransport` do
  `@modelcontextprotocol/sdk` em modo stateless
  (`sessionIdGenerator: undefined`, `enableJsonResponse: true`), conecta os
  dois e devolve `transport.handleRequest(request)`.
- O SDK instalado (1.29.0) já exporta `WebStandardStreamableHTTPServerTransport`
  em `@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js`.

### 5.2 Autenticação

`lib/auth/mcp-token.ts` → `checkMcpAuth(request, expectedToken)`:

- `expectedToken` vazio ou ausente → `503 {"error":"MCP_DISABLED"}`. A rota
  nunca fica aberta por falta de configuração.
- Header ausente ou fora do formato `Bearer <token>` → `401`.
- Comparação: `timingSafeEqual(sha256(recebido), sha256(esperado))`.

### 5.3 Conexão do Claude Code

Substituir a entrada `martrello` em `~/.claude.json` (hoje
`node /Users/marceloferro/martrello/mcp/dist/index.js`) por:

```bash
claude mcp add --scope user --transport http martrello https://<subdominio>/api/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

O `mcp/index.ts` (stdio) continua no repositório para desenvolvimento local.

### 5.4 Tempo real

Escritas via MCP acontecem no mesmo processo e no mesmo arquivo em
`/data`. O `fs.watch` do `/api/stream` observa o diretório do banco
(`/data`), então a interface continua atualizando sozinha. Sem mudanças no
mecanismo de tempo real.

## 6. Testes e verificação

Automatizados (vitest, padrão `*.test.ts` ao lado do código):

- `lib/auth/password.test.ts`: hash diferente da senha e em formato
  `$argon2id$`; verificação certa → `true`; senha errada → `false`; hash
  malformado → `false`, sem lançar erro.
- `lib/auth/sessions.test.ts`: criar → validar devolve o usuário; o banco
  guarda o hash, nunca o token; token desconhecido → `null`; sessão expirada →
  `null` e a linha é apagada; `deleteSession` → depois disso `null`.
- `lib/auth/rate-limit.test.ts`: 5 falhas permitidas, a 6ª bloqueada; depois
  de 15 minutos (relógio injetado) volta a liberar; `reset` libera na hora;
  chaves independentes.
- `lib/auth/mcp-token.test.ts`: token ausente na configuração → 503; sem
  header → 401; token errado → 401; token certo → `null` (autorizado).
- `app/api/mcp/route.test.ts`: `POST` com `tools/list` e token válido devolve
  a lista com `martrello_list_projects`; sem token → 401.
- `scripts/user-set` tem a lógica de upsert extraída para
  `lib/auth/users.ts` (`setUserPassword(db, username, plain)`), testada:
  cria o usuário; atualizar troca o hash e apaga as sessões.

Manuais, antes do PR:

- `docker build` + `docker run -v $(pwd)/tmp-data:/data -p 3000:3000` com uma
  cópia do banco: migrações aplicadas na subida; `/` redireciona para
  `/login`; login funciona; o quadro carrega; logout funciona; a 6ª senha
  errada bloqueia; `curl` em `/api/mcp` com e sem token.
- No navegador do app local: o mesmo fluxo de login e logout.

Depois do deploy: HTTPS válido no domínio, login, `claude mcp list` mostrando
`martrello` conectado, e uma alteração feita pelo Claude aparecendo na tela
sem recarregar.

## 7. Riscos e decisões registradas

- **Binário nativo no standalone:** é o ponto mais frágil do build. Mitigação
  na seção 3.1, verificado no `docker run` local.
- **Rate limit em memória:** zera a cada restart. É aceitável com uma réplica
  e um usuário, porque o argon2id já torna cada tentativa cara.
- **Token do MCP de longa duração:** a rotação é trocar `MCP_TOKEN` no
  Easypanel e rodar de novo o `claude mcp add`. Sem expiração automática.
- **`x-forwarded-for` confiável:** só porque o app fica sempre atrás do
  Traefik do Easypanel. A porta 3000 não é publicada diretamente no host.
  Usar o valor mais à direita assume exatamente um proxy (Traefik). Se um CDN
  (ex.: Cloudflare com proxy ligado) for colocado na frente, todos os clientes
  aparecem com o IP do CDN e compartilham o mesmo limite de tentativas; nesse
  caso, passar a ler o header próprio do CDN.
