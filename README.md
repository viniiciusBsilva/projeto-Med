# PostCare Pro

Sistema de acompanhamento pós-operatório para clínicas. Monorepo com dois produtos
sobre a mesma base **Supabase**.

## Estrutura

```
.
├─ apps/
│  ├─ panel/        # Painel da Clínica — Next.js 13 (App Router) + shadcn/ui + Tailwind
│  └─ patient/      # App do Paciente — Flutter (iOS/Android)
├─ supabase/
│  ├─ migrations/   # SQL versionado (schema, RLS, triggers)
│  ├─ functions/    # Edge Functions (Deno) — fase 2/3
│  └─ seed.sql      # dados de exemplo
└─ docs/            # PRD.md · DESIGN_SYSTEM.md · PROJECT_STANDARDS.md (fonte da verdade)
```

## Documentação

Leia antes de codar — são a fonte da verdade de escopo, visual e convenções:

- [docs/PRD.md](docs/PRD.md) — produto, escopo e regras de negócio.
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — tokens, componentes, dark mode.
- [docs/PROJECT_STANDARDS.md](docs/PROJECT_STANDARDS.md) — stack e convenções de engenharia.

## Como rodar

### Painel (Next.js)

```bash
pnpm install                 # instala o workspace
cp apps/panel/.env.example apps/panel/.env.local   # preencha as chaves Supabase
pnpm panel:dev               # http://localhost:3000
```

Scripts na raiz: `panel:dev` · `panel:build` · `panel:start` · `panel:lint` · `panel:typecheck`.

### App do paciente (Flutter)

```bash
cd apps/patient
flutter pub get
flutter run
```

> Requer o SDK do Flutter instalado. O esqueleto foi criado manualmente; ao ter o SDK,
> `flutter pub get` resolve as dependências.

### Supabase

```bash
supabase start              # sobe o stack local (requer Supabase CLI + Docker)
supabase db reset           # aplica migrations/ + seed.sql
supabase gen types typescript --local > apps/panel/lib/database.types.ts
```

## Estado atual

Arquitetura inicial: painel com as 8 abas navegáveis (dados **mock**), fundação do
schema Supabase (RLS + triggers de D+n/alertas) e esqueleto do app Flutter. A troca do
mock por dados reais segue o roadmap do PRD (§11).
# projeto-Med
