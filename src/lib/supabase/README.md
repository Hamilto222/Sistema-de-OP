# Supabase SSR

Cliente somente no servidor, tipado por `src/types/database.ts`, gerado da instância real. Auth usa `getUser()` para verificar identidade e consulta `profiles` para ativação e role atuais. Cookies são HttpOnly, SameSite=Lax, Secure em produção. Não há cliente browser nem armazenamento de sessão em localStorage.

`proxy.ts` protege navegação em `/sistema/*`, `/admin/*`, `/pcp/*`, `/operador/*` e `/qualidade/*` e atualiza cookies; layouts/páginas também verificam perfil ativo/ADMIN. Toda ação administrativa usa `requireRole(["ADMIN"])` e toda ação PCP usa `requireRole(["ADMIN", "PCP"])` internamente; execução exige OPERADOR e CQ/NC exige ADMIN/QUALIDADE ativos, inclusive se invocada por outra rota. POST com Next-Action é autorizado na ação e usa seu protocolo de redirect; o proxy não intercepta esse protocolo. Toda consulta usa a chave publicável e a sessão do usuário: RLS continua aplicável. Não usar service_role em serviços da aplicação para contornar políticas.

`scripts/local-supabase.mjs` usa chave administrativa apenas em seed/testes locais, fora do bundle da aplicação. Nenhum segredo é salvo no código. URLs assinadas de documentos expiram em 60 segundos e não devem ser persistidas nem registradas em logs.
