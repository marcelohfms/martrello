# Product

<!-- impeccable:product-schema 1 -->

<!-- Fatos marcados "(inferido)" vieram do código e do histórico de uso, sem entrevista formal. Corrigir quando divergirem. -->

## Platform

web

## Users

O time da Axivero. Marcelo é o único admin: convida as pessoas por e-mail, cria os projetos e define quem participa de cada um. Os membros entram só por convite e trabalham na própria sprint semanal. Cada pessoa vê apenas os projetos de que é membro; os projetos pessoais do Marcelo ficam fora do alcance do time. Uso no notebook durante o expediente e às vezes no celular (inferido do drawer mobile já existente).

## Product Purpose

Sistema de gestão de tarefas da Axivero em que o Claude é quem mais escreve: cards e projetos são criados e movidos por conversa, via MCP, com o token pessoal de cada pessoa, e a interface web serve para enxergar o estado do trabalho e ajustar à mão. Toda tarefa fora do Backlog tem um responsável, e todo movimento fica registrado com autor e horário. O sucesso é cada pessoa saber em segundos o que está na sua semana, em qual projeto e o que está atrasado ou bloqueado.

## Positioning

Um quadro de time pequeno, com acesso só por convite, projetos com membros e responsável por tarefa, operado principalmente por agentes através de MCP local e remoto. Sem papéis além de admin e membro, sem comentários nem notificações dentro do produto (os avisos de prazo vão pelo Slack, fora do produto).

## Operating Context

- Cada pessoa tem a própria sprint, semanal (segunda a domingo, America/Sao_Paulo), aberta e fechada automaticamente. Ela reúne os cards da pessoa, de projetos diferentes, nas colunas A fazer, Fazendo e Feito. Fechar a sprint não arquiva nada, e o Feito é ordenado pela data de conclusão.
- Cada projeto tem o fluxo fixo Backlog, A fazer, Fazendo e Feito. O Backlog não exige responsável.
- Os projetos aparecem por acrônimo (AXV, MTM, EIA…) por padrão. O botão de olho revela os nomes reais apenas na memória da página, para o quadro poder aparecer em tela compartilhada sem expor clientes. Recarregar a página volta a esconder.
- Mudanças feitas pelo MCP chegam à interface em tempo real.
- O login é por e-mail. O e-mail de login deve ser o mesmo e-mail Axivero da pessoa no Slack, porque o bot do Slack usa o e-mail para marcar a pessoa.

## Capabilities and Constraints

- Projetos com membros, listas fixas, cards com arrastar e soltar, responsável, labels, prazos, dependências (cards bloqueados), sprints pessoais, histórico de mudanças de cada card, arquivamento.
- Área de admin (`/admin`) para convites, contas e membros de projeto. Página Minha conta (`/conta`) para trocar a senha e gerar o token pessoal do MCP.
- Login por e-mail com argon2, convite e redefinição de senha por e-mail (Resend). Produção em VPS própria sob Easypanel.
- Next.js App Router com SQLite. Um único admin.

## Brand Commitments

- Visual pelo Design System da Axivero (skill `axivero-web`), pedido explicitamente pelo usuário: verde-floresta, neutros quentes, Plus Jakarta Sans, monograma X sem distorção, ícones Lucide, separador `//`.
- Interface em português do Brasil, com tom sóbrio e direto, sem exclamações e sem emoji.
- O produto continua se chamando martrello.

## Evidence on Hand

Dados reais de projetos e cards no banco de produção, mantidos na migração para multiusuário. Assets da marca em `public/brand/`, derivados do skill `axivero-web`. Nenhum depoimento, métrica ou cliente deve ser inventado.

## Product Principles

1. O quadro aparece primeiro: nada compete com a leitura das colunas e dos cards.
2. Atrasado e bloqueado são sinais que precisam ser percebidos sem abrir o card.
3. A privacidade é o padrão: em nenhum lugar um nome real de projeto aparece sem o usuário pedir, e um membro nunca vê projetos de que não participa.
4. O que o Claude escreveu precisa ser fácil de conferir e corrigir à mão.

## Accessibility & Inclusion

Sem requisito formal além de contraste AA, foco visível, navegação por teclado nos controles e respeito a `prefers-reduced-motion`, já presentes no projeto (inferido).
