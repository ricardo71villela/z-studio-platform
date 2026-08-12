// api/ai.js — Vercel Function (Node.js runtime)
//
// Este ficheiro NUNCA existiu antes desta auditoria, apesar de o frontend
// (app/my-studio.html) já ter código a chamá-lo desde o início. Confirmei
// isto diretamente: procurei em todo o ambiente de trabalho, não existia
// em lado nenhum. Classificado P0 na auditoria.
//
// Regra de ouro: a ANTHROPIC_API_KEY nunca aparece no frontend, no bundle
// web, nem em nenhum dos builds iOS/Android. Só existe aqui, como variável
// de ambiente do lado do servidor.
//
// Configuração necessária no painel da Vercel (ou equivalente):
//   ANTHROPIC_API_KEY=sk-ant-...
//   ALLOWED_ORIGINS=https://oteudominio.com,capacitor://localhost,http://localhost
//
// Deploy: isto assume o runtime de Vercel Functions. Se acabares por alojar
// noutro sítio (Netlify Functions, Cloudflare Workers, etc.), a lógica abaixo
// mantém-se — só a assinatura da função de entrada/saída muda.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6'; // ajustar conforme o modelo pretendido/disponível
const MAX_ALLOWED_TOKENS = 2000;   // teto duro — o frontend pode pedir menos, nunca mais
const REQUEST_TIMEOUT_MS = 20000;

// Rate limiting básico em memória — funciona num único processo/instância.
// NÃO é suficiente para produção a sério com várias instâncias simultâneas
// (cada instância da Vercel tem a sua própria memória). Para isso, trocar
// por um KV/Redis partilhado (ex.: Vercel KV, Upstash). Documentado aqui
// como limitação conhecida, não escondida.
const rateLimitMap = new Map(); // ip -> [timestamps]
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 12; // por IP, por minuto

function checkRateLimit(ip) {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) return false;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

function getAllowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeaders(origin) {
  const allowed = getAllowedOrigins();
  const isAllowed = allowed.length === 0 || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Validação dos inputs — nunca confiar cegamente no que o frontend envia.
function validateBody(body) {
  if (!body || typeof body !== 'object') return 'Corpo do pedido inválido.';
  if (typeof body.system !== 'string' || body.system.length === 0) return 'Campo "system" em falta ou inválido.';
  if (typeof body.user !== 'string' || body.user.length === 0) return 'Campo "user" em falta ou inválido.';
  if (body.system.length > 4000) return 'Campo "system" excede o tamanho máximo permitido.';
  if (body.user.length > 8000) return 'Campo "user" excede o tamanho máximo permitido.';
  if (body.max_tokens !== undefined) {
    if (typeof body.max_tokens !== 'number' || body.max_tokens <= 0) return 'Campo "max_tokens" inválido.';
  }
  return null;
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
    res.end(JSON.stringify({ error: 'Método não permitido. Usa POST.' }));
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Nunca revelar detalhes internos ao cliente — só registar do lado do servidor.
    console.error('[api/ai] ANTHROPIC_API_KEY não está configurada nas variáveis de ambiente.');
    res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
    res.end(JSON.stringify({ error: 'Serviço de IA indisponível de momento.' }));
    return;
  }

  // IP para efeitos de rate limiting — em Vercel isto normalmente vem em x-forwarded-for.
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (!checkRateLimit(ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
    res.end(JSON.stringify({ error: 'Demasiados pedidos. Tenta outra vez dentro de um minuto.' }));
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
    res.end(JSON.stringify({ error: 'JSON inválido no corpo do pedido.' }));
    return;
  }

  const validationError = validateBody(body);
  if (validationError) {
    res.writeHead(400, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
    res.end(JSON.stringify({ error: validationError }));
    return;
  }

  const maxTokens = Math.min(body.max_tokens || 1200, MAX_ALLOWED_TOKENS);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: body.system,
        messages: [{ role: 'user', content: body.user }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!upstream.ok) {
      // Regista o detalhe do lado do servidor, mas não o expõe ao cliente
      // (pode conter informação sensível sobre a conta/chave).
      const errText = await upstream.text().catch(() => '');
      console.error('[api/ai] Erro do fornecedor de IA:', upstream.status, errText.slice(0, 500));
      res.writeHead(502, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
      res.end(JSON.stringify({ error: 'O serviço de IA não respondeu corretamente. Tenta outra vez.' }));
      return;
    }

    const data = await upstream.json();
    res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
    res.end(JSON.stringify({ content: data.content || [] }));
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      console.error('[api/ai] Timeout ao contactar o fornecedor de IA.');
      res.writeHead(504, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
      res.end(JSON.stringify({ error: 'O serviço de IA demorou demasiado tempo a responder.' }));
      return;
    }
    console.error('[api/ai] Erro inesperado:', e.message);
    res.writeHead(500, { 'Content-Type': 'application/json', ...corsHeaders(origin) });
    res.end(JSON.stringify({ error: 'Erro inesperado no servidor.' }));
  }
};
