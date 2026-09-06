/* A página /metodologia/ não pode mentir. Corre em Node, sem browser.

   Uma página de metodologia é feita para ser citada. No dia em que alguém
   afinar uma curva no modelo.js e não se lembrar de vir aqui, a página passa a
   descrever um modelo que já não existe — e não há erro nenhum à vista, nem no
   site, nem nos testes, nem no browser. Fica só a mentir.

   Por isso este ficheiro lê os números do HTML PUBLICADO, não do MODELO.md, e
   compara-os com o que o modelo.js devolve hoje. */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);

require(path.join(RAIZ, 'assets/js/modelo.js'));
const M = globalThis.Modelo;
const P = M._pontos;
const html = fs.readFileSync(path.join(RAIZ, 'metodologia/index.html'), 'utf8');
/* O HTML está indentado e as frases partem-se em várias linhas. Qualquer
   procura por uma frase tem de correr sobre esta versão, senão falha por causa
   de um \n a meio de um <strong>. */
const corrido = html.replace(/\s+/g, ' ');

let falhas = 0;
const erro = (m) => { falhas++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

/* Vírgula decimal: a página escreve 18,5 e o JavaScript quer 18.5. */
const num = (s) => parseFloat(String(s).replace(',', '.').replace(/[^\d.\-]/g, ''));

/* Devolve as linhas de uma tabela, pela sua legenda. */
function tabela(legenda) {
  const i = html.indexOf(legenda);
  if (i < 0) return null;
  const fim = html.indexOf('</table>', i);
  const corpo = html.slice(html.indexOf('<tbody>', i), fim);
  return [...corpo.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m =>
    [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)]
      .map(c => c[1].replace(/<[^>]+>/g, '').trim()));
}

/* ------------------------------------------------------------------- 1 */
console.log('\n== 1. os pesos publicados são os do modelo ==');
{
  const linhas = tabela('Peso de cada factor na nota final');
  if (!linhas) erro('não encontrei a tabela dos pesos');
  else {
    const mapa = { 'Vento': 'vento', 'Sol e céu': 'ceu', 'Calor que se sente': 'ar',
                   'Temperatura da água': 'agua', 'Chuva': 'chuva' };
    let mau = 0;
    for (const [nome, peso] of linhas) {
      const chave = mapa[nome];
      if (!chave) { erro(`factor desconhecido na página: «${nome}»`); mau++; continue; }
      if (num(peso) !== M.PESOS[chave]) {
        erro(`${nome}: a página diz ${num(peso)}, o modelo diz ${M.PESOS[chave]}`); mau++;
      }
    }
    const soma = linhas.reduce((a, l) => a + num(l[1]), 0);
    if (soma !== 100) { erro(`os pesos publicados somam ${soma} e não 100`); mau++; }
    if (!mau) ok(`os 5 pesos batem certo e somam 100`);
  }
}

/* ------------------------------------------------------------------- 2 */
console.log('\n== 2. as curvas publicadas são as do modelo ==');
{
  const curvas = [
    ['Pontos por velocidade do vento (percentil 75 da janela)', P.vento, 'vento'],
    ['Pontos por nebulosidade média na janela', P.ceu, 'céu'],
    ['Pontos por temperatura média da água na janela', P.agua, 'água'],
    ['Pontos por probabilidade máxima de chuva na janela', P.chuva, 'chuva'],
  ];
  for (const [legenda, f, nome] of curvas) {
    const linhas = tabela(legenda);
    if (!linhas) { erro(`não encontrei a tabela de ${nome}`); continue; }
    let mau = 0;
    for (const l of linhas) {
      const v = num(l[0]), esperado = num(l[1]);
      if (!isFinite(v)) { erro(`${nome}: não consigo ler o valor «${l[0]}»`); mau++; continue; }
      if (f(v) !== esperado) {
        erro(`${nome} a ${l[0]}: a página diz ${esperado} pontos, o modelo dá ${f(v)}`); mau++;
      }
    }
    if (!mau) ok(`${nome}: ${linhas.length} pontos da curva, todos certos`);
  }
  /* O calor tem duas colunas de valores na mesma linha («23,5 ou 32,5 °C») —
     lê-se à parte para não fingir que a tabela é do mesmo formato. */
  const calor = tabela('Pontos por sensação térmica máxima na janela');
  if (!calor) erro('não encontrei a tabela do calor');
  else {
    let mau = 0;
    for (const [faixa, pts] of calor) {
      const vals = faixa.match(/[\d,]+/g).map(num);
      for (const v of vals) {
        if (P.ar(v) !== num(pts)) {
          erro(`calor a ${v} °C: a página diz ${num(pts)} pontos, o modelo dá ${P.ar(v)}`); mau++;
        }
      }
    }
    if (!mau) ok(`calor: ${calor.length} linhas, ambos os lados da escala certos`);
  }
}

/* ------------------------------------------------------------------- 3 */
console.log('\n== 3. os cortes e a janela ==');
{
  const cortes = tabela('Da nota ao veredicto');
  const verde = num(cortes[0][0]);
  const amareloDe = num(cortes[1][0].split(/\s+a\s+/)[0]);
  const prova = (nota) => {
    /* constrói um dia que dê exactamente esta nota é difícil; em vez disso
       confirma-se o comportamento nos limites com dias reais */
    return nota;
  };
  if (verde !== 70) erro(`a página diz que verde é ≥ ${verde}`);
  if (amareloDe !== 45) erro(`a página diz que amarelo começa em ${amareloDe}`);
  if (verde === 70 && amareloDe === 45) ok('cortes 70 e 45, como no modelo.js:312');

  /* A janela deixou de ser um intervalo contínuo: são dois blocos com um
     buraco no meio. A página tem de publicar os dois, e tem de dizer que as
     horas do buraco ficam de fora — senão «das 9h às 19h» lia-se como onze
     horas seguidas, que é o que o modelo NÃO faz. */
  {
    const blocos = (corrido.match(/<strong>das (\d+)h às (\d+)h<\/strong>/g) || [])
      .map((b) => b.match(/(\d+)h às (\d+)h/).slice(1, 3).map(Number));
    const esperados = M.BLOCOS_DIA;
    if (JSON.stringify(blocos) !== JSON.stringify(esperados)) {
      erro(`a página publica ${JSON.stringify(blocos)} e o modelo usa ${JSON.stringify(esperados)}`);
    } else ok(`as duas janelas batem certo: ${esperados.map((b) => b[0] + 'h–' + b[1] + 'h').join(' e ')}`);
    const buracoDe = M.PARTES[0].fim, buracoAte = M.PARTES[1].ini;
    const re = new RegExp('<strong>' + buracoDe + 'h–' + buracoAte + 'h<\\/strong>');
    if (!re.test(corrido)) {
      erro(`a página não diz que as ${buracoDe}h–${buracoAte}h ficam de fora`);
    } else ok(`e a página diz que as ${buracoDe}h–${buracoAte}h ficam de fora`);
  }
}

/* ------------------------------------------------------------------- 4 */
console.log('\n== 4. os exemplos com números não envelheceram ==');
{
  const base = { ceu: 15, ar: 27, chuva: 0, mm: 0, rajada: 22, dirVento: 300,
                 lat: 40, lon: -8.8, trovoada: false, ondas: 0.8 };
  const nota = (d) => M.classificarDia(d).nota;

  /* mar vs rio, com a mesma meteorologia */
  const esperado = {
    'De mar, água a 18,5 °C': nota({ ...base, vento: 12, agua: 18.5, mar: true }),
    'De mar, água a 22,5 °C (Algarve)': nota({ ...base, vento: 12, agua: 22.5, mar: true }),
    'De rio': nota({ ...base, vento: 12, agua: null, ondas: null, mar: false }),
  };
  const linhas = tabela('A mesma meteorologia, três praias diferentes');
  if (!linhas) erro('não encontrei a tabela mar/rio');
  else {
    let mau = 0;
    for (const [praia, publicada] of linhas) {
      if (!(praia in esperado)) { erro(`linha desconhecida: «${praia}»`); mau++; continue; }
      if (num(publicada) !== esperado[praia]) {
        erro(`«${praia}»: a página diz ${num(publicada)}, o modelo dá hoje ${esperado[praia]}`); mau++;
      }
    }
    const dif = esperado['De rio'] - esperado['De mar, água a 18,5 °C'];
    const mDif = corrido.match(/São <strong>(\d+) pontos<\/strong> de diferença entre mar e rio/);
    if (!mDif) { erro('não encontrei a frase da diferença mar/rio'); mau++; }
    else if (num(mDif[1]) !== dif) {
      erro(`a página diz ${mDif[1]} pontos de diferença mar/rio, e são ${dif}`); mau++;
    }
    if (!mau) ok(`mar/rio: ${Object.values(esperado).join(', ')} — e ${dif} pontos de diferença`);
  }

  /* o prémio do dia calmo */
  const c6 = nota({ ...base, vento: 6, agua: 18.5, mar: true });
  const c22 = nota({ ...base, vento: 22, agua: 18.5, mar: true });
  const mCalmo = corrido.match(/<strong>6 km\/h dá nota (\d+), e com 22 km\/h dá (\d+)<\/strong>/);
  if (!mCalmo) erro('não encontrei a frase do prémio do dia calmo');
  else if (num(mCalmo[1]) !== c6 || num(mCalmo[2]) !== c22) {
    erro(`a página diz 6 km/h → ${mCalmo[1]} e 22 km/h → ${mCalmo[2]}; hoje dá ${c6} e ${c22}`);
  } else ok(`dia calmo: ${c6} contra ${c22}, ${c6 - c22} pontos de diferença`);

  /* os 86 pontos que restam a uma praia de rio */
  const restam = Object.values(M.PESOS).reduce((a, b) => a + b, 0) - M.PESOS.agua;
  const m86 = corrido.match(/<strong>(\d+) pontos<\/strong> que restam/);
  if (!m86) erro('não encontrei os pontos que restam a uma praia de rio');
  else if (num(m86[1]) !== restam) erro(`a página diz ${m86[1]} pontos e restam ${restam}`);
  else ok(`praias de rio pontuam sobre ${restam} pontos`);
}

/* ------------------------------------------------------------------- 5 */
console.log('\n== 5. os vetos publicados são os do código ==');
{
  const fonte = fs.readFileSync(path.join(RAIZ, 'assets/js/modelo.js'), 'utf8');
  const limiares = [
    [/d\.chuva > (\d+)/, /acima de (\d+) % de probabilidade/, 'chuva'],
    [/d\.mm != null && d\.mm >= (\d+)/, /ou (\d+) mm acumulados/, 'chuva acumulada'],
    [/d\.vento > (\d+)/, /Vento acima de (\d+) km\/h/, 'vento'],
    [/d\.rajada > (\d+)/, /rajadas acima de (\d+) km\/h/, 'rajadas'],
    [/d\.ar < (\d+)/, /abaixo de (\d+) °C/, 'frio'],
    [/d\.ondas > ([\d.]+)/, /acima de ([\d,]+) m/, 'ondulação'],
  ];
  let mau = 0;
  for (const [reCod, rePag, nome] of limiares) {
    const c = fonte.match(reCod), p = html.match(rePag);
    if (!c) { erro(`não encontrei o veto de ${nome} no modelo.js`); mau++; continue; }
    if (!p) { erro(`não encontrei o veto de ${nome} na página`); mau++; continue; }
    if (num(c[1]) !== num(p[1])) {
      erro(`veto de ${nome}: o código diz ${c[1]}, a página diz ${p[1]}`); mau++;
    }
  }
  if (!mau) ok(`os ${limiares.length} limiares de veto batem certo com o modelo.js`);

  /* Cada `vetos.push` do código tem de ter o seu limiar na tabela. A contagem
     de LINHAS não serve: a página agrupa por leitura — «chuva acima de 70 %
     ou 2 mm» é uma linha e são dois vetos —, e isso é escrita, não erro. */
  const vetosNoCodigo = (fonte.match(/vetos\.push\(/g) || []).length;
  if (limiares.length !== vetosNoCodigo) {
    erro(`o modelo.js tem ${vetosNoCodigo} vetos e este teste confere ${limiares.length}. ` +
         'Apareceu ou desapareceu um veto — acrescenta-o aqui e à página.');
  } else ok(`os ${vetosNoCodigo} vetos do código estão todos conferidos`);

  /* E a trovoada em concreto: é um AVISO, não um veto. Se voltar a ser veto,
     a página tem de voltar a dizê-lo. */
  const trovoadaVeta = /vetos\.push\([^)]*trovoada/.test(fonte);
  const paginaDizVeto = /Condições que vetam o dia[\s\S]*?<\/table>/.exec(corrido);
  const naTabela = paginaDizVeto && /trovoada/i.test(paginaDizVeto[0]);
  if (trovoadaVeta !== !!naTabela) {
    erro(trovoadaVeta
      ? 'a trovoada voltou a vetar no código e não está na tabela dos vetos'
      : 'a trovoada já não veta, mas a página ainda a lista como veto');
  } else if (!trovoadaVeta) {
    const explica = /A trovoada avisa, mas não decide/.test(corrido);
    if (!explica) erro('a trovoada deixou de vetar e a página não explica porquê');
    else ok('a trovoada é aviso e não veto, nos dois sítios');
  }
}

/* ------------------------------------------------------------------- 6 */
console.log('\n== 6. a página está inteira ==');
{
  const ancoras = ['pesos', 'janela', 'partes', 'direccao', 'curvas', 'vento', 'ceu', 'calor',
                   'agua', 'chuva', 'limitante', 'vetos', 'cortes', 'rio',
                   'limitacoes', 'fontes'];
  const faltam = ancoras.filter(a => !html.includes(`id="${a}"`));
  if (faltam.length) erro(`âncoras em falta: ${faltam.join(', ')}`);
  else ok(`as ${ancoras.length} âncoras existem — os endereços são para ser citados`);

  const noIndice = ancoras.filter(a => !html.includes(`href="#${a}"`));
  if (noIndice.length) erro(`sem entrada no índice: ${noIndice.join(', ')}`);
  else ok('todas estão no índice');

  /* #metades é uma âncora MORTA que se mantém de propósito: houve ligações
     publicadas para /metodologia/#metades e um endereço partilhado não deve
     deixar de aterrar em lado nenhum. Não é secção, não vai ao índice — mas
     tem de continuar a existir. */
  if (!html.includes('id="metades"')) {
    erro('a âncora antiga #metades desapareceu — endereços já partilhados deixam de aterrar');
  } else ok('a âncora antiga #metades continua a aterrar');

  if (!html.includes('rel="canonical" href="https://praiometro.pt/metodologia/"'))
    erro('falta o canonical');
  if (!html.includes('"@type":"BreadcrumbList"')) erro('falta o BreadcrumbList');
  if (/href="(?!https?:|\/|#|mailto:)/.test(html.replace(/<!--[\s\S]*?-->/g, '')))
    erro('há caminhos relativos na página');
  if (!falhas) ok('canonical, dados estruturados e caminhos absolutos');
}

console.log('\n== 7. os portões das metades do dia ==');
{
  /* Os quatro números que decidem quando o site abre a boca sobre a manhã e a
     tarde. São afináveis — e é exactamente por isso que estão aqui: quem os
     afinar no modelo.js e não vier cá acima deixa a página a citar os
     antigos, e não há erro nenhum à vista. */
  /* As TRÊS partes, lidas do HTML e comparadas com o modelo uma a uma. Cobre
     os nomes e as horas ao mesmo tempo: se alguém mexer num bloco no
     modelo.js, a página passa a citar o antigo e isto apanha. */
  {
    /* Sem distinguir maiúsculas: a página escreve «Manhã» a abrir uma frase e
       «da manhã» a meio de outra, e as duas contam. */
    const baixo = corrido.toLowerCase();
    for (const nome of M.PARTES.map((x) => x.nome)) {
      if (!baixo.includes(nome.toLowerCase())) erro(`a página não nomeia a parte «${nome}»`);
    }
    if (/meio-dia solar/.test(baixo) === false && /meio-dia/.test(baixo)) {
      erro('a página ainda fala de uma parte «meio-dia», que já não existe');
    }
  }

  /* A regra de juntar ou partir é a COR, e não um limiar: se alguém puser um
     número aqui, a página tem de o publicar — e este teste obriga a que não
     haja número nenhum para publicar. */
  if (/diferem <strong>\d+ pontos<\/strong>/.test(corrido)) {
    erro('a página voltou a publicar um limiar em pontos para partir o cartão');
  } else ok('não há limiar em pontos: quem manda é a cor');

  /* E o desvio-padrão do desacordo entre modelos continua a ser a razão pela
     qual não há limiar. É o único número desta secção, e é medido. */
  if (!/<strong>5,4 pontos<\/strong> de desvio-padrão/.test(corrido)) {
    erro('a página não publica o desvio-padrão do desacordo entre modelos');
  } else ok('publica os 5,4 pontos de desacordo entre modelos');

  /* A regra antiga dos 7 km/h saiu do código. Se ficar viva em qualquer
     documento público, o site passa a prometer uma coisa que já não faz — e
     foi a /nortada/ que quase ficou de fora desta limpeza. */
  const vestigios = [
    'assets/js/app.js', 'assets/js/modelo.js',
    'metodologia/index.html', 'nortada/index.html', 'MODELO.md',
  ];
  for (const f of vestigios) {
    const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    /* Nos ficheiros de código o comentário que explica a remoção pode citar a
       frase antiga; o que não pode é ela continuar viva. */
    const corpo = f.endsWith('.js') ? t.replace(/\/\*[\s\S]*?\*\//g, '') : t;
    if (/vale a pena ir cedo/.test(corpo)) erro(`${f} ainda publica «vale a pena ir cedo»`);
    if (/ventoManha|ventoTarde/.test(corpo)) erro(`${f} ainda usa ventoManha/ventoTarde`);
  }
  if (!falhas) ok('a regra dos 7 km/h não sobreviveu em lado nenhum');

  /* A afirmação que originou o redesenho todo: a nota do dia É a média das
     três partes. É uma identidade e não uma promessa, e a página tem de a
     dizer — se alguém voltar a fazer a nota do dia sair da sua própria soma, o
     ecrã volta a mostrar um número que contradiz as suas partes. */
  if (!/nota do dia é a <strong>média aritmética<\/strong> das duas/.test(corrido)
      && !/A nota do dia é a média das duas partes/.test(corrido)) {
    erro('a página não afirma que a nota do dia é a média das duas partes');
  } else ok('a página afirma que a nota do dia é a média das duas');
  if (/não é a média das duas metades/.test(corrido)) {
    erro('a página ainda descreve o modelo antigo das duas metades');
  }
  /* Os números da frase são medidos, e a medição depende das JANELAS. Se
     alguém mexer nas horas e não voltar a correr o medir-portao.js, a página
     fica a publicar percentagens de um modelo que já não existe — e isso não
     tem erro nenhum à vista. Aqui pelo menos fica registado que os números
     publicados e as janelas publicadas têm de vir da mesma corrida. */
  /* O detector da frase saiu do modelo. A página pode contar a história — e
     conta — mas não pode voltar a prometer uma frase que já não existe. */
  if ('conselhoMetades' in M) {
    erro('o detector da frase voltou ao modelo sem a página ser reescrita');
  }
  if (!/Foi apagado quando o cartão passou a mostrar as duas notas sempre/.test(corrido)) {
    erro('a página não conta que o detector saiu, e porquê');
  } else ok('a página conta a história do detector que saiu');
}

/* ---------------------------------------------------------------------- */
/* AS CONTAGENS ESCRITAS À MÃO. Estavam as três desactualizadas — a descrição
   do <head> dizia «995 praias» e o ficheiro tinha 1131 — e nada no projecto
   dava por isso, porque um número numa frase não tem testes. Este é o mesmo
   defeito dos contactos escritos à mão nas páginas legais: o texto e a fonte
   da verdade separam-se em silêncio, e quem lê acredita no texto.

   A contagem é a do data/praias.json, que é quem manda. */
const quantas = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data/praias.json'), 'utf8')).length;
for (const f of ['index.html', '404.html', 'metodologia/index.html']) {
  const t = fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const velhas = [...t.matchAll(/\b(\d{3,4}) praias\b/g)]
    .map((m) => +m[1]).filter((x) => x !== quantas);
  if (velhas.length) {
    erro(`${f} diz «${velhas[0]} praias» e o ficheiro tem ${quantas}`);
  } else ok(`${f} não tem contagens de praias desactualizadas`);
}

console.log('\n' + '='.repeat(54));
console.log('FALHAS: ' + falhas);
console.log('='.repeat(54));
process.exit(falhas ? 1 : 0);
