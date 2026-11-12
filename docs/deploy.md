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
     APP_URL=https://<subdomain>
     RESEND_API_KEY=<chave da Resend>
     EMAIL_FROM=Martrello <martrello@axivero.com.br>
     MCP_TOKEN=<openssl rand -hex 32>
     ```
     (`DATABASE_URL`, `BACKUP_DIR` and `SESSION_COOKIE_SECURE=true` are
     already defaults in the image.) See "Variáveis de ambiente" below.
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
6. Create the login (see below; on a database that already has data, follow
   "Migração multiusuário" instead), then take a backup right away from the
   service Console: `node dist/scripts/backup.js`. The scheduler only backs up
   when the newest backup is older than 24 h, so a backup of the empty
   pre-upload DB would otherwise delay the first real backup by up to a day.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `APP_URL` | Obrigatória em produção. URL pública do app, usada nos links de convite e de redefinição de senha. Sem ela o app lança "APP_URL não configurada" ao montar um link. Ex.: `https://martrello.marceloferro.cloud`. |
| `RESEND_API_KEY` | Chave da Resend para enviar e-mails. Sem chave nenhum e-mail é enviado, e a página `/admin` mostra o link do convite para o admin copiar e enviar. |
| `EMAIL_FROM` | Remetente, ex.: `Martrello <martrello@axivero.com.br>`. O domínio precisa estar verificado na Resend. |
| `MCP_TOKEN` | Token do MCP anterior. Continua aceito e age como o admin. |
| `BACKUP_DIR`, `BACKUP_KEEP` | Pasta e quantidade de backups (ver Backups). |
| `DATABASE_URL` | Caminho do SQLite (padrão da imagem). |

### Verificação do domínio na Resend

1. Na Resend, adicione o domínio de `EMAIL_FROM` (`axivero.com.br`) em Domains.
2. Crie no DNS do domínio os registros que a Resend mostrar (SPF, DKIM e,
   se pedido, MX/DMARC) e aguarde o status `Verified`.
3. Crie uma API key com permissão de envio e use-a em `RESEND_API_KEY`.
4. Reinicie o serviço após alterar as variáveis.

## Convites e senhas

- Só o admin (`marcelo.ferro@axivero.com.br`) convida, em `/admin`. O convidado
  define a senha em `/convite/<token>`; o link vale 7 dias e só pode ser usado
  uma vez.
- "Esqueci minha senha" em `/esqueci-senha` envia um link de 1 hora e uso único
  (`/redefinir-senha/<token>`).
- O e-mail de login de cada pessoa deve ser o mesmo e-mail Axivero que ela usa
  no Slack (necessário para o bot do Slack, projeto seguinte).

## Creating / changing the login

Normalmente não é preciso: convites e "Esqueci minha senha" cobrem o uso do dia
a dia. Para o caso em que o e-mail não funciona, no **Console** do serviço
(Easypanel → service → Console):

```bash
node dist/scripts/user-set.js <email>
```

Define a senha de um usuário existente (pede duas vezes, mínimo de 12
caracteres). Se o e-mail não existe, cria o usuário e pede também o nome
("Nome:"; com stdin redirecionado, a senha é a primeira linha e o nome a
segunda). O primeiro usuário criado quando não há admin vira admin; os demais
viram membros. Trocar a senha
encerra todas as sessões abertas dessa pessoa.

## Migração multiusuário (uma vez)

As migrações 0005 a 0007 rodam sozinhas na inicialização (`scripts/start.sh`
executa o migrate). Passo a passo:

0. **Checagem antes do deploy.** Ainda com a versão atual no ar, abra o Console
   do serviço (Easypanel → service → Console) e cole o bloco abaixo. Ele só lê
   o banco (abre em modo `readonly`); a imagem não tem o `sqlite3`, por isso o
   `node`:

   ```bash
   cd /app && node - <<'CHECK'
   const D = require('better-sqlite3');
   const db = new D(process.env.DATABASE_URL.replace(/^file:/, ''), { readonly: true });
   const q = (titulo, sql) => console.log(titulo, JSON.stringify(db.prepare(sql).all()));
   q('1. listas fora de A fazer/Fazendo/Feito (precisa ser []):',
     "SELECT p.name AS projeto, l.name AS lista FROM lists l JOIN projects p ON p.id = l.project_id WHERE l.name NOT IN ('A fazer', 'Fazendo', 'Feito') ORDER BY 1, 2");
   q('2. nomes de lista repetidos num projeto (precisa ser []):',
     "SELECT p.name AS projeto, l.name AS lista, COUNT(*) AS n FROM lists l JOIN projects p ON p.id = l.project_id GROUP BY l.project_id, l.name HAVING COUNT(*) > 1");
   q('3. usuários (precisa incluir marcelo):', 'SELECT username FROM users');
   q('4. dependências entre projetos (informativo; a 0007 apaga):',
     'SELECT COUNT(*) AS n FROM card_dependencies d JOIN cards a ON a.id = d.blocked_card_id JOIN cards b ON b.id = d.blocker_card_id WHERE a.project_id <> b.project_id');
   CHECK
   ```

   A checagem 1 inclui projetos arquivados. Se 1, 2 ou 3 não derem o esperado,
   corrija os dados na versão atual (veja as causas em "Se a migração
   abortar") e rode a checagem de novo antes de seguir.
1. Backup manual no Console do serviço: `node dist/scripts/backup.js`.
2. Defina `APP_URL`, `RESEND_API_KEY` e `EMAIL_FROM` e faça o deploy.
3. Nos logs, confira `migrations applied` seguido de `Ready`.
4. Entre com `marcelo.ferro@axivero.com.br` e a senha atual. A migração
   converteu o usuário `marcelo` nesse e-mail, de admin, sem mudar a senha.
5. Confira a sprint. Na primeira execução do agendador de sprints, a sprint
   antiga (sem semana definida) é tratada assim: se começou antes da segunda-feira
   desta semana (America/Sao_Paulo), é fechada e abre a sprint "Semana dd/MM";
   se começou nesta semana, é adotada, ou seja, renomeada para "Semana dd/MM" e
   mantida aberta. Nos dois casos a sprint mostra os seus cards em A fazer e
   Fazendo, mais os de Feito apenas se concluídos nesta semana. Cards mais
   antigos em Feito não aparecem na sprint e continuam no quadro do projeto.

O que a migração faz com os dados: a 0006 aplica o fluxo fixo de listas; a 0007
move para o Backlog os cards ativos de "A fazer" que não estão na sprint atual,
remove `sprint_slots` e apaga as dependências entre cards de projetos
diferentes (sobras de cards movidos de projeto na versão anterior; não gera
evento no histórico).

### Se a migração abortar

A migração é atômica: ao falhar, nada é alterado e o app não sobe. Causas:

- **Lista fora das etapas.** O log mostra
  `NOT NULL constraint failed: _stage_guard.x`: algum projeto tem uma lista com
  nome diferente de A fazer, Fazendo e Feito. Uma lista já existente chamada
  "Backlog" também dispara o erro, pois a migração só reconhece esses três
  nomes e cria o Backlog por conta própria. Renomeie a lista (pelo MCP ou pela
  interface da versão anterior), mova os cards para uma das três e faça o
  deploy de novo.
- **Nome de lista repetido no projeto.** O log mostra
  `UNIQUE constraint failed: lists.project_id, lists.stage` ao criar o índice
  `lists_project_stage_unique`: um projeto tem duas listas com o mesmo nome
  (por exemplo, duas "Feito"), que viram a mesma etapa. Mova os cards de uma
  para a outra, exclua a lista que sobrou e faça o deploy de novo.
- **Sem usuário admin.** Há dados, mas nenhum usuário com o e-mail do admin
  (`_admin_guard`), o que acontece quando não existe o usuário `marcelo`.
  Crie-o na versão atual e faça o deploy de novo.

Como o `scripts/start.sh` roda a migração antes de subir o app, o container
novo entra em loop de reinício. Para voltar ao ar:

1. No Easypanel (service → Source), troque a imagem de `latest` para a tag
   `sha-<commit>` da versão que estava no ar antes do deploy (veja em GitHub →
   Packages → `martrello`, ou no histórico de deploys do serviço) e clique em
   **Deploy**. Como a migração não alterou nada, a versão anterior sobe com o
   banco como estava.
2. Corrija os dados conforme a causa acima e rode a checagem do passo 0 de novo.
3. Volte a imagem para `latest` e faça o deploy.

O backup do passo 1 fica como último recurso (ver Rollback), por exemplo se o
banco tiver sido alterado por outro motivo.

## Token pessoal do MCP

Cada pessoa gera o próprio token em `/conta` (Minha conta). Ele aparece uma
única vez e começa com `mtr_`. Para conectar o Claude Code:

```bash
claude mcp remove martrello --scope user
claude mcp add --scope user --transport http martrello https://<subdomain>/api/mcp --header "Authorization: Bearer <token>"
claude mcp list
```

O `MCP_TOKEN` do ambiente continua valendo e age como o admin. Para rotacionar
um token pessoal, gere outro em `/conta` e rode o `add` de novo. Para rotacionar
o `MCP_TOKEN`, troque a variável no Easypanel, faça o deploy e rode o `add`.

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
