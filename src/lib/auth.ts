import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/lib/db";
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
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Informe e-mail e senha.");
        }

        const email = credentials.email.toLowerCase().trim();
        const ip = ipDaRequisicao(req?.headers as Record<string, string> | undefined);

        // Barreiras de tentativa antes de qualquer comparação de senha.
        try {
          await permitirTentativa(email, ip);
        } catch (erro) {
          if (erro instanceof LoginBloqueado) throw new Error(erro.message);
          throw erro;
        }

        const user = await db.user.findUnique({ where: { email } });

        if (!user) {
          // Registra mesmo sem conta: alimenta a barreira por origem contra
          // quem varre endereços.
          await registrarFalha(email, ip);
          throw new Error("E-mail ou senha inválidos.");
        }

        if (!user.active) {
          throw new Error("Este acesso foi desativado. Procure o administrador.");
        }

        const valid = await verifyPassword(credentials.password, user.passwordHash);
        if (!valid) {
          await registrarFalha(email, ip);
          throw new Error("E-mail ou senha inválidos.");
        }

        await registrarSucesso(user.id, email, ip);

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
