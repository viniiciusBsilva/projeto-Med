# Design System — PostCare Pro

> Padrão visual fiel ao mockup. **Não redesenhar**: codificar o que já existe.
> Estilo: SaaS de saúde, azul confiável, superfícies claras, cantos arredondados,
> sidebar com item ativo em pill sólido, suporte a dark mode.
>
> Hex aproximados do mockup — ajuste fino à marca é permitido, mas mantenha a relação
> entre os tokens (primário azul, semânticos verde/âmbar/vermelho, neutros slate).

---

## 1. Marca
- Nome: **PostCare** (regular) **Pro** (destaque no primário).
- Logo: ícone de "pulso/atividade" (activity) branco sobre quadrado primário com raio `lg`.
- Ícones: biblioteca **lucide** (linha, 1.5–2px), consistente nos dois apps.

## 2. Cores

### 2.1 Primário (azul)
| Token | Hex |
| --- | --- |
| primary-50  | `#EFF6FF` |
| primary-100 | `#DBEAFE` |
| primary-200 | `#BFDBFE` |
| primary-300 | `#93C5FD` |
| primary-400 | `#60A5FA` |
| primary-500 | `#3B82F6` |
| **primary-600** (base) | `#2563EB` |
| primary-700 | `#1D4ED8` |
| primary-800 | `#1E40AF` |
| primary-900 | `#1E3A8A` |

Uso: item ativo da sidebar, botões primários, logo, links, série "Pacientes" nos gráficos.

### 2.2 Semânticos
| Papel | Base | Fundo suave (light) | Texto/realce |
| --- | --- | --- | --- |
| **success** (finalizados, ▲) | `#16A34A` | `#DCFCE7` | `#15803D` |
| **warning** (consultas/hoje) | `#F59E0B` | `#FEF3C7` | `#B45309` |
| **danger** (alertas, ▼) | `#DC2626` | `#FEE2E2` | `#B91C1C` |
| **info** (neutro-azul) | `#2563EB` | `#DBEAFE` | `#1D4ED8` |

Mapa dos cartões do Dashboard: Ativos→primary · Alerta→danger · Finalizados→success ·
Consultas→warning · Mensagens→success/info. Ícone sobre fundo suave da própria cor.

### 2.3 Neutros (slate)
| Token | Light | Dark |
| --- | --- | --- |
| bg (página)      | `#F8FAFC` | `#0B1120` |
| surface (card)   | `#FFFFFF` | `#1E293B` |
| surface-2        | `#F1F5F9` | `#0F172A` |
| border           | `#E2E8F0` | `#334155` |
| text-strong      | `#0F172A` | `#F1F5F9` |
| text             | `#475569` | `#CBD5E1` |
| text-muted       | `#94A3B8` | `#94A3B8` |

## 3. Tipografia
- Família: **Inter** (fallback: system-ui, sans-serif). Números tabulares nas métricas.
- Escala:

| Papel | Tamanho / Peso | Uso |
| --- | --- | --- |
| Display | 30px / 700 | Título de página ("Dashboard") |
| H2 | 20px / 600 | Título de seção/card |
| H3 | 16px / 600 | Subtítulo |
| Body | 14px / 400 | Texto padrão |
| Body-strong | 14px / 600 | Rótulos, links |
| Caption | 13px / 500 | Legendas, texto muted |
| Stat | 34px / 700 | Número dos cartões de métrica |

Subtítulo de página em `text` (ex.: "Visão geral do acompanhamento pós-operatório").

## 4. Layout
- **Sidebar:** largura `260px`, `surface`, itens com ícone + label; ativo = fundo
  `primary-600` texto branco, raio `md`; badges (Mensagens/Notificações) como pill
  pequeno. Rodapé: card "Plano" com barra de progresso + botão "Gerenciar assinatura".
- **Topbar:** altura `64px`; busca à esquerda (input full, ícone lupa), à direita
  toggle de tema (lua), sino de notificações com badge, avatar.
- **Conteúdo:** padding `32px`; grid de métricas responsivo (5→3→2→1 conforme largura).
- **Breakpoints:** `sm 640 · md 768 · lg 1024 · xl 1280`. Abaixo de `lg`, sidebar colapsa em drawer.

## 5. Forma & elevação
- **Raio:** `sm 8px · md 12px · lg 16px · full 9999`. Cards `lg`; botões/inputs `md`; pills `full`.
- **Sombra card:** `0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06)`.
- **Borda:** 1px `border`. Cards podem usar borda + sombra suave juntas.
- **Espaçamento:** escala de 4px (4/8/12/16/24/32). Gap padrão entre cards: 24px.

## 6. Componentes

- **Botão primário:** `primary-600`, texto branco, raio `md`, hover `primary-700`,
  foco anel `primary-300`. Ex.: "+ Novo paciente".
- **Botão secundário:** `surface`, borda `border`, texto `text-strong`, hover `surface-2`.
  Ex.: "Exportar relatório", "Ver análise completa".
- **Cartão de métrica:** ícone em quadrado com fundo suave da cor semântica (raio `md`),
  variação (▲/▼) no canto, valor `Stat`, rótulo `text`.
- **Badge/pill:** fundo suave + texto da cor semântica; numérico na sidebar em `primary`/`danger`.
- **Input/busca:** `surface`, borda `border`, ícone à esquerda, foco anel `primary`.
- **Tabela/lista:** cabeçalho `text-muted` 13px, linhas com divisória `border`,
  hover `surface-2`; status como badge semântico.
- **Item de agenda/retorno:** bloco de data (dia grande + mês), título, horário · profissional.
- **Bolha de mensagem:** paciente = `surface-2` alinhada à esquerda; clínica =
  `primary-600` texto branco à direita; timestamp `caption`.
- **Bloco IA:** card com ícone da marca, título "Resumo semanal da IA", corpo em `text`,
  ação secundária "Ver análise completa".
- **Estado vazio:** ícone neutro + frase orientando a ação (ver escrita, §8).

## 7. Dark mode
- Alternado pelo toggle da topbar; persistir preferência.
- Trocar bg/surface/border/text pelos valores da coluna Dark (§2.3). Primário e
  semânticos mantêm o matiz; usar variantes suaves com opacidade reduzida no fundo.

## 8. Escrita na interface
- Voz ativa, sentence case, pt-BR. Botão diz o que faz ("Salvar", não "Enviar").
- Erros explicam o que aconteceu e como resolver, sem se desculpar.
- Estado vazio é convite à ação ("Nenhum paciente ainda. Cadastre o primeiro.").
- Nomear pelo que o usuário controla, nunca pela implementação.

## 9. Tokens para Tailwind (referência)

> **Como vive no painel:** a stack é **Next.js + shadcn/ui**, então no painel os tokens são
> **CSS variables em HSL** definidas em `apps/panel/app/globals.css` (light + `.dark`) e
> referenciadas pelo `tailwind.config.ts` via `hsl(var(--token))`. O mapa hex→HSL abaixo é a
> fonte da verdade; já implementado fielmente — ex.: `--primary: 221 83% 53%` = `#2563EB`
> (primary-600), `--background: 210 40% 98%` = `#F8FAFC`, `--radius: .75rem` = 12px (md).
> Ao ajustar a marca, altere as CSS vars mantendo a relação entre os tokens.

```js
// tailwind.config — theme.extend
colors: {
  primary: {
    50:'#EFF6FF',100:'#DBEAFE',200:'#BFDBFE',300:'#93C5FD',400:'#60A5FA',
    500:'#3B82F6',600:'#2563EB',700:'#1D4ED8',800:'#1E40AF',900:'#1E3A8A',
  },
  success:{ DEFAULT:'#16A34A', soft:'#DCFCE7', text:'#15803D' },
  warning:{ DEFAULT:'#F59E0B', soft:'#FEF3C7', text:'#B45309' },
  danger: { DEFAULT:'#DC2626', soft:'#FEE2E2', text:'#B91C1C' },
},
borderRadius:{ sm:'8px', md:'12px', lg:'16px' },
boxShadow:{ card:'0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06)' },
fontFamily:{ sans:['Inter','system-ui','sans-serif'] },
```
Para o app Flutter, replicar os mesmos hex em um `AppColors`/`ThemeData` (light+dark)
e a mesma escala tipográfica com Inter.
