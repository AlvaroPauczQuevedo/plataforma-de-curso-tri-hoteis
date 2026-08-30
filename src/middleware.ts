import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = [
  "/login",
  "/esqueci-senha",
  "/redefinir-senha",
  "/admin/login",
  // A conferência de certificado é pública de propósito: quem confere é gente
  // de fora — auditor, cliente, outro empregador —, que não tem login aqui.
  "/validar",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const isAdminArea = pathname.startsWith("/admin");

  if (isAdminArea) {
    if (!token) {
      const url = new URL("/admin/login", request.url);
      url.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(url);
    }
    if (token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    const url = new URL("/login", request.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Ignora rotas de API, assets internos do Next e arquivos estáticos
     * públicos (logo da marca, ícones, imagens). Sem essa exceção o
     * middleware redireciona a própria logo para /login e ela não carrega.
     */
    "/((?!api|_next/static|_next/image|brand|favicon.ico|icon.png|apple-icon.png|storage|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
