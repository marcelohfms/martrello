---
name: martrello
description: Quadro pessoal de trabalho com a identidade da Axivero
colors:
  forest-green: "#002b0f"
  deep-green: "#23512a"
  working-green: "#388143"
  signal-green: "#5bb168"
  warm-paper: "#f8f8f6"
  light-greige: "#eae7e4"
  greige: "#dbcfc5"
  hairline: "#e3deda"
  field-line: "#8f8780"
  card-white: "#ffffff"
  ink: "#222222"
  warm-muted: "#6b6560"
  rail-muted: "#a3b5a5"
  danger-red: "#a9272a"
  danger-soft: "#f8ecec"
  warning-gold: "#855421"
  warning-soft: "#faf3e3"
typography:
  page-title:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  panel-title:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  card-title:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  label-caps:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.12em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.forest-green}"
    textColor: "{colors.warm-paper}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.deep-green}"
  button-secondary:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.forest-green}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-secondary-hover:
    backgroundColor: "{colors.light-greige}"
  button-inverse:
    backgroundColor: "{colors.greige}"
    textColor: "{colors.forest-green}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  field:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "7px 10px"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.forest-green}"
    typography: "{typography.card-title}"
    rounded: "{rounded.md}"
  column:
    backgroundColor: "{colors.light-greige}"
    rounded: "{rounded.lg}"
    width: "288px"
  rail:
    backgroundColor: "{colors.forest-green}"
    textColor: "{colors.greige}"
    width: "240px"
---

# Design System: martrello

## Overview

**Creative North Star: "O quadro de trabalho de uma consultoria"**

O martrello usa a identidade da Axivero a serviço de um kanban que qualquer usuário de Trello lê de imediato. A marca entra por cor, tipo, densidade e um único gesto próprio; navegação e controles continuam os esperados. O fundo é claro porque a cena é um notebook com luz de escritório.

A densidade é de ferramenta de trabalho: muitos cards visíveis, textos curtos, nada competindo com as colunas. A cor faz trabalho real: o verde-floresta marca o que é estrutura, e vermelho e dourado aparecem só quando há algo atrasado ou bloqueado.

**Key Characteristics:**
- Trilho verde-floresta fixo à esquerda, conteúdo sobre paper e colunas em greige
- Plus Jakarta Sans em tudo, com rótulos em caixa alta e tracking largo
- Cards brancos com filete fino e sombra difusa
- No Sprint, o trilho dobra sobre o cabeçalho e forma uma faixa em L
- Separador `//` em títulos de apoio

## Colors

Verdes profundos e neutros quentes, com vermelho e dourado reservados para estado.

### Primary
- **Forest Green:** trilho, faixa do Sprint, botão primário e títulos.
- **Deep Green:** hover do botão primário e ícones de ação nos cards.
- **Working Green:** anel de coluna em arrasto, foco e caret.
- **Signal Green:** progresso concluído e ícone do Sprint sobre o trilho.

### Neutral
- **Warm Paper:** fundo das páginas e superfícies internas do painel.
- **Light Greige:** colunas do quadro.
- **Greige:** texto sobre o trilho e bordas de botões secundários.
- **Hairline:** borda dos cards e divisórias.
- **Field Line:** borda de campos, escura o bastante para 3:1 sobre branco.
- **Card White:** cards, cabeçalho de projeto e painel.
- **Ink:** texto corrido.
- **Warm Muted:** texto secundário, contagens e rótulos de seção.
- **Rail Muted:** texto secundário sobre o trilho.

### Tertiary
- **Danger Red e Danger Soft:** prazo atrasado, erros e ações destrutivas.
- **Warning Gold e Warning Soft:** card bloqueado.

### Named Rules
**The Earned Color Rule.** Vermelho e dourado só aparecem quando carregam estado. Nunca como decoração.

**The Project Data Rule.** A cor do projeto é dado do usuário: aparece em pontos e tints, sempre com texto escuro ou claro do sistema por cima, nunca como cor de texto.

## Typography

**Body Font:** Plus Jakarta Sans (com ui-sans-serif, system-ui)

**Character:** Uma única família variável, auto-hospedada, que vai de títulos firmes a dados pequenos. Números usam algarismos tabulares em toda a interface.

### Hierarchy
- **Page title** (bold, 18px, tracking -0.02em): nome do projeto ou da sprint no cabeçalho.
- **Panel title** (bold, 16px): título editável do card no painel.
- **Card title** (semibold, 13.5px): título do card nas colunas.
- **Body** (regular, 13px, 1.55): descrição, campos e mensagens.
- **Label caps** (bold, 11px, tracking +12%, maiúsculas): cabeçalho de coluna e rótulos de seção.

### Named Rules
**The One Family Rule.** Nenhuma segunda família entra na interface. A exceção é código dentro do markdown das descrições.

## Layout

Trilho de 240px mais conteúdo em altura total. Cabeçalhos têm 56px. As colunas ocupam toda a altura disponível e rolam por dentro, de modo que a soltura de cards funciona em toda a coluna. Em projetos, cada coluna tem 288px; no Sprint, as três colunas crescem até 448px em telas médias ou maiores. O painel do card ocupa 440px à direita e a tela inteira abaixo de 640px.

Abaixo de 768px, o trilho vira gaveta, o menu é um botão opaco legível sobre os dois cabeçalhos, e as colunas rolam na horizontal com snap, preservando a margem de 16px.

## Elevation & Depth

Sistema discreto em duas camadas, sempre com deslocamento e desfoque suave, sem sombras coloridas. Superfícies do trilho e das colunas são planas.

### Shadow Vocabulary
- **Card** (`0 1px 2px rgb(11 11 11 / 0.06), 0 4px 12px rgb(11 11 11 / 0.06)`): cards em repouso.
- **Raised** (`0 4px 8px rgb(11 11 11 / 0.08), 0 12px 32px rgb(11 11 11 / 0.1)`): card em arrasto, painel e formulário de login.

## Shapes

Cantos discretos: 4px em elementos pequenos, 8px em botões, campos e cards, 12px em colunas e no formulário de login. A pílula é exclusiva de tags e chips. O monograma X nunca é distorcido.

## Components

### Buttons
Sóbrios e diretos, semibold 13px.
- **Primary:** verde-floresta com texto paper; o hover clareia um passo no ramp.
- **Secondary:** branco com borda greige; hover em greige claro.
- **Ghost:** sem fundo, texto verde; hover com véu verde de 6%.
- **Danger ghost:** texto vermelho; hover em vermelho suave.
- **Inverse e Rail:** para uso sobre verde-floresta.
- **Focus:** anel verde translúcido de 3px; sobre o trilho, o anel usa o Signal Green.

### Chips
- **Project tag:** pílula com tint de 16% da cor do projeto, ponto na cor cheia e acrônimo em bold. Largura mínima de 52px, para os títulos alinharem no Sprint. Mostra sempre o acrônimo; o nome real só aparece como tooltip depois de revelado.
- **Label toggle:** pílula com borda; selecionada, fica verde-floresta com ícone de confirmação.
- **Blocked chip:** dourado suave com cadeado.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** branco sobre colunas em greige.
- **Border:** filete de 1px; escurece no hover.
- **Internal Padding:** 10px por 12px, com folga à direita para o botão de Sprint.
- **Sprint button:** canto superior direito, com raio para enviar e seta de retorno para tirar da Sprint. Alvo de 44px em ponteiros grossos. Some quando não há sprint ativa.

### Inputs / Fields
- **Style:** fundo branco, borda Field Line, 8px.
- **Focus:** borda Working Green e anel translúcido.
- **Disabled:** opacidade 0.6.

### Navigation
Trilho verde-floresta com a marca, o botão de revelar nomes, o link do Sprint, a lista de projetos por acrônimo com contagem e o botão Sair. O item ativo recebe véu greige de 18% e semibold.

### Sprint Band
No Sprint, o cabeçalho assume o verde do trilho e os dois formam um L. A faixa traz o nome da sprint, `// Dia N`, a barra empilhada de feito e em andamento, e o fechamento da sprint.

## Do's and Don'ts

### Do:
- **Do** usar ícones Lucide com traço de 1.75 a 2px.
- **Do** mostrar atrasado e bloqueado no próprio card, sem exigir abertura.
- **Do** manter acrônimos como padrão em qualquer lugar onde um projeto apareça.
- **Do** usar transições de 150 a 250ms com ease-out, só para indicar estado.
- **Do** escrever em português do Brasil, sem exclamações e sem emoji.

### Don't:
- **Don't** usar faixa colorida grossa na lateral dos cards; estado e label vivem em chips e pontos.
- **Don't** usar glassmorphism na interface; imagem de fundo e malha só no login, sobre verde escuro.
- **Don't** usar animação decorativa ou em loop fora de skeletons de carregamento.
- **Don't** mostrar o nome real de um projeto sem o usuário revelar.
