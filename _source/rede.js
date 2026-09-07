/* NÃO CONSEGUIR MEDIR NÃO É ENCONTRAR UM DEFEITO.
   =============================================================
   Três programas deste projecto vão à rede de terceiros — a Open-Meteo, o
   Overpass, a APA — e todos os três têm de distinguir duas coisas que se
   parecem no ecrã e não se parecem nada em consequência:

     · «medi e está mau»          -> código 1, o CI fica vermelho
     · «não consegui medir nada»  -> código 2, fica um aviso e mais nada

   A razão de o 2 existir está escrita no bateria.yml: um alarme que dispara
   por causa da quota ou da rede de outra pessoa deixa de ser lido à terceira
   vez, e a seguir ninguém repara no que é a sério. Foi o que aconteceu — a
   bateria esteve vermelha cinco das últimas onze noites e ninguém olhou; das
   cinco, duas eram um `ConnectTimeoutError` a chegar à Open-Meteo.

   E ESTA FUNÇÃO VIVE NUM SÍTIO SÓ. Escrevi-a primeiro dentro de um dos
   programas e ia copiá-la para os outros dois; uma função copiada é uma
   função que vai divergir, e este projecto já pagou isso com a `normalizar()`
   (ver o comentário no actualizar-praias.js). Três cópias de uma regra de
   classificação de erros dão, ao fim de uns meses, três respostas diferentes
   à mesma falha de rede. */
'use strict';

/* O `fetch` do Node embrulha a causa real: o que sai no `message` é «fetch
   failed» e o motivo — ConnectTimeoutError, ENOTFOUND, ECONNRESET — vive na
   `cause`, às vezes com mais um nível por baixo. Por isso se olha para as
   duas, e para o texto que os nossos próprios programas escrevem quando um
   servidor responde 429 ou 5xx (que é recusa de serviço, não defeito nosso). */
const DA_REDE = /fetch failed|ConnectTimeout|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|socket hang up|network|respond(eu|e) (429|5\d\d)|resposta (429|5\d\d)|Query timed out/i;

/* E DUAS FORMAS DE RECUSA QUE NÃO SE VÊEM NO CÓDIGO HTTP.
   =============================================================
   1. UM CORPO QUE NÃO É JSON. Nenhuma URL mal construída nossa faz um servidor
      responder texto que não é JSON num sítio onde ele promete JSON — isso é o
      servidor, ou um intermediário dele, a portar-se mal. Foi assim que o
      `testar-praias.js` chumbou o CI: «Unexpected token 'U'», que é o que
      sobra de uma página de erro a passar por `JSON.parse`.

   2. A OPEN-METEO RECUSA COM 200 OU COM 400, e diz a razão no corpo em vez de
      a dizer no código: `{"error":true,"reason":"Minutely API request limit
      exceeded"}`. Classificar isso pelo código HTTP dava exit 1 — e um limite
      de pedidos por minuto não é um defeito do site.

   O que NÃO entra aqui, de propósito: um 400 cuja razão fale de um parâmetro
   («Cannot initialize WeatherVariable from invalid String value…»). Esse é
   nosso, e tem de continuar a pintar o CI de vermelho. */
const RECUSA = /corpo n[ãa]o [ée] JSON|limit exceeded|Minutely API|Hourly API|Daily API|too many requests|rate.?limit|quota/i;

function eDaRede(e) {
  let x = e, voltas = 0;
  while (x && voltas++ < 5) {
    if (DA_REDE.test(String(x.message || x))) return true;
    if (RECUSA.test(String(x.message || x))) return true;
    if (x.code && DA_REDE.test(String(x.code))) return true;
    x = x.cause;
  }
  return false;
}

/* Morre com o código certo e diz porquê. O `nome` é o do programa, para que
   quem lê o registo do CI saiba qual dos três não conseguiu medir. */
function morrer(nome, e) {
  const rede = eDaRede(e);
  console.error('✗ ' + nome + ': ' + (e && e.message ? e.message : e));
  if (e && e.cause) console.error('  causa: ' + (e.cause.message || e.cause));
  if (rede) console.error('  é a rede, não é o site — código 2, não conta como falha.');
  process.exit(rede ? 2 : 1);
}

module.exports = { eDaRede, morrer };
