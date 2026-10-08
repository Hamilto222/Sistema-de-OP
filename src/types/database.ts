export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string
          field: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          production_order_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          production_order_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          production_order_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "pcp_order_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          ativo: boolean
          bloqueia_op_se_nao_conforme: boolean
          configuracao: Json
          descricao: string | null
          grupo: string | null
          id: string
          item: string
          momento: Database["public"]["Enums"]["checklist_moment"]
          obrigatorio: boolean
          ordem: number
          requer_revisao_cq: boolean
          template_id: string
          tipo_resposta: Database["public"]["Enums"]["response_type"]
          unidade: string | null
          valor_maximo: number | null
          valor_minimo: number | null
        }
        Insert: {
          ativo?: boolean
          bloqueia_op_se_nao_conforme?: boolean
          configuracao?: Json
          descricao?: string | null
          grupo?: string | null
          id?: string
          item: string
          momento?: Database["public"]["Enums"]["checklist_moment"]
          obrigatorio?: boolean
          ordem: number
          requer_revisao_cq?: boolean
          template_id: string
          tipo_resposta: Database["public"]["Enums"]["response_type"]
          unidade?: string | null
          valor_maximo?: number | null
          valor_minimo?: number | null
        }
        Update: {
          ativo?: boolean
          bloqueia_op_se_nao_conforme?: boolean
          configuracao?: Json
          descricao?: string | null
          grupo?: string | null
          id?: string
          item?: string
          momento?: Database["public"]["Enums"]["checklist_moment"]
          obrigatorio?: boolean
          ordem?: number
          requer_revisao_cq?: boolean
          template_id?: string
          tipo_resposta?: Database["public"]["Enums"]["response_type"]
          unidade?: string | null
          valor_maximo?: number | null
          valor_minimo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          revisao: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          revisao: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          revisao?: string
          updated_at?: string
        }
        Relationships: []
      }
      final_reports: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          id: string
          merge_warning: string | null
          order_version: number
          original_combined: boolean | null
          pages: number | null
          path: string
          production_order_id: string
          sha256: string | null
          snapshot: Json
          status: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          merge_warning?: string | null
          order_version: number
          original_combined?: boolean | null
          pages?: number | null
          path: string
          production_order_id: string
          sha256?: string | null
          snapshot: Json
          status?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          merge_warning?: string | null
          order_version?: number
          original_combined?: boolean | null
          pages?: number | null
          path?: string
          production_order_id?: string
          sha256?: string | null
          snapshot?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "final_reports_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "final_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "final_reports_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "pcp_order_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "final_reports_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      non_conformities: {
        Row: {
          acao_imediata: string | null
          aprovado_cq: boolean | null
          checklist_item_id: string | null
          codigo_legado: string | null
          codigo_nc: string
          created_at: string
          created_by: string
          data_abertura: string
          data_fechamento: string | null
          descricao: string
          encerrado_por: string | null
          evidencia_antes_path: string | null
          evidencia_depois_path: string | null
          id: string
          impeditiva: boolean
          observacao_cq: string | null
          production_order_id: string
          responsavel_id: string | null
          severidade: Database["public"]["Enums"]["nc_severity"]
          status: Database["public"]["Enums"]["nc_status"]
          tipo: string
          updated_at: string
        }
        Insert: {
          acao_imediata?: string | null
          aprovado_cq?: boolean | null
          checklist_item_id?: string | null
          codigo_legado?: string | null
          codigo_nc: string
          created_at?: string
          created_by?: string
          data_abertura?: string
          data_fechamento?: string | null
          descricao: string
          encerrado_por?: string | null
          evidencia_antes_path?: string | null
          evidencia_depois_path?: string | null
          id?: string
          impeditiva?: boolean
          observacao_cq?: string | null
          production_order_id: string
          responsavel_id?: string | null
          severidade: Database["public"]["Enums"]["nc_severity"]
          status?: Database["public"]["Enums"]["nc_status"]
          tipo: string
          updated_at?: string
        }
        Update: {
          acao_imediata?: string | null
          aprovado_cq?: boolean | null
          checklist_item_id?: string | null
          codigo_legado?: string | null
          codigo_nc?: string
          created_at?: string
          created_by?: string
          data_abertura?: string
          data_fechamento?: string | null
          descricao?: string
          encerrado_por?: string | null
          evidencia_antes_path?: string | null
          evidencia_depois_path?: string | null
          id?: string
          impeditiva?: boolean
          observacao_cq?: string | null
          production_order_id?: string
          responsavel_id?: string | null
          severidade?: Database["public"]["Enums"]["nc_severity"]
          status?: Database["public"]["Enums"]["nc_status"]
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "non_conformities_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "production_order_checklist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_conformities_checklist_item_id_production_order_id_fkey"
            columns: ["checklist_item_id", "production_order_id"]
            isOneToOne: false
            referencedRelation: "production_order_checklist"
            referencedColumns: ["id", "production_order_id"]
          },
          {
            foreignKeyName: "non_conformities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_conformities_encerrado_por_fkey"
            columns: ["encerrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_conformities_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "pcp_order_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_conformities_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_conformities_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          lida: boolean
          mensagem: string
          reference_id: string | null
          reference_type: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lida?: boolean
          mensagem: string
          reference_id?: string | null
          reference_type?: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lida?: boolean
          mensagem?: string
          reference_id?: string | null
          reference_type?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_lines: {
        Row: {
          ativa: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          setor: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          setor: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          setor?: string
          updated_at?: string
        }
        Relationships: []
      }
      production_notes: {
        Row: {
          created_at: string
          created_by: string
          descricao: string
          foto_path: string | null
          id: string
          production_order_id: string
          quantidade: number | null
          tempo_minutos: number | null
          tipo: Database["public"]["Enums"]["note_type"]
          unidade: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          descricao: string
          foto_path?: string | null
          id?: string
          production_order_id: string
          quantidade?: number | null
          tempo_minutos?: number | null
          tipo: Database["public"]["Enums"]["note_type"]
          unidade?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          descricao?: string
          foto_path?: string | null
          id?: string
          production_order_id?: string
          quantidade?: number | null
          tempo_minutos?: number | null
          tipo?: Database["public"]["Enums"]["note_type"]
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_notes_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "pcp_order_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_notes_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_checklist: {
        Row: {
          bloqueia_op_se_nao_conforme: boolean
          configuracao: Json
          conforme: boolean | null
          created_at: string
          data_medicao: string | null
          data_revisao: string | null
          descricao: string | null
          foto_path: string | null
          grupo: string | null
          id: string
          item: string
          medido_por: string | null
          momento: Database["public"]["Enums"]["checklist_moment"]
          obrigatorio: boolean
          observacao: string | null
          ordem: number
          production_order_id: string
          requer_revisao_cq: boolean
          resposta_boolean: boolean | null
          resposta_select: string | null
          resposta_texto: string | null
          revisado_cq: boolean
          revisado_por: string | null
          template_item_id: string | null
          tipo_resposta: Database["public"]["Enums"]["response_type"]
          unidade: string | null
          updated_at: string
          valor_maximo: number | null
          valor_minimo: number | null
          valor_numero: number | null
        }
        Insert: {
          bloqueia_op_se_nao_conforme?: boolean
          configuracao?: Json
          conforme?: boolean | null
          created_at?: string
          data_medicao?: string | null
          data_revisao?: string | null
          descricao?: string | null
          foto_path?: string | null
          grupo?: string | null
          id?: string
          item: string
          medido_por?: string | null
          momento?: Database["public"]["Enums"]["checklist_moment"]
          obrigatorio?: boolean
          observacao?: string | null
          ordem: number
          production_order_id: string
          requer_revisao_cq?: boolean
          resposta_boolean?: boolean | null
          resposta_select?: string | null
          resposta_texto?: string | null
          revisado_cq?: boolean
          revisado_por?: string | null
          template_item_id?: string | null
          tipo_resposta: Database["public"]["Enums"]["response_type"]
          unidade?: string | null
          updated_at?: string
          valor_maximo?: number | null
          valor_minimo?: number | null
          valor_numero?: number | null
        }
        Update: {
          bloqueia_op_se_nao_conforme?: boolean
          configuracao?: Json
          conforme?: boolean | null
          created_at?: string
          data_medicao?: string | null
          data_revisao?: string | null
          descricao?: string | null
          foto_path?: string | null
          grupo?: string | null
          id?: string
          item?: string
          medido_por?: string | null
          momento?: Database["public"]["Enums"]["checklist_moment"]
          obrigatorio?: boolean
          observacao?: string | null
          ordem?: number
          production_order_id?: string
          requer_revisao_cq?: boolean
          resposta_boolean?: boolean | null
          resposta_select?: string | null
          resposta_texto?: string | null
          revisado_cq?: boolean
          revisado_por?: string | null
          template_item_id?: string | null
          tipo_resposta?: Database["public"]["Enums"]["response_type"]
          unidade?: string | null
          updated_at?: string
          valor_maximo?: number | null
          valor_minimo?: number | null
          valor_numero?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_order_checklist_medido_por_fkey"
            columns: ["medido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_checklist_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "pcp_order_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_checklist_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_checklist_revisado_por_fkey"
            columns: ["revisado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_checklist_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          aprovacao_cq: Database["public"]["Enums"]["quality_decision"] | null
          aprovacao_pcp: Database["public"]["Enums"]["quality_decision"] | null
          assinatura_operador_path: string | null
          checklist_template_descricao: string | null
          checklist_template_nome: string | null
          checklist_template_revisao: string | null
          created_at: string
          created_by: string
          data_aprovacao_cq: string | null
          data_envio_cq: string | null
          data_finalizacao: string | null
          data_hora_programada: string | null
          data_programada: string | null
          empresa_nome: string | null
          fim_producao: string | null
          id: string
          inicio_producao: string | null
          linha_id: string
          lote: string
          motivo_bloqueio: string | null
          motivo_reabertura: string | null
          motivo_retorno_cq: string | null
          numero_op: string
          observacao_final: string | null
          operador_responsavel_id: string | null
          pdf_original_path: string | null
          prioridade: Database["public"]["Enums"]["order_priority"]
          produto_id: string
          quantidade_perdida: number | null
          quantidade_planejada: number
          quantidade_produzida: number | null
          relatorio_final_path: string | null
          responsavel_cq_id: string | null
          responsavel_pcp_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          unidade: string
          updated_at: string
          version: number
        }
        Insert: {
          aprovacao_cq?: Database["public"]["Enums"]["quality_decision"] | null
          aprovacao_pcp?: Database["public"]["Enums"]["quality_decision"] | null
          assinatura_operador_path?: string | null
          checklist_template_descricao?: string | null
          checklist_template_nome?: string | null
          checklist_template_revisao?: string | null
          created_at?: string
          created_by?: string
          data_aprovacao_cq?: string | null
          data_envio_cq?: string | null
          data_finalizacao?: string | null
          data_hora_programada?: string | null
          data_programada?: string | null
          empresa_nome?: string | null
          fim_producao?: string | null
          id?: string
          inicio_producao?: string | null
          linha_id: string
          lote: string
          motivo_bloqueio?: string | null
          motivo_reabertura?: string | null
          motivo_retorno_cq?: string | null
          numero_op: string
          observacao_final?: string | null
          operador_responsavel_id?: string | null
          pdf_original_path?: string | null
          prioridade?: Database["public"]["Enums"]["order_priority"]
          produto_id: string
          quantidade_perdida?: number | null
          quantidade_planejada: number
          quantidade_produzida?: number | null
          relatorio_final_path?: string | null
          responsavel_cq_id?: string | null
          responsavel_pcp_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          unidade: string
          updated_at?: string
          version?: number
        }
        Update: {
          aprovacao_cq?: Database["public"]["Enums"]["quality_decision"] | null
          aprovacao_pcp?: Database["public"]["Enums"]["quality_decision"] | null
          assinatura_operador_path?: string | null
          checklist_template_descricao?: string | null
          checklist_template_nome?: string | null
          checklist_template_revisao?: string | null
          created_at?: string
          created_by?: string
          data_aprovacao_cq?: string | null
          data_envio_cq?: string | null
          data_finalizacao?: string | null
          data_hora_programada?: string | null
          data_programada?: string | null
          empresa_nome?: string | null
          fim_producao?: string | null
          id?: string
          inicio_producao?: string | null
          linha_id?: string
          lote?: string
          motivo_bloqueio?: string | null
          motivo_reabertura?: string | null
          motivo_retorno_cq?: string | null
          numero_op?: string
          observacao_final?: string | null
          operador_responsavel_id?: string | null
          pdf_original_path?: string | null
          prioridade?: Database["public"]["Enums"]["order_priority"]
          produto_id?: string
          quantidade_perdida?: number | null
          quantidade_planejada?: number
          quantidade_produzida?: number | null
          relatorio_final_path?: string | null
          responsavel_cq_id?: string | null
          responsavel_pcp_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          unidade?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_linha_id_fkey"
            columns: ["linha_id"]
            isOneToOne: false
            referencedRelation: "production_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_operador_responsavel_id_fkey"
            columns: ["operador_responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_responsavel_cq_id_fkey"
            columns: ["responsavel_cq_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_responsavel_pcp_id_fkey"
            columns: ["responsavel_pcp_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          ativo: boolean
          checklist_template_id: string | null
          codigo: string
          created_at: string
          descricao: string
          id: string
          revisao: string
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          checklist_template_id?: string | null
          codigo: string
          created_at?: string
          descricao: string
          id?: string
          revisao: string
          unidade: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          checklist_template_id?: string | null
          codigo?: string
          created_at?: string
          descricao?: string
          id?: string
          revisao?: string
          unidade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          can_reopen_orders: boolean
          created_at: string
          email: string
          id: string
          nome: string
          production_line_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          can_reopen_orders?: boolean
          created_at?: string
          email: string
          id: string
          nome: string
          production_line_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          can_reopen_orders?: boolean
          created_at?: string
          email?: string
          id?: string
          nome?: string
          production_line_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_production_line_id_fkey"
            columns: ["production_line_id"]
            isOneToOne: false
            referencedRelation: "production_lines"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      pcp_order_list: {
        Row: {
          aprovacao_cq: Database["public"]["Enums"]["quality_decision"] | null
          aprovacao_pcp: Database["public"]["Enums"]["quality_decision"] | null
          assinatura_operador_path: string | null
          checklist_template_descricao: string | null
          checklist_template_nome: string | null
          checklist_template_revisao: string | null
          created_at: string | null
          created_by: string | null
          data_aprovacao_cq: string | null
          data_envio_cq: string | null
          data_finalizacao: string | null
          data_hora_programada: string | null
          data_programada: string | null
          empresa_nome: string | null
          fim_producao: string | null
          id: string | null
          inicio_producao: string | null
          linha_id: string | null
          linha_nome: string | null
          lote: string | null
          motivo_bloqueio: string | null
          motivo_reabertura: string | null
          motivo_retorno_cq: string | null
          numero_op: string | null
          observacao_final: string | null
          operador_nome: string | null
          operador_responsavel_id: string | null
          pdf_original_path: string | null
          prioridade: Database["public"]["Enums"]["order_priority"] | null
          produto_codigo: string | null
          produto_descricao: string | null
          produto_id: string | null
          quantidade_perdida: number | null
          quantidade_planejada: number | null
          quantidade_produzida: number | null
          relatorio_final_path: string | null
          responsavel_cq_id: string | null
          responsavel_pcp_id: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          unidade: string | null
          updated_at: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_linha_id_fkey"
            columns: ["linha_id"]
            isOneToOne: false
            referencedRelation: "production_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_operador_responsavel_id_fkey"
            columns: ["operador_responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_responsavel_cq_id_fkey"
            columns: ["responsavel_cq_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_responsavel_pcp_id_fkey"
            columns: ["responsavel_pcp_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quality_nc_list: {
        Row: {
          acao_imediata: string | null
          aprovado_cq: boolean | null
          checklist_item_id: string | null
          codigo_legado: string | null
          codigo_nc: string | null
          created_at: string | null
          created_by: string | null
          data_abertura: string | null
          data_fechamento: string | null
          descricao: string | null
          encerrado_por: string | null
          evidencia_antes_path: string | null
          evidencia_depois_path: string | null
          id: string | null
          impeditiva: boolean | null
          numero_op: string | null
          observacao_cq: string | null
          production_order_id: string | null
          produto_codigo: string | null
          produto_descricao: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          severidade: Database["public"]["Enums"]["nc_severity"] | null
          status: Database["public"]["Enums"]["nc_status"] | null
          tipo: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "non_conformities_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "production_order_checklist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_conformities_checklist_item_id_production_order_id_fkey"
            columns: ["checklist_item_id", "production_order_id"]
            isOneToOne: false
            referencedRelation: "production_order_checklist"
            referencedColumns: ["id", "production_order_id"]
          },
          {
            foreignKeyName: "non_conformities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_conformities_encerrado_por_fkey"
            columns: ["encerrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_conformities_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "pcp_order_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_conformities_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "non_conformities_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_save_checklist: { Args: { payload: Json }; Returns: string }
      complete_final_report: {
        Args: {
          combined: boolean
          digest: string
          page_count: number
          report_id: string
          warning?: string
        }
        Returns: undefined
      }
      dashboard_analytics: {
        Args: { period_end?: string; period_start?: string }
        Returns: Json
      }
      operator_add_note: {
        Args: { order_id: string; payload: Json }
        Returns: string
      }
      operator_save_measure: {
        Args: {
          expected_updated_at: string
          item_id: string
          order_id: string
          payload: Json
        }
        Returns: undefined
      }
      operator_start_order: {
        Args: { expected_version: number; order_id: string }
        Returns: undefined
      }
      operator_submit_order: {
        Args: {
          expected_version: number
          final_note: string
          lost: number
          order_id: string
          produced: number
        }
        Returns: undefined
      }
      pcp_attach_original: {
        Args: {
          document_path: string
          expected_version: number
          order_id: string
        }
        Returns: undefined
      }
      pcp_create_order: { Args: { payload: Json }; Returns: string }
      pcp_dashboard: { Args: never; Returns: Json }
      pcp_finalize_order: {
        Args: {
          company_name: string
          expected_version: number
          order_id: string
        }
        Returns: string
      }
      pcp_prepare_order: {
        Args: { expected_version: number; order_id: string }
        Returns: undefined
      }
      quality_dashboard: { Args: never; Returns: Json }
      quality_decide_order: {
        Args: {
          decision: string
          expected_version: number
          order_id: string
          reason?: string
        }
        Returns: undefined
      }
      quality_nc_document: {
        Args: { nc_id: string; order_id: string; which_document: string }
        Returns: Json
      }
      quality_review_item: {
        Args: { expected_updated_at: string; item_id: string; order_id: string }
        Returns: undefined
      }
      quality_save_nc: { Args: { payload: Json }; Returns: string }
      reopen_order: {
        Args: { expected_version: number; order_id: string; reason: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "ADMIN" | "PCP" | "QUALIDADE" | "OPERADOR"
      checklist_moment: "ANTES" | "DURANTE" | "DEPOIS"
      nc_severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      nc_status:
        | "OPEN"
        | "IN_TREATMENT"
        | "AWAITING_QUALITY"
        | "CLOSED"
        | "CANCELLED"
      note_type:
        | "OBSERVACAO"
        | "PARADA"
        | "PRODUCAO"
        | "PERDA"
        | "AJUSTE"
        | "RETRABALHO"
        | "MANUTENCAO"
        | "SEGURANCA"
      order_priority: "BAIXA" | "NORMAL" | "ALTA" | "URGENTE"
      order_status:
        | "DRAFT"
        | "PREPARING"
        | "RELEASED"
        | "IN_PRODUCTION"
        | "BLOCKED_QUALITY"
        | "AWAITING_QUALITY"
        | "AWAITING_PCP"
        | "FINALIZED"
        | "REOPENED"
        | "CANCELLED"
      quality_decision: "APPROVED" | "REJECTED"
      response_type: "BOOLEAN" | "NUMBER" | "TEXT" | "PHOTO" | "SELECT"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["ADMIN", "PCP", "QUALIDADE", "OPERADOR"],
      checklist_moment: ["ANTES", "DURANTE", "DEPOIS"],
      nc_severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      nc_status: [
        "OPEN",
        "IN_TREATMENT",
        "AWAITING_QUALITY",
        "CLOSED",
        "CANCELLED",
      ],
      note_type: [
        "OBSERVACAO",
        "PARADA",
        "PRODUCAO",
        "PERDA",
        "AJUSTE",
        "RETRABALHO",
        "MANUTENCAO",
        "SEGURANCA",
      ],
      order_priority: ["BAIXA", "NORMAL", "ALTA", "URGENTE"],
      order_status: [
        "DRAFT",
        "PREPARING",
        "RELEASED",
        "IN_PRODUCTION",
        "BLOCKED_QUALITY",
        "AWAITING_QUALITY",
        "AWAITING_PCP",
        "FINALIZED",
        "REOPENED",
        "CANCELLED",
      ],
      quality_decision: ["APPROVED", "REJECTED"],
      response_type: ["BOOLEAN", "NUMBER", "TEXT", "PHOTO", "SELECT"],
    },
  },
} as const

