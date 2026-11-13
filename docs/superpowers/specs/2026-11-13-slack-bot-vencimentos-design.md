# Bot do Slack de vencimentos — design spec

**Data:** 2026-11-13
**Status:** rascunho para aprovação
**Autor:** Marcelo + Claude (brainstorming)
**Branch:** `feat/slack-bot-vencimentos`
**Depende de:** `2026-11-12-multiusuario-responsaveis-design.md` (seção 12)

---

## 1. Por que

O martrello virou o sistema de tarefas do time da Axivero, e cada tarefa tem
um responsável e um prazo. Falta alguém lembrar o time do que está vencendo.
O bot faz isso todo dia útil, no canal do Slack de cada projeto, marcando quem
precisa agir.

Sucesso: às 9h de um dia útil, o canal de cada projeto com tarefas atrasadas
ou vencendo recebe uma mensagem, e cada pessoa vê o próprio @ ao lado do que
é dela. Na segunda, o time também vê o que vence no resto da semana.
Projetos pessoais do Marcelo nunca aparecem no Slack.

## 2. Objetivos, não objetivos e antiobjetivos

### Objetivos

- Uma mensagem por dia útil, por projeto com canal configurado, a partir das
  9h de Brasília.
- Configurar o canal de cada projeto na área de admin, escolhendo numa lista.
- Marcar o responsável de cada tarefa com @ no Slack.
- Mostrar no admin o último envio e o último erro de cada projeto.

### Não objetivos

- Comandos, respostas ou botões no Slack (o bot só escreve).
- Mensagem direta para a pessoa (DM). Só o canal do projeto.
- Link direto para um card (o martrello não tem; o link vai para o quadro).
- Configurar o canal pelo MCP. Fica só no admin, como membros e convites.
- Feriados estaduais e municipais, e horário configurável.
- Mais de um workspace do Slack.

### Antiobjetivos (falha mesmo que funcione)

- Um projeto sem canal configurado, inclusive os pessoais, aparecer em
  qualquer mensagem.
- O mesmo projeto receber duas mensagens no mesmo dia, inclusive se o app
  reiniciar.
- Mensagem em fim de semana ou feriado nacional.
- O bot derrubar ou atrasar o app quando o Slack estiver fora ou o token
  estiver errado.

## 3. Estado atual (levantado no código em 2026-11-13)

- `instrumentation.ts` inicia `lib/sprint-scheduler.ts` (tick agora e a cada
  15 min, nunca lança) e, se houver `BACKUP_DIR`, o de backup. O bot segue o
  mesmo molde.
- `lib/core/week.ts` tem o fuso `America/Sao_Paulo`, `weekStartISO` e
  `weekBounds`, mas não tem "data de hoje em São Paulo" nem "hora em São
  Paulo"; o bot precisa dessas duas funções.
- `cards.dueDate` é texto `YYYY-MM-DD` (sem hora). `cards.assigneeId` aponta
  para `users`; fora do Backlog é obrigatório, no Backlog pode ser nulo.
  A etapa vem de `lists.stage` (`backlog | todo | doing | done`).
- `projects` não tem nenhum campo de Slack. Não existe flag de "projeto
  pessoal": pessoal é só o projeto sem canal.
- `users.email` é o e-mail de login, que deve ser igual ao do Slack da
  Axivero (seção 12 do spec anterior).
- O admin (`app/(app)/admin/page.tsx`) tem as seções Pessoas e Projetos
  (`ProjectMembersSection`). As actions ficam em `app/(app)/admin/actions.ts`
  e usam `requireAdmin()` e `toResult`.
- `lib/email/mailer.ts` é o padrão para integração externa opcional: sem a
  chave, a função devolve "desligado" em vez de falhar. `appUrl()` monta
  links a partir de `APP_URL`.
- O quadro de um projeto fica em `/project/<id>`.

## 4. Quando o bot manda (decisões do Marcelo)

- **Dia útil:** segunda a sexta, exceto feriados nacionais.
- **Feriados:** calculados no código, sem lista para manter (opção B):
  - Fixos: 1/1, 21/4, 1/5, 7/9, 12/10, 2/11, 15/11, 20/11, 25/12.
  - Móveis, a partir da Páscoa: segunda e terça de Carnaval (Páscoa − 48 e
    − 47 dias), Sexta-feira Santa (− 2) e Corpus Christi (+ 60).
  - *Decisão do Claude:* Quarta-feira de Cinzas é dia útil normal (o
    expediente só começa mais tarde, e a mensagem pode esperar até lá).
- **Horário:** a partir das 9h de Brasília. O verificador roda a cada 15
  minutos, então a mensagem sai entre 9h00 e 9h15.
- **Atraso por indisponibilidade** (*decisão do Claude*): se o app estiver
  fora às 9h, a mensagem sai no primeiro tick depois que ele voltar, desde que
  seja antes das 12h. Depois disso o dia é perdido, sem envio.
- **Primeiro dia útil da semana:** recebe o resumo semanal (com 🗓️). Em
  geral é a segunda; se a segunda for feriado, é a terça, e assim por diante
  (decisão do Marcelo).
- **Dia sem nada a avisar:** o projeto não recebe mensagem (opção A).

## 5. O que entra na mensagem

**Tarefas consideradas:** do projeto, não arquivadas, com `dueDate`, numa
lista de etapa diferente de `done`. Inclui o Backlog (decisão do Marcelo):
tarefa do Backlog sem responsável aparece com "sem responsável" no lugar do
@. Projeto arquivado não recebe mensagem.

**Grupos** (sendo `hoje` a data em São Paulo):

| Grupo | Regra | Quando aparece |
|---|---|---|
| 🔴 Atrasadas | `dueDate < hoje` | todo dia útil |
| 🟡 Vencem hoje | `dueDate = hoje` | todo dia útil |
| 🗓️ Resto da semana | `hoje < dueDate ≤ domingo da semana` | só no primeiro dia útil da semana |

*Decisão do Claude:* "Resto da semana" vai até domingo, porque a sprint
também vai de segunda a domingo.

Uma tarefa atrasada aparece todo dia até alguém mudar o prazo ou concluí-la.

**Formato** (aprovado pelo Marcelo). Exemplo de segunda-feira:

```
*Prazos de hoje · Motim* — segunda, 16/11

🔴 *Atrasadas (2)*
• Revisar contrato de licença — @Ana · venceu sex 13/11
• Subir landing nova — sem responsável · venceu qui 12/11

🟡 *Vencem hoje (1)*
• Enviar relatório mensal — @Marcelo

🗓️ *Resto da semana (3)*
• qua 18/11 — Ajustar pipeline de deploy — @Bruno
• qui 19/11 — Revisão do roteiro da aula 4 — @Ana
• dom 22/11 — Fechar orçamento Q1 — @Marcelo

<Abrir quadro>
```

- De terça a sexta (exceto no primeiro dia útil da semana) o bloco 🗓️ não
  aparece.
- Grupo vazio some. Se todos ficarem vazios, não há mensagem.
- Dentro de cada grupo, ordem por `dueDate` crescente, depois pela posição do
  card.
- O cabeçalho usa o nome real do projeto, não a sigla: o canal já é do
  projeto.
- "Abrir quadro" é um link para `appUrl('/project/<id>')`.
- O @ é uma menção real do Slack (`<@U…>`), resolvida pelo e-mail do
  responsável. Se o Slack não achar o e-mail, aparece o nome do martrello sem
  @. O título do card é escapado (`&`, `<`, `>`) para não virar formatação ou
  menção.

## 6. Configuração do canal (decisão do Marcelo: lista de canais)

- Na seção Projetos do `/admin`, cada projeto ganha um seletor "Canal do
  Slack" com a opção "Nenhum" e os canais (públicos e privados) em que o bot
  já é membro.
- Se o canal desejado não aparece, falta convidar o bot com `/invite
  @martrello` no Slack. A tela diz isso ao lado do seletor.
- Ao lado do seletor: último envio (data e hora) e, se houver, o último erro
  com a data.
- Se o canal configurado não estiver mais na lista (bot removido, canal
  arquivado), o seletor mostra o canal salvo como "indisponível" e mantém o
  valor até o admin trocar.
- Sem `SLACK_BOT_TOKEN`, a seção mostra "Slack não configurado" e não tem
  seletor. Se a chamada ao Slack falhar ao abrir a página, a página abre do
  mesmo jeito, com o erro no lugar do seletor.
- *Decisão do Claude:* guardar no projeto o ID e o nome do canal
  (`slack_channel_id`, `slack_channel_name`), para mostrar o nome sem chamar o
  Slack e para o caso "indisponível".
- Só o admin muda o canal (`assertAdmin`).

## 7. App do Slack

- Um app interno no workspace da Axivero, criado pelo Marcelo, com bot token
  (`xoxb-…`) na variável `SLACK_BOT_TOKEN`.
- Escopos do bot: `chat:write`, `users:read`, `users:read.email`,
  `channels:read`, `groups:read`.
- APIs usadas: `chat.postMessage`, `users.lookupByEmail`,
  `users.conversations` (tipos `public_channel,private_channel`, sem
  arquivados, paginado).
- Sem `SLACK_BOT_TOKEN` o verificador nem inicia, e nada quebra.
- *Decisão do Claude:* o verificador só inicia em produção
  (`NODE_ENV=production`) com `SLACK_BOT_TOKEN` e `SLACK_DIGEST_ENABLED=1`
  (opt-in explícito, porque `next start` também é produção e carrega
  `.env.local`). A tabela de envios mora no
  mesmo SQLite, então uma cópia do banco de produção rodando local com o token
  mandaria de novo nos canais reais. Em desenvolvimento, o token só serve para
  o seletor do admin; os envios são testados com cliente e relógio falsos.
  `docs/deploy.md` avisa que `SLACK_DIGEST_ENABLED` só deve existir no
  Easypanel.
- `docs/deploy.md` ganha o passo a passo para criar o app (de preferência
  com um manifesto pronto para colar), instalar no workspace, copiar o token e
  convidar o bot nos canais.

## 8. Verificador e registro de envios (decisão do Marcelo: dentro do app)

- `instrumentation.ts` inicia um terceiro agendador quando houver
  `SLACK_BOT_TOKEN`: um tick logo ao subir e depois a cada 15 minutos. Ele
  nunca lança (mesmo padrão de `sprint-scheduler.ts`).
- A cada tick: se não é dia útil, ou se a hora em São Paulo está fora de
  9h–12h, não faz nada. Senão, para cada projeto ativo com canal que ainda
  não foi resolvido hoje, monta a mensagem e envia.
- **Tabela nova de envios** (uma linha por projeto por dia, chave única
  `(project_id, day)`), com o resultado: enviado, nada a enviar ou erro, o
  horário, a mensagem de erro e o número de tentativas. Ela garante uma
  mensagem por dia e alimenta o "último envio / último erro" do admin.
- "Nada a enviar" também é registrado: o projeto é avaliado uma vez por dia,
  no primeiro tick depois das 9h. Uma tarefa criada às 10h vencendo hoje não
  gera mensagem tardia.
- **Antes de chamar o Slack**, o registro do dia é reservado (inserido como
  "enviando"), para que dois ticks sobrepostos nunca mandem duas vezes. Se o
  envio falhar, o registro vira "erro" e o próximo tick tenta de novo, até as
  12h.
- *Decisão do Claude:* só se tenta de novo quando é certo que o Slack não
  recebeu a mensagem: falha de DNS ou conexão recusada, resposta 5xx e
  `ratelimited`. Erros que não se resolvem sozinhos (`channel_not_found`,
  `not_in_channel`, `invalid_auth`, `account_inactive`) encerram o dia com
  erro.
- *Decisão do Claude:* resultado ambíguo também encerra o dia com erro, sem
  nova tentativa. Isso vale para timeout ou conexão caída depois que o pedido
  saiu, e para um registro "enviando" de um tick anterior (o app caiu no meio
  do envio). Mensagem duplicada é antiobjetivo, e um dia perdido não é. O
  admin mostra o erro.
- Um erro num projeto não impede os outros.
- *Decisão do Claude:* as menções são resolvidas com `users.lookupByEmail`
  uma vez por e-mail por tick (cache em memória só durante o tick). Falha na
  busca de uma pessoa não derruba a mensagem: vira o nome sem @.
- Logs no padrão `[slack] …`, como `[sprint]` e `[backup]`.

## 9. Abordagens consideradas

**Disparo**
- **A. Verificador dentro do app (escolhida pelo Marcelo).** Mesmo molde do
  agendador da sprint, sem peça nova no Easypanel. Custo: a mensagem sai até
  15 minutos depois das 9h.
- B. Cron externo (Easypanel ou GitHub Actions) chamando uma rota protegida.
  Horário exato, mas com segredo novo, agendamento fora do repositório e a
  mesma tabela de envios.
- Descartada: `chat.scheduleMessage` do Slack. A mensagem seria montada na
  véspera e mostraria tarefas já concluídas.

**Escolha do canal**
- **A. Lista dos canais em que o bot está (escolhida pelo Marcelo).** Não
  dá para errar o ID, e o "convide o bot" se explica sozinho. Custo: dois
  escopos a mais e uma chamada ao Slack ao abrir o admin.
- B. Colar o ID do canal. Mais simples, mas o erro só aparece no primeiro
  envio.

## 10. Fica com quem implementar

- Nome e colunas exatas da tabela de envios, e a migração Drizzle (colunas
  novas em `projects` são nullable, sem rebuild da tabela).
- Onde ficam os módulos (sugestão: `lib/slack/` para o cliente HTTP,
  `lib/core/` para montar o digest como função pura, `lib/core/holidays.ts`
  para os feriados).
- O layout do seletor e do status no admin, seguindo o design system da
  Axivero (skill `axivero-web`) e `PRODUCT.md`.
- Testes: digest e feriados como funções puras (incluindo anos com Páscoa em
  março e em abril, e semana com segunda feriado); o verificador com relógio e
  cliente do Slack falsos (sem repetir após restart, janela 9h–12h, erro
  permanente vs. transitório).
- Atualizar `docs/deploy.md` (variável nova e passo a passo do app do Slack)
  e `PRODUCT.md` se ele citar notificações.
