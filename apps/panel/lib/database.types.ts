/**
 * Tipagem do banco Supabase (permissiva).
 *
 * Mantida propositalmente frouxa no MVP: `from('<tabela>')` funciona para todas as
 * tabelas/views e retorna linhas genéricas que a camada `lib/queries.ts` mapeia para os
 * tipos de domínio em `lib/types.ts`. Para tipos estritos, gere com:
 *   supabase gen types typescript --project-id ktfhmrgwbclewlwbqtag > lib/database.types.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericRow = Record<string, unknown>;
type GenericTable = { Row: GenericRow; Insert: GenericRow; Update: GenericRow; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      clinics: GenericTable;
      protocols: GenericTable;
      protocol_steps: GenericTable;
      patients: GenericTable;
      profiles: GenericTable;
      surgeries: GenericTable;
      checkins: GenericTable;
      alerts: GenericTable;
      messages: GenericTable;
      appointments: GenericTable;
      notifications: GenericTable;
      canned_responses: GenericTable;
      doctors: GenericTable;
      conversations: GenericTable;
      protocol_messages: GenericTable;
      care_tips: GenericTable;
    };
    Views: {
      patient_overview: { Row: GenericRow; Relationships: [] };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
