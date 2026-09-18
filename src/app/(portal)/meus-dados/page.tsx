import { Download, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/session";
import { contarMeusDados, reunirMeusDados } from "@/lib/meus-dados";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/utils";

/**
 * "Que dados vocês têm sobre mim?" — a tela que responde isso.
 *
 * É o Art. 18 da LGPD em forma de página: **II**, acesso aos dados, aqui na
 * tela; **V**, portabilidade, no botão de exportar. A pessoa não precisa pedir
 * a ninguém nem esperar prazo: ela abre e vê.
 *
 * Mostra TUDO, inclusive o que pode incomodar — os registros de acesso, que
 * dizem quando ela entrou. Esconder essa parte seria o oposto do que o artigo
 * pede, e é justamente a que permite alguém estranhar um acesso que não
 * reconhece.
 */
export const dynamic = "force-dynamic";

export default async function MeusDadosPage() {
  const user = await requireUser();
  const dados = await reunirMeusDados(user.id);

  if (!dados) {
    return <p className="text-sm text-ink-700/70">Não foi possível carregar seus dados.</p>;
  }

  const resumo = contarMeusDados(dados);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Meus dados</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-700/70">
            Tudo que esta plataforma guarda sobre você. É seu direito ver e levar
            (Lei Geral de Proteção de Dados, Art. 18).
          </p>
        </div>

        {/*
          Âncora, e não botão: é um GET que devolve arquivo. O navegador
          resolve sozinho, sem JavaScript e sem estado para quebrar.
        */}
        <a
          href="/api/meus-dados"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm font-medium text-ink-900 transition hover:bg-surface-muted"
        >
          <Download className="h-4 w-4" />
          Baixar tudo (JSON)
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {resumo.map((r) => (
          <div key={r.rotulo} className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-xl font-semibold tabular-nums text-ink-900">{r.quantos}</p>
            <p className="mt-0.5 text-xs leading-tight text-ink-700/60">{r.rotulo}</p>
          </div>
        ))}
      </div>

      <Secao titulo="Identificação">
        <Campos
          itens={[
            ["Nome", dados.identificacao.nome],
            ["Nome de usuário", dados.identificacao.usuario],
            ["E-mail", dados.identificacao.email],
            ["Telefone", dados.identificacao.telefone],
            ["Cargo", dados.identificacao.cargo],
            ["Departamento", dados.identificacao.departamento],
            ["Hotel", dados.identificacao.hotel],
            ["Matrícula", dados.identificacao.matricula],
          ]}
        />
        <p className="mt-3 text-xs text-ink-700/60">
          E-mail e telefone são opcionais — você pode alterá-los ou removê-los em{" "}
          <a href="/perfil" className="font-medium text-brand-texto hover:underline">
            Meu perfil
          </a>
          .
        </p>
      </Secao>

      <Secao titulo="Conta">
        <Campos
          itens={[
            ["Perfil", dados.conta.perfil],
            ["Situação", dados.conta.ativa ? "Ativa" : "Desativada"],
            ["Criada em", formatDate(dados.conta.criadaEm)],
            ["Último acesso", dados.conta.ultimoAcesso ? formatDateTime(dados.conta.ultimoAcesso) : "—"],
          ]}
        />
        <p className="mt-3 text-xs text-ink-700/60">
          Sua senha é guardada de forma cifrada e irreversível — nem os administradores
          conseguem lê-la. Se você esquecer, ela é substituída, nunca recuperada.
        </p>
      </Secao>

      <Lista
        titulo="Treinamentos"
        vazio="Nenhum treinamento atribuído a você."
        itens={dados.treinamentos.map((t) => ({
          chave: `${t.curso}-${t.matriculadoEm.toISOString()}`,
          principal: t.curso,
          secundario: `Matriculado em ${formatDate(t.matriculadoEm)}${
            t.prazo ? ` · prazo ${formatDate(t.prazo)}` : ""
          } · ${t.progressoPercent}%`,
          selo: t.obrigatorio ? <Badge tone="warning">Obrigatório</Badge> : null,
        }))}
      />

      <Lista
        titulo="Certificados"
        vazio="Nenhum certificado emitido."
        itens={dados.certificados.map((c) => ({
          chave: c.codigo,
          principal: c.curso,
          secundario: `Emitido em ${formatDate(c.emitidoEm)} · código ${c.codigo}`,
        }))}
      />

      <Lista
        titulo="Treinamentos presenciais"
        vazio="Nenhum treinamento presencial registrado."
        itens={dados.treinamentosPresenciais.map((e, i) => ({
          chave: `${e.curso}-${i}`,
          principal: e.curso,
          secundario: `${formatDate(e.concluidoEm)}${e.instrutor ? ` · ${e.instrutor}` : ""}`,
        }))}
      />

      <Lista
        titulo="Documentos que você aceitou"
        vazio="Nenhum documento aceito."
        itens={dados.documentosAceitos.map((d, i) => ({
          chave: `${d.documento}-${i}`,
          principal: d.documento,
          secundario: `Versão ${d.versaoAceita} · ${formatDateTime(d.aceitoEm)}${
            d.origem ? ` · origem ${d.origem}` : ""
          }`,
        }))}
      />

      <Lista
        titulo="Listas de presença"
        vazio="Nenhuma presença registrada."
        itens={dados.presencas.map((p, i) => ({
          chave: `${p.treinamento}-${i}`,
          principal: p.treinamento,
          secundario: `${formatDateTime(p.registradaEm)}${p.origem ? ` · origem ${p.origem}` : ""}`,
        }))}
      />

      <Lista
        titulo="Provas"
        vazio="Nenhuma prova realizada."
        itens={dados.provas.map((p, i) => ({
          chave: `${p.prova}-${i}`,
          principal: p.prova,
          secundario: `${formatDateTime(p.realizadaEm)} · nota ${p.nota} · ${p.acertos} acerto(s)`,
          selo: p.aprovado ? (
            <Badge tone="success">Aprovado</Badge>
          ) : (
            <Badge tone="neutral">Não aprovado</Badge>
          ),
        }))}
      />

      <Lista
        titulo="Registros de acesso"
        descricao="Os 100 mais recentes. Se você não reconhece algum, avise o administrador."
        vazio="Nenhum registro de acesso."
        itens={dados.registrosDeAcesso.map((a, i) => ({
          chave: `${a.quando.toISOString()}-${i}`,
          principal: a.acao === "LOGIN" ? "Entrada no sistema" : a.acao,
          secundario: formatDateTime(a.quando),
        }))}
      />

      <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-muted/40 p-5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-texto" />
        <div className="text-sm text-ink-700">
          <p className="font-medium text-ink-900">Quer corrigir ou apagar alguma coisa?</p>
          <p className="mt-1">
            Nome, e-mail e telefone você altera em{" "}
            <a href="/perfil" className="font-medium text-brand-texto hover:underline">
              Meu perfil
            </a>
            . Para o resto, procure o setor de treinamento.
          </p>
          <p className="mt-2 text-ink-700/70">
            Registros de treinamento obrigatório não podem ser apagados enquanto você
            estiver na empresa: eles são a prova de que a empresa cumpriu a norma, e a lei
            exige que sejam mantidos (LGPD, Art. 16, I).
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- montagem */

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold text-ink-900">{titulo}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Campos({ itens }: { itens: [string, string | null][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo}>
          <dt className="text-xs uppercase tracking-wide text-ink-700/60">{rotulo}</dt>
          {/* Traço, e não campo em branco: "não informado" é uma resposta. */}
          <dd className="mt-0.5 text-sm text-ink-900">{valor || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

type ItemDaLista = {
  chave: string;
  principal: string;
  secundario: string;
  selo?: React.ReactNode;
};

function Lista({
  titulo,
  descricao,
  vazio,
  itens,
}: {
  titulo: string;
  descricao?: string;
  vazio: string;
  itens: ItemDaLista[];
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-ink-900">{titulo}</h2>
        <span className="text-xs text-ink-700/50">{itens.length} registro(s)</span>
      </div>
      {descricao && <p className="mt-0.5 text-xs text-ink-700/60">{descricao}</p>}

      {itens.length === 0 ? (
        <p className="mt-3 text-sm text-ink-700/60">{vazio}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {itens.map((item) => (
            <li key={item.chave} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="text-sm text-ink-900">{item.principal}</p>
                <p className="text-xs text-ink-700/60">{item.secundario}</p>
              </div>
              {item.selo}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
