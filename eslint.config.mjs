import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
  Sobre a versão do eslint-config-next.

  Ele está PROPOSITALMENTE à frente do framework: a plataforma roda Next 14 com
  React 18, e o pacote de lint é da linha 16. A combinação funciona — as regras
  do @next/next e do TypeScript valem igual — e é a única que roda sob ESLint 9,
  que é o que este projeto usa. Voltar o lint para a linha 14 exigiria também
  voltar para o ESLint 8 e para o formato .eslintrc.

  O preço é este bloco: um punhado de regras da configuração nova pressupõe
  React 19 e o compilador, e não descrevem o código que roda aqui. Elas ficam
  desligadas com o motivo escrito, e não caladas por conveniência — no dia em
  que o framework subir, é este bloco que se apaga, e os avisos que voltarem
  são trabalho de verdade.
*/
const regrasDeOutraVersaoDoReact = {
  rules: {
    /*
      Marca qualquer setState dentro de useEffect. É regra da era do compilador
      do React: no React 19 o padrão tem alternativa direta, no 18 ele continua
      sendo a forma normal de reagir a uma mudança de rota ou de prop.

      Três pontos do projeto caem aqui — a casca que fecha a gaveta ao navegar,
      e as duas listas de arrastar-e-soltar que espelham a ordem vinda do
      servidor. Os dois últimos são de fato o padrão que a documentação do
      React desaconselha, e valem uma revisão à parte: mexer neles é mexer no
      comportamento do arrastar, não em estilo de código.
    */
    "react-hooks/set-state-in-effect": "off",
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  regrasDeOutraVersaoDoReact,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
