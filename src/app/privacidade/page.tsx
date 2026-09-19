import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import {
  AVISO_RODAPE,
  AVISO_SECOES,
  AVISO_SUBTITULO,
  AVISO_TITULO,
  avisoContato,
} from "@/lib/textos-lgpd.mjs";

/**
 * Aviso de privacidade — Art. 9º da LGPD.
 *
 * O artigo dá ao titular direito a saber, de forma clara e acessível, a
 * finalidade, a forma, a duração, quem é o controlador e com quem os dados são
 * compartilhados. Até esta página existir, o funcionário recebia uma senha em
 * papel e entrava num sistema que registra o que ele faz, sem nada que o
 * informasse disso.
 *
 * ---
 *
 * **O texto não mora aqui.** Vem de `lib/textos-lgpd.mjs`, que é a fonte única
 * — o mesmo módulo alimenta o anexo do Registro de Operações, que vai à
 * revisão jurídica. Se fossem duas cópias, o advogado aprovaria um texto e o
 * funcionário leria outro, e nada quebraria para avisar.
 *
 * O que fica aqui é só apresentação.
 *
 * ---
 *
 * **É AVISO, não termo de consentimento.** A diferença não é de palavra.
 *
 * O tratamento aqui se apoia em obrigação legal — a legislação trabalhista e
 * sanitária obriga a empresa a capacitar e a comprovar — e na execução do
 * contrato de trabalho: Art. 7º, II e V. Não em consentimento. Pedir "eu
 * concordo" numa relação de emprego seria fingir uma escolha que não existe, e
 * pior: consentimento é revogável a qualquer tempo (Art. 8º, §5º), então
 * bastaria alguém revogá-lo para a empresa perder a prova de treinamento que a
 * lei a obriga a manter.
 *
 * Por isso a página **informa** e não pede assinatura. Onde o consentimento é
 * de fato a base — e-mail e telefone pessoais — ele já é colhido onde deve:
 * são campos opcionais, e o e-mail só vale depois da confirmação por link.
 *
 * ---
 *
 * **Pública, sem login.** Quem ainda não entrou precisa poder ler — e a página
 * é linkada da tela de login justamente por isso. Exigir sessão para saber
 * como os próprios dados são tratados inverteria o sentido do artigo.
 */
export const metadata = {
  title: AVISO_TITULO,
};

/*
  Renderizada a cada pedido, e não no build.

  O contato do encarregado vem do ambiente, e o ambiente do SERVIDOR não é o
  do build — na hospedagem as variáveis são definidas no painel, depois de a
  aplicação ser construída. Como página estática, ela era pré-renderizada sem
  o contato e o mostrava vazio para sempre, sem nada indicando o problema.

  O custo é desprezível: é uma página de texto, sem consulta ao banco.
*/
export const dynamic = "force-dynamic";

export default function PrivacidadePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="inline-block">
        <Logo className="h-9 w-auto" />
      </Link>

      <h1 className="mt-8 text-2xl font-semibold text-ink-900">{AVISO_TITULO}</h1>
      <p className="mt-2 text-sm text-ink-700/70">{AVISO_SUBTITULO}</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-ink-700">
        {AVISO_SECOES.map((secao) => (
          <section key={secao.titulo}>
            <h2 className="font-semibold text-ink-900">{secao.titulo}</h2>

            <div className="mt-2 space-y-2">
              {secao.paragrafos?.map((texto) => (
                <p key={texto}>{texto}</p>
              ))}

              {secao.itens && (
                <ul className="list-disc space-y-1 pl-5">
                  {secao.itens.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}

              {secao.depois?.map((texto) => (
                <p key={texto}>{texto}</p>
              ))}
            </div>
          </section>
        ))}

        <section>
          <h2 className="font-semibold text-ink-900">Fale conosco</h2>
          <p className="mt-2">{avisoContato()}</p>
        </section>

        {/*
          Os direitos de ver e exportar são atendidos numa tela, não por
          requerimento — e o link precisa estar aqui, senão o aviso descreve um
          direito sem dizer onde exercê-lo.
        */}
        <section>
          <h2 className="font-semibold text-ink-900">Onde exercer</h2>
          <p className="mt-2">
            Ver e baixar tudo que guardamos sobre você:{" "}
            <Link href="/meus-dados" className="font-medium text-brand-texto hover:underline">
              Meus dados
            </Link>
            . Alterar nome, e-mail ou telefone:{" "}
            <Link href="/perfil" className="font-medium text-brand-texto hover:underline">
              Meu perfil
            </Link>
            . As duas telas exigem que você esteja conectado.
          </p>
        </section>
      </div>

      <p className="mt-10 border-t border-border pt-5 text-xs text-ink-700/50">
        {AVISO_RODAPE}
      </p>
    </div>
  );
}
