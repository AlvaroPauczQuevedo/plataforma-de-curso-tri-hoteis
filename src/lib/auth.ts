import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { normalizarNomeDeUsuario } from "@/lib/nome-de-usuario";
import { verifyPassword } from "@/lib/password";
import {
  ipDaRequisicao,
  LoginBloqueado,
  permitirTentativa,
  registrarFalha,
  registrarSucesso,
} from "@/lib/login-guard";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 horas
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Credenciais",
      credentials: {
        username: { label: "Nome de usuário", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.username || !credentials?.password) {
          throw new Error("Informe nome de usuário e senha.");
        }

        /*
          A mesma normalização do cadastro, aplicada ao que foi digitado.

          Sem isto, quem cadastrou "maria.silva" e digita "Maria Silva" no
          celular — que sugere maiúscula na primeira letra sozinho — recebe
          "usuário ou senha inválidos" tendo acertado os dois. O identificador
          gravado é sempre a forma normalizada, então normalizar a entrada
          alarga o que o login aceita sem alargar o que ele encontra.
        */
        const username = normalizarNomeDeUsuario(credentials.username);
        const ip = ipDaRequisicao(req?.headers as Record<string, string> | undefined);

        // Barreiras de tentativa antes de qualquer comparação de senha.
        try {
          await permitirTentativa(username, ip);
        } catch (erro) {
          if (erro instanceof LoginBloqueado) throw new Error(erro.message);
          throw erro;
        }

        const user = await db.user.findUnique({ where: { username } });

        if (!user) {
          // Registra mesmo sem conta: alimenta a barreira por origem contra
          // quem varre nomes de usuário.
          await registrarFalha(username, ip);
          throw new Error("Nome de usuário ou senha inválidos.");
        }

        if (!user.active) {
          throw new Error("Este acesso foi desativado. Procure o administrador.");
        }

        const valid = await verifyPassword(credentials.password, user.passwordHash);
        if (!valid) {
          await registrarFalha(username, ip);
          throw new Error("Nome de usuário ou senha inválidos.");
        }

        await registrarSucesso(user.id, username, ip);

        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        await db.accessLog.create({
          data: { userId: user.id, action: "LOGIN" },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatarUrl ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: "ADMIN" | "EMPLOYEE" }).role;
        token.avatarUrl = (user as { avatarUrl?: string }).avatarUrl;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "EMPLOYEE";
        session.user.avatarUrl = token.avatarUrl as string | undefined;
      }
      return session;
    },
  },
};
