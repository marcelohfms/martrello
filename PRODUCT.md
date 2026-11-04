# Product

<!-- impeccable:product-schema 1 -->

<!-- Fatos marcados "(inferido)" vieram do código e do histórico de uso, sem entrevista formal. Corrigir quando divergirem. -->

## Platform

web

## Users

Um único usuário: Marcelo, que usa o martrello para acompanhar o próprio trabalho em vários projetos paralelos, de consultoria, aulas e clientes (inferido do histórico de uso). Consulta no notebook durante o expediente e às vezes no celular (inferido do drawer mobile já existente).

## Product Purpose

Trello pessoal em que o Claude é quem mais escreve: cards e projetos são criados e movidos por conversa, via MCP, e a interface web serve para enxergar o estado do trabalho e ajustar à mão. O sucesso é saber em segundos o que está em andamento, em qual projeto e o que está atrasado ou bloqueado.

## Positioning

Um quadro de uma pessoa só, operado principalmente por um agente através de MCP local e remoto, sem equipe, permissões ou recursos colaborativos.

## Operating Context

- O Sprint reúne cards de projetos diferentes num único quadro com colunas Backlog, Fazendo e Feito.
- Os projetos aparecem por acrônimo (AXV, MTM, EIA…) por padrão. O botão de olho revela os nomes reais apenas na memória da página, para o quadro poder aparecer em tela compartilhada sem expor clientes. Recarregar a página volta a esconder.
- Mudanças feitas pelo MCP chegam à interface em tempo real.

## Capabilities and Constraints

- Projetos, listas, cards com arrastar e soltar, labels, prazos, dependências (cards bloqueados), sprints, arquivamento.
- Login de usuário único com argon2. Produção em VPS própria sob Easypanel.
- Next.js App Router com SQLite. Sem modo multiusuário.

## Brand Commitments

- Visual pelo Design System da Axivero (skill `axivero-web`), pedido explicitamente pelo usuário: verde-floresta, neutros quentes, Plus Jakarta Sans, monograma X sem distorção, ícones Lucide, separador `//`.
- Interface em português do Brasil, com tom sóbrio e direto, sem exclamações e sem emoji.
- O produto continua se chamando martrello.

## Evidence on Hand

Dados reais de projetos e cards no banco de produção. Assets da marca em `public/brand/`, derivados do skill `axivero-web`. Nenhum depoimento, métrica ou cliente deve ser inventado.

## Product Principles

1. O quadro aparece primeiro: nada compete com a leitura das colunas e dos cards.
2. Atrasado e bloqueado são sinais que precisam ser percebidos sem abrir o card.
3. A privacidade é o padrão: em nenhum lugar um nome real de projeto aparece sem o usuário pedir.
4. O que o Claude escreveu precisa ser fácil de conferir e corrigir à mão.

## Accessibility & Inclusion

Sem requisito formal além de contraste AA, foco visível, navegação por teclado nos controles e respeito a `prefers-reduced-motion`, já presentes no projeto (inferido).
