# Padrão do Projeto — PostCare Pro

> Convenções de engenharia. Leia junto com `PRD.md` e `DESIGN_SYSTEM.md`.
> Este arquivo também serve de guia para o Claude Code (ver §10).

---

## 1. Stack
- **Painel da clínica:** **Next.js 13 (App Router)** + TypeScript, Tailwind, **Supabase JS**.
  UI com **shadcn/ui** (Radix), ícones **lucide-react**, gráficos **recharts**,
  formulários **react-hook-form + zod**, tema (dark mode) via **next-themes**.
  Server-state: começar com Server Components / `fetch` nas rotas; adicionar
  **TanStack Query** apenas onde houver interatividade client-side (decisão da fase 1).
- **App do paciente:** **Flutter** (Dart), `supabase_flutter`, nativo iOS/Android.
- **Backend:** **Supabase** (Postgres + Auth + RLS + Realtime + Storage) e
  **Edge Functions** (Deno/TypeScript) para lógica que não cabe em RLS/trigger
  (ex.: resumo IA, webhooks de pagamento na fase 2).
- **Sem backend próprio** no MVP — Supabase é a fonte da verdade.

## 2. Estrutura de repositório
Monorepo simples:
```
postcarepro/
├─ apps/
│  ├─ panel/            # Next.js (painel da clínica)
│  └─ patient/          # Flutter (app do paciente)
├─ supabase/
│  ├─ migrations/       # SQL versionado (inclui o schema do MVP)
│  ├─ functions/        # Edge Functions
│  └─ seed.sql          # protocolos/dados de exemplo
├─ docs/                # PRD.md, DESIGN_SYSTEM.md, PROJECT_STANDARDS.md
├─ pnpm-workspace.yaml  # workspace (packages: apps/panel)
└─ package.json         # scripts raiz (panel:dev, panel:build, …)
```

### Painel (`apps/panel`)
```
apps/panel/
├─ app/               # App Router
│  ├─ layout.tsx      # root layout (providers, tema)
│  ├─ globals.css     # tokens do design system (CSS vars HSL do shadcn)
│  └─ (app)/          # rotas do painel autenticado
│     ├─ layout.tsx   #   app-shell (Sidebar + Topbar)
│     ├─ dashboard/page.tsx
│     ├─ patients/page.tsx · patients/new/page.tsx · patients/[id]/page.tsx
│     ├─ surgeries/page.tsx · calendar/page.tsx · messages/page.tsx
│     └─ notifications/page.tsx · reports/page.tsx · settings/page.tsx
├─ components/        # componentes do domínio (app-shell, sidebar, topbar, …)
│  └─ ui/             # shadcn/ui (button, card, table, badge, …)
├─ hooks/             # hooks reutilizáveis (use-toast, …)
├─ lib/               # supabase client, mock-data, database.types.ts, utils (dPos, formatters)
└─ tailwind.config.ts # extensão do tema apontando pras CSS vars
```
Organização **por domínio**, mapeada às rotas de `app/(app)/`. UI genérica em
`components/ui/` (shadcn); acesso a dados centralizado em `lib/` (nunca client cru no JSX).

### App do paciente (`apps/patient/lib`)
```
lib/
├─ main.dart
├─ core/          # theme (AppColors/AppTheme), supabase, router, utils
├─ features/      # onboarding, orientation, checkin, messages, appointments
│  └─ checkin/    #   data/ · domain/ · presentation/
└─ shared/        # widgets reutilizáveis
```

## 3. Convenções de código
- **TypeScript estrito** (`strict: true`); sem `any` sem justificativa.
- Nomes: componentes `PascalCase`; hooks `useX`; arquivos de componente `PascalCase.tsx`,
  demais `camelCase.ts`. Tabelas/colunas do banco em `snake_case`.
- Componentes pequenos e puros; lógica de dados em hooks (`usePatients`, `useCheckins`).
- Estilo só via **tokens do design system** (§Tailwind). Nada de hex solto no JSX.
- Toda string de UI em **pt-BR**. Sem texto hardcoded que dependa de ambiente.
- Dart: `flutter_lints`; camadas data/domain/presentation por feature.

## 4. Dados & Supabase
- **RLS é obrigatório** em toda tabela. Nenhuma leitura/escrita confia só no client.
- Nunca expor a **service_role key** no client. Operações privilegiadas → Edge Function.
- Migrations versionadas em `supabase/migrations/` (uma alteração = uma migration).
  Não editar migration já aplicada; criar nova.
- Tipos gerados: `supabase gen types typescript` → `apps/panel/lib/database.types.ts`. Regenerar a cada migration.
- Acesso a dados sempre via camada de dados em `lib/` (ex.: `lib/queries/*`), nunca chamar o client cru no componente.
- **Realtime** para mensagens e alertas. **Storage** para anexos/logo (com policy).
- Regras de negócio determinísticas (D+n, alertas) vivem em **trigger/SQL**, não no client
  (ver schema). Isso garante consistência entre painel e app.

## 5. Autenticação & papéis
- Supabase Auth. `profiles.role` ∈ {`staff`,`patient`}. Painel exige `staff`; app exige `patient`.
- Isolamento por `clinic_id` via helpers `current_clinic_id()` / `current_role()` / `current_patient_id()`.
- Vínculo do paciente ao app por convite/código da clínica (fluxo a detalhar).

## 6. Estado & erros (painel)
- Preferir **Server Components** para leitura (fetch nas rotas do App Router). Onde houver
  interação client-side, considerar **TanStack Query** (cache, invalidação por mutation).
  Evitar estado global desnecessário.
- Erros de UI: mensagem clara e acionável (ver escrita no Design System). Log técnico separado do texto do usuário.
- Loading com skeleton nos cards/listas; empty states desenhados.

## 7. Variáveis de ambiente
- Apenas chaves públicas no client: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (painel) e equivalentes no Flutter. Segredos ficam em Edge Functions/Supabase.
- `.env` no `.gitignore`; manter `.env.example` atualizado.

## 8. Git
- **Conventional Commits:** `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
- Escopo opcional: `feat(patients): ...`.
- Branch por trabalho: `feat/patients-list`. PR pequeno e revisável.

## 9. Testes & qualidade
- MVP: testar as regras críticas (cálculo do D+n, geração de alerta) e camadas de dados.
- Lint + typecheck no CI antes do merge. Sem warning novo no build.

## 10. Regras para o Claude Code
Ao gerar ou alterar código neste repositório:
1. **Fonte da verdade:** seguir `PRD.md` (escopo/regras) e `DESIGN_SYSTEM.md` (visual).
   Não inventar telas, cores ou regras fora deles.
2. **Visual travado:** usar somente os tokens do design system; manter o padrão do mockup
   (sidebar com pill ativo, cards claros, dark mode). Não redesenhar.
3. **Segurança:** toda tabela nova nasce com RLS e policies por `clinic_id`/paciente.
   Nunca usar service_role no client. Regras determinísticas em SQL, não no front.
4. **Idioma:** toda a interface em pt-BR.
5. **Organização:** código por feature; dados via `api.ts`/hooks; nada de fetch cru no componente.
6. **Migrations:** mudança de schema = nova migration + regenerar tipos.
7. **Alertas:** tratar como triagem, nunca diagnóstico; deixar isso explícito na UI.
8. **Escopo por fase:** respeitar o roadmap do PRD; entregar em incrementos revisáveis,
   confirmando antes de puxar item de fase futura.
