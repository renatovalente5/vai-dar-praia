/* AS ÁGUAS BALNEARES OFICIAIS, DA APA — o oráculo de QUE PRAIAS EXISTEM.
   =============================================================
   Correr:  node _source/actualizar-balneares.js --verificar   (só compara)
            node _source/actualizar-balneares.js --recolher    (vai à APA)
            node _source/actualizar-balneares.js               (aplica o que dá)

   PORQUÊ ISTO EXISTE, e é uma lição cara.

   A lista de praias foi montada do OpenStreetMap, e depois passei a verificá-la
   CONTRA O OPENSTREETMAP. Isso não é verificar nada: é perguntar à cópia se
   concorda com o original de onde saiu. Correu sempre limpo — «1042 de 1046» —
   e eu li aquilo como «a cobertura está completa». Não estava. O que estava
   completo era o decalque.

   Uma amiga do autor foi procurar a Praia de Esmoriz e não a encontrou. Fui
   medir contra a lista oficial da Agência Portuguesa do Ambiente, que é quem
   designa as águas balneares deste país, e o buraco era este:

     · 131 águas balneares oficiais sem NADA a menos de 4 km no site
     · 64 delas com BANDEIRA AZUL
     · a ilha de SANTA MARIA inteira ausente — quatro praias oficiais, zero no
       site — e mais Velas e Calheta, em São Jorge
     · ausentes a Vagueira, Mindelo, São Bernardino, o Cabo Mondego, a
       Tamargueira, o Porto Moniz, a Praia Verde

   Nada no projecto podia dar por isto, porque nada olhava para fora do OSM.

   A REGRA NOVA: o OSM diz onde estão as praias e como se chamam; a APA diz
   QUAIS existem. Uma água balnear oficial que não esteja no site é um defeito
   do site, e não uma opinião do OSM.

   A CHAVE QUE LIGA AS DUAS FONTES é o `codigo_agua_balnear` da APA, que é
   exactamente o `ref:EU:bwid` do OpenStreetMap — o identificador europeu da
   água balnear. 35 objectos do OSM já o trazem.

   O QUE SE DECIDE SOZINHO E O QUE NÃO SE DECIDE:

   · ACRESCENTAR decide-se quando não há NADA a menos de 1,5 km. O limiar não
     é palpite: medida a distância entre o ponto da APA e o do site nas 516
     praias que casam por nome, a mediana é 96 m e o percentil 90 é 572 m. A
     1,5 km já não é a mesma areia.

   · ALIAS decide-se sempre que o nome oficial difere do nome que o site
     mostra. É seguro nas DUAS leituras: se for a mesma praia, o nome oficial
     é o certo; se for uma praia vizinha, quem escreve o nome oficial chega a
     algo a 240 m (mediana) em vez de não chegar a lado nenhum. Só alarga a
     procura — não muda um nome, não move um ponto, não apaga nada.

   · APAGAR não se decide aqui, nem nunca. O site tem 1131 praias e a APA tem
     761: as que sobram são enseadas, praias sem vigilância e piscinas naturais
     que ninguém designou. Não ser oficial não é não existir.

   · O `m` NÃO SAI DA CATEGORIA DA APA, e isto foi medido antes de se escrever.
     A categoria é jurídica, não oceanográfica: a APA chama COSTEIRA à Foz do
     Arelho-Lagoa, à Lagoa de Albufeira e às quatro praias do lado de dentro da
     Ria Formosa — que são exactamente as oito que estão curadas à mão no
     actualizar-praias.js por a grelha marinha as descrever mal. E chama
     TRANSIÇÃO ao Moledo, que é oceano aberto. Serve para uma coisa só, e essa
     é de confiança: `categoria 2 = interior` é água doce, e água doce nunca é
     mar. Para as outras pergunta-se à API marinha, como já se fazia. */
'use strict';
const fs = require('fs');
const path = require('path');
const { morrer } = require('./rede.js');

const RAIZ = path.dirname(__dirname);
const PRAIAS = path.join(RAIZ, 'data', 'praias.json');
const APA = path.join(RAIZ, '_source', 'aguas-balneares.json');
const OSM = path.join(RAIZ, '_source', 'osm-praias.json');

/* O serviço da APA. É o mesmo que alimenta o visualizador do SNIAmb e o
   praias.apambiente.pt, e devolve GeoJSON em WGS84 se lho pedirmos. */
const FONTE = 'https://sniambgeoogc.apambiente.pt/getogc/rest/services/SNIAmb/Praias'
  + '/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=2000';

const KM_MESMA = 1.5;      /* a menos disto é a mesma areia — ver o cabeçalho */
const KM_NOME = 4.0;       /* o mesmo nome a menos disto é a mesma praia */
const M_NOME_OSM = 800;    /* raio para ir buscar ao OSM o nome por extenso */
const M_MESMO_PONTO = 60;  /* a menos disto é o mesmo ponto, e é um cartão só */

/* ------------------------------------------------------------ palavras --- */
/* A `normalizar()` LÊ-SE DO app.js, nunca se copia. Copiei-a uma vez e
   divergiu à primeira praia. Ver o comentário gémeo no actualizar-praias.js. */
const normalizar = (function () {
  const src = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'app.js'), 'utf8');
  const m = src.match(/function normalizar\(s\) \{[\s\S]*?\n {2}\}/);
  if (!m) { console.error('✗ não encontrei a normalizar() em app.js — mudou de forma?'); process.exit(1); }
  return new Function(m[0] + '; return normalizar;')();
})();
const N = (s) => normalizar(s || '').replace(/\s+/g, ' ').trim();

/* As palavras com que um sítio de banho começa em português. Servem para duas
   coisas: cortar o prefixo quando se comparam nomes, e saber se um nome da APA
   já vem completo ou se lhe falta o «Praia de» à frente. */
const ESPECIE = '(praia|praias|parque|zona balnear|zona|areal|piscinas|piscina|albufeira'
  + '|acude|poca|portinho|faja|prainha|clube|complexo|lagoa|barragem|cais|porto|baia|zona de banhos)';
const nucleo = (s) => N(s)
  .replace(new RegExp('^' + ESPECIE + '\\s+(fluvial\\s+|natural\\s+|naturais\\s+|oceanicas?\\s+)?(de|da|do|das|dos)?\\s*'), '')
  .replace(/\s+(norte|sul|nascente|poente|este|oeste|centro|\d+)$/, '')
  .trim();
const temEspecie = (s) => new RegExp('^' + ESPECIE + '\\b').test(N(s));
/* O nome é SÓ a espécie e mais nada: «Praia», «Prainha», «Calheta». */
const soEspecie = (s) => new RegExp('^' + ESPECIE + '$').test(N(s));

/* A APA escreve os concelhos em maiúsculas — «SANTA CRUZ DA GRACIOSA» — e o
   site escreve-os como se escrevem. As partículas ficam em minúscula, que é a
   norma em português: «Santa Cruz da Graciosa», e não «Da Graciosa». */
const PARTICULA = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o']);
const capitalizar = (s) => String(s).toLocaleLowerCase('pt-PT').split(/\s+/)
  .map((w, i) => (i && PARTICULA.has(w)) ? w : w.charAt(0).toLocaleUpperCase('pt-PT') + w.slice(1))
  .join(' ');

const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.32, (a[1] - b[1]) * 84.5);
const CAT = { 1: 'costeira', 2: 'interior', 3: 'transicao' };

/* ------------------------------------------------------------ recolher --- */
async function recolher() {
  const r = await fetch(FONTE, { headers: { 'User-Agent': 'praiometro.pt (actualizar-balneares.js)' } });
  if (!r.ok) throw new Error('a APA respondeu ' + r.status);
  const d = await r.json();
  const fs_ = d.features || [];
  if (fs_.length < 500) throw new Error(`a APA devolveu só ${fs_.length} águas balneares — são ~760, não se grava isto`);
  /* GUARDA-SE MAGRO. O serviço devolve 34 campos por praia, dos quais 27 são
     equipamentos (duche, sanitários, estacionamento) que este site não mostra
     e que mudam de época para época. Guardar o que não se usa é guardar ruído
     que um dia alguém vai tentar explicar. */
  const magro = fs_.map((f) => {
    const p = f.properties, [lo, la] = f.geometry.coordinates;
    return {
      id: p.codigo_agua_balnear,          /* = ref:EU:bwid do OSM */
      n: p.nome_praia,
      co: p.concelho,
      arh: p.arh,
      cat: p.categoria_agua_balnear,      /* 1 costeira, 2 interior, 3 transição */
      ba: p.bandeira_azul ? 1 : 0,
      la: +la.toFixed(5),
      lo: +lo.toFixed(5),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(APA, '{\n "colhido": ' + JSON.stringify(new Date().toISOString().slice(0, 10))
    + ',\n "aguas": [\n' + magro.map((x) => '  ' + JSON.stringify(x)).join(',\n') + '\n ]\n}\n');
  console.log(`_source/aguas-balneares.json — ${magro.length} águas balneares oficiais`);
  return magro;
}

/* -------------------------------------------------------------- casar ---- */
/* Para cada água balnear oficial, o que é que o site já tem no mesmo sítio. */
const KM_LONGE = 1.5;      /* casar por nome a mais disto merece um olhar */
function casar(aguas, praias) {
  const nada = [], comAlias = [], jaEsta = [], longe = [];
  for (const a of aguas) {
    const nOf = nucleo(a.n);
    /* O MESMO NOME PERTO chega para dizer «já está» — e o raio é largo (4 km)
       porque o ponto da APA é o do posto de vigia e o do site é o centro do
       areal, e numa praia comprida isso são quilómetros. */
    const mesmoNome = praias.find((p) => km([a.la, a.lo], [p.la, p.lo]) < KM_NOME
      && (nucleo(p.n) === nOf || N(p.n).includes(N(a.n)) || N(a.n).includes(nucleo(p.n))));
    if (mesmoNome) {
      jaEsta.push({ a, p: mesmoNome });
      const d = km([a.la, a.lo], [mesmoNome.la, mesmoNome.lo]);
      if (d > KM_LONGE) longe.push({ a, p: mesmoNome, d });
      continue;
    }
    const perto = praias
      .map((p) => ({ p, d: km([a.la, a.lo], [p.la, p.lo]) }))
      .sort((x, y) => x.d - y.d)[0];
    if (perto && perto.d < KM_MESMA) comAlias.push({ a, p: perto.p, d: perto.d });
    else nada.push({ a, d: perto ? perto.d : Infinity, viz: perto ? perto.p.n : '—' });
  }
  return { nada, comAlias, jaEsta, longe };
}

/* ------------------------------------------------------- abreviaturas ---- */
/* A APA ABREVIA, E QUEM PROCURA ESCREVE POR EXTENSO.
   «S. Bernardino» é o que está na lista oficial; ninguém escreve isso na caixa
   de procura — escreve «são bernardino», e a `normalizar()` não sabe que «s»
   e «sao» são a mesma coisa. Foi assim que a Praia de São Bernardino, com
   bandeira azul, ficou a existir no ficheiro e a não se encontrar: o mesmo
   defeito da Praia de Esmoriz, dois passos mais à frente.

   A TABELA É ESCRITA À MÃO e não adivinhada. «S.» tanto pode ser São como
   Santa, e a diferença é o género do nome que vem a seguir — nas 17 águas
   balneares com abreviatura são todos masculinos (Julião, Gião, Bernardino,
   Pedro, Sebastião, Lourenço, João, Paio, Martinho, Roque, Simão), e por isso
   «S.» abre para «São». No dia em que entrar uma «S. Marta», esta regra dá
   «São Marta» — e é por isso que existe a verificação lá em baixo. */
const ABREVIATURA = [
  [/\bN\.\s*S[ªa]\.?/g, 'Nossa Senhora'],
  [/\bSt[oa]?\.\s*/g, 'Santo '],
  [/\bS\.\s*/g, 'São '],
  [/\bD\.\s*/g, 'Dona '],
];
/* As que ficam abreviadas de propósito, porque é assim que se escrevem. */
const ABREVIATURA_OK = /^(Dr|Dra|Sr|Sra|Eng|Arq|Prof)$/;
function porExtenso(n) {
  let r = String(n);
  for (const [de, para] of ABREVIATURA) r = r.replace(de, para);
  return r.replace(/\s+/g, ' ').trim();
}
/* Uma abreviatura que a tabela não conhece não se adivinha: pára-se. */
function abreviaturasPorConhecer(aguas) {
  const desconhecidas = new Set();
  for (const a of aguas) {
    for (const m of porExtenso(a.n).matchAll(/\b([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-zª]{0,3})\./g)) {
      if (!ABREVIATURA_OK.test(m[1])) desconhecidas.add(m[1] + '.  (em «' + a.n + '»)');
    }
  }
  return [...desconhecidas];
}

/* -------------------------------------------------------------- nome ----- */
/* O NOME COM QUE UMA PRAIA NOVA ENTRA.
   A APA usa etiquetas curtas — «Vagueira», «Norte», «Côja» —, que são o que
   está na bandeira e no edital, não o nome por que a praia se procura. O site
   escreve «Praia da Vagueira». Por isso:

     1.º  se o OSM tiver um objecto nomeado a menos de 800 m cujo núcleo é o
          mesmo, é esse o nome — é o nome por extenso e na convenção do site,
          e casa em 44 das 100 que faltavam;
     2.º  se o nome da APA já começa por uma espécie («Piscinas Naturais da
          Lagoa», «Albufeira de Odeleite»), fica como está;
     3.º  senão põe-se a espécie à frente, SEM ARTIGO. «Praia Vagueira» lê-se
          pior do que «Praia da Vagueira», mas o artigo certo não se adivinha
          — é «da» Vagueira, «do» Labrego, «de» Mindelo — e um artigo errado
          num nome próprio é pior do que um artigo a menos. O site já tem
          nomes assim vindos do OSM: «Praia Vela Areinho», «Praia Formosa». */
function nomeDe(a, porOsm) {
  /* A APA separa dois lugares com uma barra invertida — «Montalvo\\Tesos» —, que
     é o único sítio do ficheiro onde ela aparece e que não sobrevive a um
     endereço nem a um nome de ficheiro. Passa a barra normal, que é o que o
     OSM já usa nos nomes com dois lugares («Achada/Achadinha»). */
  const limpo = (s) => s.replace(/\s*\\\s*/g, '/').replace(/\s+/g, ' ').trim();
  if (porOsm) return limpo(porOsm);
  const n = porExtenso(limpo(a.n));
  /* UM NOME QUE É SÓ A ESPÉCIE não distingue nada. A água balnear da Graciosa
     chama-se «Praia» e mais nada — é o nome da vila —, e o site já tem duas
     praias chamadas «Praia». Junta-se-lhe o concelho, que é o que a lista de
     sugestões mostra ao lado e o que o gerador de endereços já usa para
     desempatar. */
  const base = temEspecie(n) ? n : (a.cat === 2 ? 'Praia Fluvial ' : 'Praia ') + n;
  if (!soEspecie(base)) return base;
  return base + ' (' + capitalizar(a.co) + ')';
}

function nomeNoOsm(a, elementos) {
  const nOf = nucleo(a.n);
  let melhor = null;
  for (const e of elementos) {
    const t = e.tags || {};
    if (!t.name) continue;
    const c = e.center ? [e.center.lat, e.center.lon] : [e.lat, e.lon];
    if (c[0] == null) continue;
    const d = km([a.la, a.lo], c) * 1000;
    if (d > M_NOME_OSM) continue;
    /* O bwid é prova, não indício: se o OSM disser que aquele objecto é ESTA
       água balnear, o nome é dele e acabou a discussão. */
    if (t['ref:EU:bwid'] === a.id) return t.name;
    /* E O NÚCLEO TEM DE SER IGUAL, não parecido. Aceitar que um contivesse o
       outro deu às «Piscinas Naturais da Lagoa» — bandeira azul, em São
       Miguel — o nome do «Complexo Municipal de Piscinas Lagoa» que está a
       30 m: o núcleo da oficial é «lagoa», e «lagoa» cabe dentro de meio
       país. Um nome errado é pior do que um nome sem artigo. */
    if (nucleo(t.name) !== nOf) continue;
    if (!melhor || d < melhor.d) melhor = { nome: t.name, d };
  }
  return melhor ? melhor.nome : null;
}

/* ---------------------------------------------------------- água doce ---- */
/* A ÚNICA COISA QUE A CATEGORIA DA APA DECIDE SOZINHA: água doce não é mar.
   A categoria é jurídica e não serve para saber se a grelha marinha descreve
   bem uma água (ver o cabeçalho) — mas `categoria 2 = interior` quer dizer
   água doce, e uma água doce nunca leva ondulação do Atlântico.

   E ISTO APANHA UM ENGANO QUE A API MARINHA COMETE. Ela responde com números
   em qualquer ponto da costa, encaixando no oceano aberto mais próximo, e a
   uns quilómetros da linha de costa ainda responde: os «Olhos da Fervença»,
   em Cantanhede, e a piscina natural da Ereira, em Montemor-o-Velho, foram
   ambos classificados como MAR por ela. São água doce, e a APA di-lo.

   A CONDIÇÃO É «A ÚNICA ÁGUA OFICIAL PERTO É INTERIOR», e não «há uma água
   interior perto». Sem isso marcava-se a Praia da Foz do Lizandro e a Praia
   de Mira como rio: nas duas há uma água balnear de rio a 200 m — a foz do
   Lizandro, a Barrinha de Mira — E uma água balnear costeira ao lado dela.
   São praias de mar com um rio a desaguar; a de mar é que é o cartão. */
const KM_DOCE = 1.0;
function aguaDoce(praias, aguas) {
  const maus = [];
  for (const p of praias) {
    if (p.m !== 1) continue;
    const perto = aguas.filter((a) => km([p.la, p.lo], [a.la, a.lo]) < KM_DOCE);
    if (perto.length && perto.every((a) => a.cat === 2)) maus.push({ p, a: perto[0] });
  }
  return maus;
}

/* --------------------------------------------------------------- mar? ---- */
async function saoDeMar(pontos) {
  const la = pontos.map((p) => p[0].toFixed(4)).join(',');
  const lo = pontos.map((p) => p[1].toFixed(4)).join(',');
  const r = await fetch('https://marine-api.open-meteo.com/v1/marine?latitude=' + la
    + '&longitude=' + lo + '&hourly=wave_height&forecast_days=1&timezone=auto');
  if (!r.ok) throw new Error('a API marinha respondeu ' + r.status);
  let d = await r.json();
  if (!Array.isArray(d)) d = [d];
  return d.map((x) => (((x || {}).hourly || {}).wave_height || []).some((v) => v != null) ? 1 : 0);
}

/* ---------------------------------------------------------------- main --- */
(async function () {
  const verificar = process.argv.includes('--verificar');
  let aguas;
  if (process.argv.includes('--recolher')) aguas = await recolher();

  if (!aguas) {
    if (!fs.existsSync(APA)) {
      console.error('✗ falta o _source/aguas-balneares.json.');
      console.error('  Correr: node _source/actualizar-balneares.js --recolher');
      process.exit(2);
    }
    aguas = JSON.parse(fs.readFileSync(APA, 'utf8')).aguas;
  }
  const colhido = fs.existsSync(APA) ? JSON.parse(fs.readFileSync(APA, 'utf8')).colhido : '?';
  const praias = JSON.parse(fs.readFileSync(PRAIAS, 'utf8'));

  /* A CÓPIA TEM IDADE, e diz-se sempre — a época balnear muda todos os anos e
     um ficheiro sem data envelhece em silêncio. */
  const dias = Math.round((Date.now() - Date.parse(colhido)) / 86400000);
  console.log(`lista da APA: ${colhido} (há ${dias} dia${dias === 1 ? '' : 's'}), `
    + `${aguas.length} águas balneares · site: ${praias.length} praias`);

  const porConhecer = abreviaturasPorConhecer(aguas);
  if (porConhecer.length) {
    console.error('✗ abreviaturas que a tabela não conhece:');
    for (const x of porConhecer) console.error('   ' + x);
    console.error('  Escrevê-las na ABREVIATURA, em _source/actualizar-balneares.js.');
    process.exit(1);
  }

  const { nada, comAlias, jaEsta, longe } = casar(aguas, praias);
  console.log(`  já no site, com o mesmo nome : ${jaEsta.length}`);
  console.log(`  já no site, com outro nome   : ${comAlias.length}`);
  console.log(`  A FALTAR                     : ${nada.length}`
    + (nada.length ? `  (${nada.filter((x) => x.a.ba).length} com bandeira azul)` : ''));

  /* ---- o que falta ---------------------------------------------------- */
  if (nada.length) {
    console.log('');
    for (const x of nada.slice(0, 40)) {
      console.log(`   ${x.a.ba ? 'BA ' : '   '}${CAT[x.a.cat].padEnd(9)} `
        + `${(x.a.n + ' — ' + x.a.co).padEnd(52)} ${x.d.toFixed(1)} km de ${x.viz}`);
    }
    if (nada.length > 40) console.log(`   … e mais ${nada.length - 40}`);
  }

  /* ---- alias que faltam ------------------------------------------------ */
  /* O CRITÉRIO É A PROCURA, e não a semelhança dos nomes.
     Comecei por registar o nome oficial só quando ele DIFERIA do nome do
     cartão. Não chega, e a medida diz porquê: a «Baía do Refugo» tem cartão
     («Piscina Natural do Refugo») e o núcleo dos dois nomes é o mesmo —
     «refugo» —, portanto não era registada; mas quem escreve «baía do refugo»
     na caixa não encontra nada, porque a procura exige que TODOS os termos
     escritos existam no campo de busca, e «baia» não existe em «piscina
     natural do refugo». Eram 167 águas balneares nesta situação.

     A pergunta certa é literalmente a que a procura faz: escrevendo este nome
     oficial, todos os termos aparecem no que a praia tem para procurar? Se não
     aparecerem, o nome tem de lá ser posto — seja o nome parecido ou não.

     E vai para o registo que a APA lhe atribuiu, nunca para o mais próximo:
     há quatro «Prainha» no país, e o vizinho mais perto da Prainha da Praia da
     Vitória é a «Praia dos Oficiais», que é outra areia. */
  const encontraSe = (p, nome) => {
    const alvo = normalizar(p.n + ' ' + (p.a || ''));
    return N(nome).split(' ').filter(Boolean).every((t) => alvo.indexOf(t) !== -1);
  };
  const porPraia = new Map();
  for (const { a, p } of [...comAlias, ...jaEsta]) {
    if (encontraSe(p, a.n)) continue;
    if (!porPraia.has(p)) porPraia.set(p, new Set());
    porPraia.get(p).add(a.n);
  }
  let novosAlias = 0;
  for (const [, s] of porPraia) novosAlias += s.size;
  console.log(`  nomes oficiais por registar  : ${novosAlias} em ${porPraia.size} praias`);

  /* AVISO, E NAO FALHA. Casar por nome a 2 km pode ser uma praia comprida — a
     Meia Praia de Lagos tem 4 km e o ponto oficial esta numa ponta — ou pode
     ser uma coordenada errada: os «Poceirões» da Graciosa estao a 3,6 km do
     ponto da APA porque o no do OSM de onde saiu a coordenada esta noutro
     sitio. Uma coisa distingue-se da outra a olho, num mapa, e por isso
     lista-se em vez de se decidir. */
  if (longe.length) {
    console.log(`  a confirmar a mao (nome igual, mas longe): ${longe.length}`);
    for (const l of longe.sort((x, y) => y.d - x.d)) {
      console.log(`     ${l.d.toFixed(1)} km  «${l.a.n}» (${l.a.co}) -> ${l.p.n}`);
    }
  }

  const doces = aguaDoce(praias, aguas);
  if (doces.length) {
    console.log(`  ÁGUA DOCE tratada como mar   : ${doces.length}`);
    for (const d of doces) console.log(`     ${d.p.n}  (oficial «${d.a.n}», ${d.a.co}, interior)`);
  }

  if (verificar) {
    if (nada.length || novosAlias || doces.length) {
      console.error('');
      console.error(`✗ ${nada.length} águas balneares oficiais a faltar, ${novosAlias} nomes oficiais por`);
      console.error(`  registar e ${doces.length} águas doces tratadas como mar.`);
      console.error('  Correr: node _source/actualizar-balneares.js');
      process.exit(1);
    }
    console.log(`✓ as ${aguas.length} águas balneares oficiais estão todas no site`);
    process.exit(0);
  }

  /* ---- aplicar --------------------------------------------------------- */
  for (const d of doces) d.p.m = 0;

  /* OS ALIAS PRIMEIRO, que não dependem da rede e não podem falhar. */
  for (const [p, s] of porPraia) {
    /* SEPARADOS POR « · », e nao por um espaco. Sao nomes proprios inteiros e
       ha praias com dois — a de Mindelo e tambem «Pinhal dos Eletricos» e
       «Laderca» —, e sem separador a procura mostrava «Pinhal dos Eletricos
       Laderca» como se fosse um nome so. A `normalizar()` do site troca o «·»
       por espaco, portanto o separador nao atrapalha quem escreve. */
    p.a = [p.a, ...s].filter(Boolean).join(' · ');
  }

  /* AS PRAIAS NOVAS. O nome vai buscar-se ao OSM quando lá está, e o `m` à API
     marinha — excepto nas interiores, onde a categoria da APA basta. */
  const elementos = fs.existsSync(OSM) ? JSON.parse(fs.readFileSync(OSM, 'utf8')).elements : [];
  if (!elementos.length && nada.length) {
    console.log('  (sem _source/osm-praias.json: os nomes saem só da APA)');
  }
  const acrescentar = [];
  for (const { a } of nada) {
    /* DUAS ÁGUAS OFICIAIS NO MESMO PONTO SÃO UM CARTÃO SÓ, com os dois nomes.
       A APA dá exactamente as mesmas coordenadas — a menos de um metro — à
       «Praia» e ao «Barro Vermelho», na Graciosa, e são duas águas balneares
       distintas com bandeira azul cada uma. Dois cartões nas mesmas
       coordenadas mostrariam a mesma previsão duas vezes com nomes
       diferentes, que é o defeito que o resto deste projecto passa a vida a
       evitar; e a chave de coordenada do gerar-concelhos.py nem sequer os
       distingue — foi ele que deu por isto, ao recusar 1252 praias que davam
       1251 chaves. O segundo nome vira alias: uma previsão, dois nomes por
       que se chega a ela. */
    const gemea = acrescentar.find((x) => km([a.la, a.lo], [x.a.la, x.a.lo]) * 1000 < M_MESMO_PONTO);
    if (gemea) { gemea.tambem.push(a.n); continue; }
    /* NA COLISÃO DE NOMES, MANDA A APA. O nome vem do OSM por conveniência —
       é o nome por extenso —, e o OSM tem a mesma poça mapeada duas vezes com
       o mesmo nome e em sítios diferentes: os «Poceirões piscinas naturais»,
       na Graciosa, estão a 3,6 km dos «Poceirões - Piscinas naturais» que o
       site já tinha, e só um deles fica a 55 m do ponto oficial. Dois cartões
       com o mesmo nome dão o mesmo endereço, e o gerador de endereços recusa
       gravar quando um endereço já publicado deixaria de existir. */
    let nome = nomeDe(a, nomeNoOsm(a, elementos));
    if (praias.some((q) => N(q.n) === N(nome)) || acrescentar.some((x) => N(x.nome) === N(nome))) {
      nome = nomeDe(a, null);
    }
    acrescentar.push({ a, nome, tambem: [] });
  }

  const perguntar = acrescentar.filter((x) => x.a.cat !== 2);
  const mares = new Map();
  for (let i = 0; i < perguntar.length; i += 60) {
    const lote = perguntar.slice(i, i + 60);
    const r = await saoDeMar(lote.map((x) => [x.a.la, x.a.lo]));
    lote.forEach((x, j) => mares.set(x.a.id, r[j]));
    if (i + 60 < perguntar.length) await new Promise((r2) => setTimeout(r2, 3000));
  }

  for (const x of acrescentar) {
    const novo = {
      n: x.nome, la: x.a.la, lo: x.a.lo,
      r: 'Centro',                 /* provisório: o gerar-regioes.js corrige-o */
      m: x.a.cat === 2 ? 0 : (mares.get(x.a.id) || 0),
    };
    if (x.tambem.length) novo.a = x.tambem.join(' · ');   /* o mesmo separador */
    praias.push(novo);
  }

  praias.sort((p, q) => N(p.n).localeCompare(N(q.n)) || p.la - q.la);
  fs.writeFileSync(PRAIAS, '[\n' + praias.map((p) => JSON.stringify(p)).join(',\n') + '\n]\n');

  console.log('');
  if (acrescentar.length) {
    console.log(`${acrescentar.length} praias acrescentadas:`);
    for (const x of acrescentar) {
      console.log(`   ${x.nome}  (${x.a.co}, ${CAT[x.a.cat]}, m=${x.a.cat === 2 ? 0 : (mares.get(x.a.id) || 0)})`
        + (x.tambem.length ? `  [no mesmo ponto: ${x.tambem.join(', ')}]` : ''));
    }
  }
  if (novosAlias) console.log(`${novosAlias} nomes oficiais registados em ${porPraia.size} praias`);
  if (doces.length) console.log(`${doces.length} praias passaram a água doce (m=0)`);
  if (acrescentar.length) {
    console.log('');
    console.log('A SEGUIR, e por esta ordem:');
    console.log('   python3 _source/gerar-concelhos.py   (concelho das novas)');
    console.log('   node _source/gerar-regioes.js        (região, que sai do concelho)');
    console.log('   node _source/gerar-slugs.js');
  }
})().catch((e) => morrer('actualizar-balneares.js', e));
