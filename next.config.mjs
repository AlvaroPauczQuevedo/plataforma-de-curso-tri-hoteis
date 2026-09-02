/**
 * Cabeçalhos de segurança.
 *
 * A plataforma não carrega nada de terceiros: fontes, scripts e estilos são
 * todos próprios. Isso permite uma política de conteúdo restritiva, que é a
 * defesa de fundo caso algum texto controlado pelo usuário — descrição de
 * curso, conteúdo de aula — chegue a escapar da sanitização do React.
 *
 * `'unsafe-inline'` em script-src é exigido pelo Next: ele injeta o script de
 * inicialização direto no HTML. Retirar isso obrigaria a gerar um nonce por
 * requisição no middleware, o que vale a pena revisitar se a plataforma passar
 * a receber conteúdo de fontes menos confiáveis.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  // Vídeo incorporado (YouTube, Vimeo) é abordado em iframe dentro da aula.
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Impede que a plataforma seja embutida em site de terceiros.
  "frame-ancestors 'self'",
].join("; ");

const cabecalhos = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

// HSTS só em produção: em desenvolvimento o acesso é por HTTP, e o cabeçalho
// deixaria o navegador recusando localhost por meses.
if (process.env.NODE_ENV === "production") {
  cabecalhos.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
    `src/instrumentation.ts` — que captura os erros do servidor num arquivo
    legível pela tela /admin/erros — não precisa mais ser ligado aqui: o gancho
    era experimental no Next 14 e passou a ser padrão a partir do 15.
  */

  /**
   * Otimizacao de imagem desligada, de proposito.
   *
   * O otimizador do Next exige a biblioteca nativa `sharp` em modo standalone,
   * e aqui ele nao teria o que fazer: a unica imagem estatica e a logo, e os
   * avatares vem de /api/files, uma rota autenticada que o otimizador nao
   * conseguiria buscar do servidor — ele nao carrega o cookie de sessao. As
   * capas de curso ja usam <img> comum.
   *
   * Ligar isto exigiria adicionar `sharp` as dependencias para servir uma
   * unica logo. Nao compensa.
   */
  images: { unoptimized: true },

  async headers() {
    return [{ source: "/:path*", headers: cabecalhos }];
  },
};

export default nextConfig;
