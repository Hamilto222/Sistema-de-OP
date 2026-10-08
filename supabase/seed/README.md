# Seed de desenvolvimento

Somente Supabase local. `catalog.sql` é aplicado no reset e usa ON CONFLICT: 2 linhas, 3 produtos, 3 modelos e 13 itens. IDs de catálogo são demonstrativos; não são identidades Auth.

Usuários são criados pela API administrativa real do Supabase Auth, nunca por senha em migration ou autenticação simulada. Após iniciar a instância e aplicar migrations, execute `npm run seed:dev` com `OP_DIGITAL_DEMO_PASSWORD` no ambiente do processo. Por exemplo, em Bash:

```sh
read -r -s -p 'Senha apenas para desenvolvimento (mínimo 12 caracteres): ' OP_DIGITAL_DEMO_PASSWORD
export OP_DIGITAL_DEMO_PASSWORD
npm run seed:dev
unset OP_DIGITAL_DEMO_PASSWORD
```

O script não imprime a senha, aceita apenas host loopback e cria/atualiza:

| E-mail de desenvolvimento | Perfil | Linha |
| --- | --- | --- |
| admin@opdigital.example | ADMIN | — |
| pcp@opdigital.example | PCP | — |
| qualidade@opdigital.example | QUALIDADE | — |
| operador1@opdigital.example | OPERADOR | Linha 1 |
| operador2@opdigital.example | OPERADOR | Linha 2 |

As identidades são dados de seed, não usuários embutidos na aplicação. Reexecutar atualiza a senha desses cinco usuários locais explicitamente. Não há seed remoto automático nem senha padrão. Contas de teste têm sufixos próprios, senhas aleatórias em memória e são desativadas ao terminar; reset limpa o histórico local.

## Projeto hospedado
Crie usuários pelo painel Supabase Auth (ou por fluxo administrativo autorizado a ser implementado). O trigger cria um perfil OPERADOR **inativo**, ignorando role e ativo de metadados. Primeiro ADMIN deve ser ativado por um administrador do projeto usando SQL confiável, por exemplo substituindo o UUID abaixo pelo id confirmado em Auth:

```sql
update public.profiles
set nome = 'Nome do administrador', role = 'ADMIN', ativo = true, can_reopen_orders = true
where id = 'UUID_CONFIRMADO_DO_USUARIO_AUTH';
```

Outros perfis/linhas serão administrados pelo ADMIN. Não compartilhar senhas de desenvolvimento, publicar chaves service_role ou habilitar cadastro público em produção. Estes scripts não foram executados contra um projeto hospedado.
