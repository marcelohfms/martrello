# Martrello multiusuário: convites, membros, responsáveis e sprints pessoais — design spec

**Data:** 2026-11-12
**Status:** rascunho para aprovação
**Autor:** Marcelo + Claude (brainstorming)

---

## 1. Por que

O Marcelo quer tornar o martrello o sistema oficial de gestão de tarefas da
Axivero. Hoje ele é um quadro de uma pessoa só: um login, nenhum dono de
projeto, nenhum responsável por tarefa e uma única sprint global.

Este projeto transforma o martrello num sistema para o time, em que cada
tarefa tem um responsável. Ele é o pré-requisito de um segundo projeto, um bot
do Slack que avisa no canal de cada projeto sobre tarefas atrasadas, que
vencem hoje e que vencem na semana. O bot tem design próprio, feito depois
deste (ver seção 12).

Sucesso: o Marcelo convida alguém da Axivero por e-mail, adiciona essa pessoa
a um projeto, atribui tarefas a ela, e a pessoa trabalha na própria sprint
semanal. Ela nunca enxerga os projetos pessoais do Marcelo, e todo movimento
das tarefas fica registrado com quem fez e quando.

## 2. Objetivos, não objetivos e antiobjetivos

### Objetivos

- Acesso só por convite, feito pelo admin, com login por e-mail.
- "Esqueci minha senha" por e-mail.
- Projetos com membros. Cada pessoa só vê os projetos de que é membro.
- Responsável por tarefa, obrigatório fora do Backlog.
- Fluxo fixo de listas: Backlog → A fazer → Fazendo → Feito.
- Sprint pessoal semanal, de segunda a domingo, aberta e fechada
  automaticamente.
- Histórico de todas as mudanças de cada tarefa, com autor e horário.
- MCP com identidade: cada pessoa usa o próprio token.
- Área de admin para convites, contas e membros de projeto.

### Não objetivos (fora deste projeto)

- O bot do Slack e a configuração de canal por projeto (projeto seguinte).
- Papéis além de admin e membro, ou permissões finas por projeto.
- Login social (Google, SSO) e autenticação em dois fatores.
- Comentários, menções e notificações dentro do martrello.
- Mais de um admin.

### Antiobjetivos (falha mesmo que funcione)

- Um membro conseguir ver, por qualquer caminho (tela, rota de API, MCP,
  busca, sprint, dependências), um projeto de que não é membro, inclusive os
  projetos pessoais do Marcelo.
- O Marcelo perder dados ou o próprio acesso na migração.
- O fluxo do Marcelo via Claude/MCP ficar mais trabalhoso do que hoje, como
  ter que informar responsável em toda tarefa que ele cria para si.

## 3. Estado atual (o que muda)

Levantado no código em 2026-11-12:

- `users` tem `username` e `password_hash`. As contas são criadas só pelo CLI
  `scripts/user-set.ts`. Não existe papel.
- `projects`, `lists` e `cards` não têm dono nem membros. As server actions em
  `app/actions.ts` só chamam `requireUser()`, sem checar acesso ao projeto.
  `app/api/card/[id]/route.ts` não checa nada além do `proxy.ts`.
- O MCP (`app/api/mcp/route.ts`) usa um token único em `MCP_TOKEN`. As
  chamadas não têm identidade.
- Existe uma única sprint ativa (tabela `sprints`) com colunas próprias
  `backlog/doing/done` em `sprint_slots`, independentes das listas do projeto.
  `closeSprint` arquiva os cards concluídos e leva os incompletos para a
  próxima sprint.
- Os projetos podem ter listas arbitrárias, criadas pelo MCP. Em produção,
  todos os projetos ativos têm exatamente A fazer, Fazendo e Feito.
- Labels são globais.
- O tempo real (`app/api/stream`) só emite "changed" e não envia dados.
- Existe um agendador dentro do app (`instrumentation.ts` →
  `lib/backup-scheduler.ts`), que pode servir de modelo para os jobs novos.
- `PRODUCT.md` descreve o produto como de usuário único e precisa ser
  atualizado.

## 4. Pessoas e papéis (decisões do Marcelo)

- **Admin:** só o Marcelo. Cria projetos, convida pessoas, desativa contas e
  adiciona ou remove membros de projetos.
- **Membro:** pessoas da Axivero convidadas pelo admin. Só veem os projetos de
  que são membros.
- Uma pessoa sem nenhum projeto vê o quadro vazio.

*Decisões do Claude:*
- O admin vê todos os projetos. Na prática ele é membro de todos, porque cria
  todos.
- Dentro de um projeto, o membro pode criar, editar, mover, arquivar e
  desarquivar tarefas, gerenciar labels e dependências entre tarefas do mesmo
  projeto. Ele não pode criar, renomear, reordenar nem arquivar projetos, nem
  mexer em membros.
- Labels continuam globais. Qualquer membro pode criar labels, e só o admin
  pode excluir.

## 5. Contas, convite e senha (decisões do Marcelo)

- O login passa a ser por e-mail, no lugar do `username`.
- O admin convida pelo e-mail na área de admin. O martrello envia o convite
  pelo **Resend**.
- No primeiro acesso, pelo link do convite, a pessoa define a senha.
- A tela de login ganha "Esqueci minha senha", que envia por e-mail um link
  para definir uma senha nova.
- Desativar uma conta corta o acesso na hora: encerra as sessões e invalida os
  tokens do MCP.
- As tarefas da pessoa desativada voltam para o Backlog do projeto, sem
  responsável.

*Decisões do Claude:*
- O convite pede **nome** e e-mail. O nome aparece como responsável nos cards
  e no histórico.
- O link do convite vale 7 dias e pode ser reenviado, o que invalida o link
  anterior. O link de redefinição de senha vale 1 hora. Os dois são de uso
  único. Só o hash do token fica guardado, no mesmo padrão das sessões.
- O "Esqueci minha senha" sempre responde a mesma mensagem, exista o e-mail ou
  não, e tem rate limit por IP e por e-mail.
- A regra de senha atual continua: mínimo de 12 caracteres.
- Trocar a senha encerra as outras sessões, como já acontece hoje.
- A desativação só mexe nas tarefas ativas: as de A fazer e Fazendo voltam
  para o Backlog sem responsável, e as que já estão no Backlog ficam lá, sem
  responsável. Tarefas em Feito e arquivadas mantêm o responsável, como
  registro de quem fez. O histórico guarda quem era o responsável antes.
- Um convite para um e-mail que já tem conta ativa dá erro na área de admin.
  Uma conta desativada pode ser reativada pelo admin. A reativação não devolve
  tarefas nem projetos: o admin readiciona a pessoa aos projetos e reatribui o
  que for preciso.
- O remetente e o domínio ficam em variáveis de ambiente (`RESEND_API_KEY`,
  `EMAIL_FROM`). Sem `RESEND_API_KEY`, o martrello não envia e-mails e a área
  de admin mostra o link do convite para copiar. Isso serve para
  desenvolvimento local e como plano B.
- O CLI `scripts/user-set.ts` continua existindo para emergência, agora por
  e-mail.

## 6. Membros de projeto

- Cada projeto tem uma lista de membros, gerenciada pelo admin.
- Só membros podem ser responsáveis por tarefas do projeto.

*Decisões do Claude:*
- Remover alguém de um projeto tem o mesmo efeito da desativação, só naquele
  projeto: as tarefas da pessoa ali em A fazer e Fazendo voltam para o Backlog
  sem responsável, e as do Backlog perdem o responsável. As que estão em Feito
  ou arquivadas mantêm o responsável.
- Um responsável inativo ou que não é mais membro só pode existir em tarefas
  em Feito ou arquivadas. Para atribuir uma tarefa nova, a pessoa precisa ser
  membro ativo do projeto. Uma tarefa que entra em Feito vinda de outra etapa
  com um responsável assim passa para quem fez a ação.
- Ao criar um projeto, o admin vira membro automaticamente.

## 7. Listas, responsável e sprint pessoal (decisões do Marcelo)

### Listas

- Todo projeto tem quatro listas fixas, nesta ordem: **Backlog, A fazer,
  Fazendo, Feito**.

*Decisão do Claude:* as listas viram etapas fixas, porque as regras abaixo
dependem delas. Não dá para criar, excluir, renomear nem reordenar listas, e
as ferramentas do MCP para isso saem. A tabela `lists` pode continuar, ganhando
uma coluna de etapa (`stage`), ou ser substituída por uma etapa no próprio
card. A escolha fica com quem implementar.

### Responsável

- No Backlog, a tarefa pode ficar sem responsável.
- Para sair do Backlog, a tarefa precisa ter responsável.
- Mover para A fazer, ou direto para Fazendo ou Feito, coloca a tarefa na
  sprint do responsável.

*Decisões do Claude:*
- Uma tarefa criada fora do Backlog, ou movida para fora dele sem
  responsável, recebe como responsável quem fez a ação. Isso vale para a tela e
  para o MCP. Sem isso, o Marcelo teria que informar responsável em toda tarefa
  que cria para si pelo Claude (ver antiobjetivos).
- Fora do Backlog não dá para tirar o responsável, só trocar por outro membro.
- Trocar o responsável tira a tarefa da sprint da pessoa anterior e coloca na
  sprint do novo responsável.
- Voltar a tarefa para o Backlog tira ela da sprint e mantém o responsável.
- Mover uma tarefa para outro projeto exige que o responsável seja membro do
  projeto de destino. Se não for, a ação dá erro.
- Ao mover para Feito, o card grava `completed_at`. Ao sair de Feito, o campo é
  limpo.

### Sprint pessoal

- Cada pessoa tem uma sprint semanal, de segunda a domingo.
- As sprints abrem e fecham sozinhas. Não existe mais iniciar ou encerrar à
  mão.
- O que não foi concluído passa para a sprint da semana seguinte.

*Decisões do Claude:*
- O horário de referência é America/Sao_Paulo. A semana fecha na virada de
  domingo para segunda.
- A sprint deixa de ter colunas próprias. O quadro da sprint mostra as tarefas
  do responsável que estão em A fazer, Fazendo ou Feito, de todos os projetos,
  agrupadas por essas etapas. Arrastar na sprint muda a lista da tarefa no
  projeto, e vice-versa. A ordenação por prazo mais próximo, que já existe,
  continua.
- Ao fechar a semana, o fechamento guarda o snapshot da sprint. As tarefas em
  A fazer e Fazendo seguem para a sprint nova. O histórico de sprints de cada
  pessoa continua disponível.
- **Decisão do Marcelo:** o fechamento **não arquiva** nada. As tarefas
  concluídas na semana só saem da sprint e continuam na lista Feito do projeto
  até alguém arquivar. Isso muda o comportamento atual do `closeSprint`. A
  sprint da semana mostra em Feito só o que foi concluído naquela semana
  (`completed_at` dentro da semana).
- **Decisão do Marcelo:** a lista Feito do projeto é ordenada pela data de
  conclusão, com a última concluída sempre em cima, e cada card em Feito
  mostra a data de conclusão. Nessa lista não existe ordenação manual.
- A regra de "concluída" para dependências passa a ser: estar em Feito ou
  arquivada.
- O fechamento roda num job agendado, no padrão do backup: um tick periódico
  que fecha e abre as sprints de quem ainda não tem a sprint da semana atual.
  Ao acessar a sprint, o sistema também garante que a da semana corrente
  existe, para o resultado não depender do horário exato do job.
- O nome da sprint é derivado da semana, por exemplo "Semana 16/11".
- O admin só vê a própria sprint. Ver a sprint dos outros fica fora deste
  projeto.

## 8. Histórico de mudanças (decisão do Marcelo)

- Toda mudança em uma tarefa fica registrada com data e hora.

*Decisões do Claude:*
- Uma tabela de eventos por card guarda: card, autor (usuário, ou "sistema"
  para o fechamento automático de sprint e os efeitos de desativação), tipo,
  valor anterior, valor novo e horário.
- Tipos registrados: criação, título, descrição, prazo, lista ou etapa,
  projeto, responsável, labels, dependências, arquivamento e desarquivamento,
  entrada e saída de sprint.
- O registro é feito na camada `lib/core`, para valer igual na tela e no MCP.
- O painel do card mostra o histórico em ordem cronológica. O MCP ganha uma
  ferramenta para ler o histórico de um card.
- O histórico é só de leitura e nunca é apagado.

## 9. MCP com identidade

*Decisões do Claude:*
- Cada pessoa gera e revoga os próprios tokens do MCP numa página "Minha
  conta". Só o hash fica guardado. O token aparece uma única vez, na criação.
- O MCP passa a agir como o dono do token. Ele respeita as mesmas regras de
  visibilidade e permissão da tela e registra o autor no histórico.
- O `MCP_TOKEN` de ambiente continua aceito e passa a agir como a conta do
  admin, para não quebrar a configuração atual do Marcelo. Ele pode ser
  removido depois que o Marcelo gerar um token pessoal.
- As ferramentas de cards aceitam `assignee` (e-mail ou nome do membro) e
  ganham um filtro de "minhas tarefas". As de sprint deixam de iniciar e
  encerrar e passam a mostrar a sprint de quem chama. As de listas saem.
  As de membros e convites ficam só na área de admin, não no MCP.

## 10. Área de admin

Página visível só para o admin. *Decisões do Claude sobre o conteúdo:*

- **Pessoas:** lista de contas ativas, convites pendentes e contas
  desativadas. Ações: convidar (nome e e-mail), reenviar convite, cancelar
  convite, desativar e reativar conta.
- **Projetos:** para cada projeto, a lista de membros. Ações: adicionar e
  remover membros.
- Quando o Resend não estiver configurado, a tela mostra o link do convite
  para copiar.

## 11. Migração dos dados atuais

- A conta atual (`marcelo`) passa a ter o e-mail **marcelo.ferro@axivero.com.br**
  (informado pelo Marcelo) e vira admin. A senha é mantida.

*Decisões do Claude:*
- O Marcelo vira membro de todos os projetos existentes, inclusive os
  arquivados.
- Todas as tarefas existentes, inclusive as arquivadas, ganham o Marcelo como
  responsável.
- Todo projeto ganha a lista Backlog antes de A fazer.
- **Decisão do Marcelo:** a sprint do Marcelo começa igual à de hoje. Na
  migração, as tarefas ativas em A fazer que **não** estão na sprint atual vão
  para o Backlog do projeto, mantendo o Marcelo como responsável. Hoje, A fazer
  funciona como pilha geral de pendências, e na regra nova é o Backlog que tem
  esse papel.
- A sprint ativa vira a sprint pessoal do Marcelo. A coluna de sprint antiga
  (`backlog/doing/done`) deixa de existir. Se algum card da sprint antiga
  estiver numa etapa diferente da lista do projeto, vale a lista do projeto.
- Tarefas ativas em Fazendo ou Feito que não estão na sprint atual ficam onde
  estão. As de Fazendo entram na sprint do Marcelo, pela regra nova. As de
  Feito ganham `completed_at` igual ao seu `updated_at` e não entram na sprint
  da semana. Em produção, a lista Feito de todos os projetos foi esvaziada em
  2026-11-12.
- Sprints fechadas continuam no histórico do Marcelo, com os snapshots
  existentes.
- Se algum projeto tiver listas fora de A fazer, Fazendo e Feito, a migração
  para com erro e lista os projetos afetados, sem alterar nada. Em produção,
  hoje, nenhum projeto ativo tem.
- Os cards existentes não têm histórico anterior à migração. O primeiro evento
  de cada um é a própria migração.
- Antes de migrar em produção, fazer um backup manual, conforme
  `docs/deploy.md`.

## 12. Ligação com o bot do Slack (projeto seguinte)

Fica registrado o que o bot vai precisar, para este projeto não fechar portas:

- Uma mensagem por dia útil, às 9h no horário de Brasília, no canal de cada
  projeto que tenha canal do Slack configurado. Projetos pessoais, sem canal,
  nunca recebem mensagem.
- Segunda-feira: uma mensagem com 🔴 Atrasadas, 🟡 Vencem hoje e 🗓️ Resto da
  semana. De terça a sexta: Atrasadas e Vencem hoje. Formato escolhido: opção
  A, agrupado por prazo, com o responsável marcado (@) em cada linha.
- O bot pode achar o usuário do Slack pelo e-mail da conta do martrello, por
  isso o e-mail de login deve ser o mesmo do Slack da Axivero.
- O agendador e o horário America/Sao_Paulo deste projeto podem ser
  reaproveitados.

## 13. O que fica com quem implementar

- O modelo exato das tabelas e as migrações Drizzle, inclusive se a etapa fica
  em `lists` ou no card.
- O layout da área de admin, da página "Minha conta", do seletor de
  responsável e do histórico no card. Tudo segue o design system da Axivero
  (skill `axivero-web`) e os princípios de `PRODUCT.md`.
- Como mostrar o responsável no card do quadro (iniciais, avatar ou nome).
- O texto dos e-mails de convite e de redefinição de senha.
- A ordem de entrega, desde que a migração de produção rode uma vez só, com
  backup antes.
- Atualizar `PRODUCT.md` e `docs/deploy.md` (variáveis novas, como gerar
  token do MCP e o fluxo de convite).
