# Backend de IA — deploy

Este backend nunca existiu antes desta auditoria. O frontend já assumia a
existência de `/api/ai`, mas o ficheiro nunca tinha sido criado nem
publicado — confirmei isto diretamente, procurando em todo o ambiente de
trabalho. Isto é um P0: sem isto, "Legenda com IA" e "Traduzir para todos
os idiomas" falham sempre, em qualquer sítio fora deste ambiente de testes.

**Não posso fazer o deploy por ti** — isso exige uma conta tua (Vercel ou
equivalente) e o teu próprio segredo (`ANTHROPIC_API_KEY`), que nunca deve
passar por mim nem por este repositório.

## Passos

1. Cria conta em [vercel.com](https://vercel.com) (ou usa a que já tiveres).
2. `cd backend && vercel` (ou liga este repositório diretamente pelo painel
   da Vercel — mais simples se preferires interface gráfica).
3. No painel do projeto, em **Settings → Environment Variables**, define:
   - `ANTHROPIC_API_KEY` — a tua chave da API Anthropic (nunca a partilhes,
     nunca a metas em código, nunca a mandes para o Git)
   - `ALLOWED_ORIGINS` — os domínios de onde a app pode chamar isto, separados
     por vírgula. Exemplo: `https://oteudominio.com,capacitor://localhost,http://localhost`
4. Depois do deploy, vais ter um URL do tipo `https://o-teu-projeto.vercel.app`.
5. **Para a versão web:** se `app/my-studio.html` for publicado no MESMO
   domínio que este backend, o caminho relativo `/api/ai` já funciona
   sozinho — não precisas de mudar nada no frontend.
6. **Para a versão nativa (iOS/Android):** isso não é verdade — a app corre
   de uma origem própria, sem domínio nenhum em comum com o backend. Preenche
   a constante `AI_API_BASE_URL_NATIVE` em `app/my-studio.html` (perto do
   topo, procura por essa string) com o URL completo do passo 4, por exemplo:
   ```js
   const AI_API_BASE_URL_NATIVE = 'https://o-teu-projeto.vercel.app/api/ai';
   ```
   Depois corre `npm run build && npm run sync` para propagar isto ao
   iOS/Android.

## O que este backend já faz (e o que ainda não faz)

**Já faz:**
- Chave da API só no servidor, nunca no frontend
- Timeout de 20s (evita pedidos pendurados para sempre)
- Validação dos campos recebidos (tamanho, tipo)
- Rate limiting básico por IP (12 pedidos/minuto)
- CORS restrito a origens explicitamente permitidas
- Respostas de erro estruturadas, sem vazar detalhes internos ao cliente

**Ainda não faz — limitações conhecidas, documentadas, não escondidas:**
- O rate limiting é em memória de um único processo. Em produção a sério,
  com várias instâncias da Vercel a correr ao mesmo tempo, isto não impede
  abuso distribuído — precisa de um armazenamento partilhado (Vercel KV,
  Upstash Redis, ou equivalente) para ser robusto de verdade.
- Não há autenticação de utilizador nenhuma — qualquer pessoa que descubra
  o URL pode chamar isto (sujeito ao rate limit e ao CORS). Isso pode ser
  aceitável para uma ferramenta gratuita/pública, mas vale a pena decidir
  isso conscientemente, não por omissão.
