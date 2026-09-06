/* Gera /praias/ e os sete hubs de região.
   =============================================================
   Correr:  node _source/gerar-praias.js
            node _source/gerar-praias.js --verificar

   Estas oito páginas não se escrevem à mão: são 995 praias distribuídas por
   181 concelhos. São geradas de ponta a ponta a partir de:

     data/praias.json            as praias, com região e mar/rio
     _build/dados/concelhos.json o concelho e o distrito (CAOP, DGT)
     _build/dados/slugs.json     o endereço futuro de cada praia
     _build/dados/nortada.json   as medições de vento, onde existem

   PORQUE É QUE UM HUB NÃO É SÓ UMA LISTA: uma página que só enumera nomes não
   acrescenta nada a ninguém — e é exactamente o tipo de página que o Google
   trata como conteúdo sem valor. Cada hub abre com os números daquela região:
   quantas praias, quantas de mar e de rio, quantos concelhos, e — onde houve
   medições — quantas tardes de Verão com nortada. Isso é conteúdo.

   AS LIGAÇÕES DAS PRAIAS apontam hoje para o fragmento da aplicação
   (/#Nome), que é o que existe e funciona. O Google ignora fragmentos, por
   isso para ele são ligações para a entrada; para quem lá vai, abre mesmo a
   praia. Quando as páginas /praia/<slug>/ existirem, muda-se aqui numa linha
   e as 995 ligações passam a apontar para elas. */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const S = require(path.join(RAIZ, '_build/lib/slug.js'));

const ler = (p) => JSON.parse(fs.readFileSync(path.join(RAIZ, p), 'utf8'));
const PRAIAS = ler('data/praias.json');
const CONCELHOS = ler('_build/dados/concelhos.json');
const SLUGS = ler('_build/dados/slugs.json');
const NORTADA = ler('_build/dados/nortada.json');

const esc = (s) => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const virgula = (n, c) => n.toFixed(c == null ? 0 : c).replace('.', ',');

/* Os nomes de região são os do data/praias.json — os mesmos que a aplicação
   mostra ao lado de cada praia na lista de sugestões. Não se inventam outros. */
const REGIOES = [
  { n: 'Norte', slug: 'norte' },
  { n: 'Centro', slug: 'centro' },
  { n: 'Lisboa e Setúbal', slug: 'lisboa-e-setubal' },
  { n: 'Alentejo', slug: 'alentejo' },
  { n: 'Algarve', slug: 'algarve' },
  { n: 'Açores', slug: 'acores' },
  { n: 'Madeira', slug: 'madeira' },
];

/* ------------------------------------------------------------------ dados */
function reunir() {
  const por = new Map(REGIOES.map(r => [r.n, { ...r, praias: [], concelhos: new Map() }]));
  for (const p of PRAIAS) {
    const id = S.id(p);
    const c = CONCELHOS[id];
    if (!c) throw new Error(`praia sem concelho: ${p.n} (${id})`);
    const r = por.get(p.r);
    if (!r) throw new Error(`região desconhecida no praias.json: «${p.r}»`);
    const entrada = { ...p, id, co: c.co, di: c.di, slug: (SLUGS[id] || {}).slug || null };
    r.praias.push(entrada);
    if (!r.concelhos.has(c.co)) r.concelhos.set(c.co, { nome: c.co, di: c.di, praias: [] });
    r.concelhos.get(c.co).praias.push(entrada);
  }
  for (const r of por.values()) {
    r.mar = r.praias.filter(p => p.m === 1).length;
    r.rio = r.praias.length - r.mar;
    /* PELA COORDENADA, que é a chave do próprio nortada.json — e não pelo
       nome, que não identifica uma praia: há 50 nomes repetidos em 116 dos
       995 registos. Casar por nome metia a «Praia da Areia Branca» da
       Lourinhã na conta do NORTE, e o hub publicava um facto falso que a
       própria /nortada/ desmentia: «6 praias desta região, a mais exposta é a
       Praia da Areia Branca com 31,0 %». São 5, e a mais exposta é
       Moledo/Afife com 19,4 % — os 31,0 % são medidos 200 km a sul, numa
       praia que o mesmo ficheiro marca como «Oeste e Lisboa». */
    const idsDaRegiao = new Set(r.praias.map(p => p.id));
    r.medidas = Object.entries(NORTADA.praias)
      .filter(([id]) => idsDaRegiao.has(id))
      /* A coordenada segue agarrada à medida, e não é decoração: é o que
         deixa a conferência lá em baixo perguntar «esta praia é mesmo desta
         região?» em vez de acreditar no filtro que a acabou de escolher. */
      .map(([id, m]) => ({ ...m, id }))
      .sort((a, b) => b.pct_nortada - a.pct_nortada);
  }
  return [...por.values()];
}

/* ------------------------------------------------------------------ HTML */
function pagina({ titulo, descricao, url, migalhas, corpo, ld }) {
  return `<!doctype html>
<html lang="pt-PT">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${esc(titulo)}</title>
  <meta name="description" content="${esc(descricao)}" />
  <meta name="theme-color" content="#0891b2" />
  <meta name="color-scheme" content="light dark" />

  <link rel="canonical" href="${url}" />

  <meta property="og:type" content="website" />
  <meta property="og:locale" content="pt_PT" />
  <meta property="og:site_name" content="Praiómetro" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(titulo.replace(' — Praiómetro', ''))}" />
  <meta property="og:description" content="${esc(descricao)}" />
  <meta property="og:image" content="https://praiometro.pt/assets/img/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Praiómetro — semáforo verde, amarelo e vermelho para saber se vale a pena ir à praia." />
  <!-- O twitter:card estava só na entrada, e sem ele o X e o LinkedIn caem
       para um cartão pequeno, com a imagem ao lado em vez da imagem inteira.
       As páginas de região existem justamente para serem partilhadas.
       (Sem plicas invertidas neste comentário: ele vive dentro de um template
       literal, e uma plica invertida fecha-o a meio.) -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="https://praiometro.pt/assets/img/og.png" />

  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/assets/css/estilo.css" />
  <link rel="stylesheet" href="/assets/css/texto.css" />

  <script type="application/ld+json">
${ld}
  </script>
</head>
<body>
  <main class="texto">
    <nav class="migalhas" aria-label="Onde estás">
      ${migalhas}
    </nav>
${corpo}

    <!-- A LIGAÇÃO PARA A PRIVACIDADE VIVE AQUI, no molde, e não em cada página.
         Dez das treze páginas do site não ligavam para ela — e eram justamente
         as que existem para receber tráfego directo do Google, ou seja aquelas
         em que alguém chega sem nunca ter passado pela entrada. Uma política de
         privacidade que só se alcança a partir da página inicial é uma política
         que metade das visitas nunca vê. -->
    <p class="texto__data"><a href="/privacidade.html">Privacidade</a></p>
  </main>
</body>
</html>
`;
}

function ld(url, nome, migalhas) {
  const itens = migalhas.map((m, i) => m.url
    ? `{"@type":"ListItem","position":${i + 1},"name":${JSON.stringify(m.nome)},"item":"${m.url}"}`
    : `{"@type":"ListItem","position":${i + 1},"name":${JSON.stringify(m.nome)}}`);
  return `  {"@context":"https://schema.org","@graph":[
   {"@type":"CollectionPage","@id":"${url}#pagina","url":"${url}",
    "name":${JSON.stringify(nome)},"inLanguage":"pt-PT",
    "isPartOf":{"@id":"https://praiometro.pt/#site"},
    "author":{"@id":"https://praiometro.pt/#autor"}},
   {"@type":"BreadcrumbList","@id":"${url}#migalhas","itemListElement":[
     ${itens.join(',\n     ')}
   ]}
  ]}`;
}

/* Uma praia na lista. Hoje aponta para o fragmento da aplicação; quando as
   páginas de praia existirem, é esta função que muda. */
/* Os nomes que não chegam para identificar uma praia. O app.js já tinha esta
   regra escrita no seu `endereco()`; o gerador é que não a usava, e por isso
   66 dos 995 links dos hubs abriam OUTRA praia — o `doEndereco()` cai para o
   primeiro registo com aquele nome, que é o primeiro por ordem de ficheiro.
   Quem carregava em «Praia da Areia Branca» na secção de Vila Nova de Gaia
   recebia a da Lourinhã. */
const REPETIDOS = (function () {
  const conta = new Map();
  for (const p of PRAIAS) conta.set(p.n, (conta.get(p.n) || 0) + 1);
  return new Set([...conta].filter(([, n]) => n > 1).map(([n]) => n));
})();

/* Guarda-se cada par (praia, endereço) para a verificação lá no fim poder
   resolvê-lo como o app.js resolve, em vez de comparar a saída com a função
   que a produziu — que é o que o `--verificar` faz e nunca podia apanhar isto. */
const LIGACOES = [];

function enderecoDe(p) {
  return encodeURIComponent(p.n) + (REPETIDOS.has(p.n) ? '@' + p.id : '');
}

function ligacao(p) {
  const rotulo = p.m === 1 ? '' : ' <span class="etiq">rio</span>';
  const h = enderecoDe(p);
  LIGACOES.push({ id: p.id, nome: p.n, href: h });
  return `<li><a href="/#${h}">${esc(p.n)}</a>${rotulo}</li>`;
}

function listaConcelhos(r) {
  const ordem = [...r.concelhos.values()].sort((a, b) =>
    b.praias.length - a.praias.length || a.nome.localeCompare(b.nome, 'pt'));
  return ordem.map(c => `      <section class="concelho">
        <h3 id="c-${S.slugificar(c.nome)}">${esc(c.nome)} <span class="concelho__n">${c.praias.length} ${c.praias.length === 1 ? 'praia' : 'praias'}</span></h3>
        <ul class="lista-praias">
${c.praias.sort((a, b) => a.n.localeCompare(b.n, 'pt')).map(p => '          ' + ligacao(p)).join('\n')}
        </ul>
      </section>`).join('\n');
}

/* ----------------------------------------------------------- hub de região */
function hubRegiao(r) {
  const url = `https://praiometro.pt/praias/${r.slug}/`;
  const migalhas = [
    { nome: 'Praiómetro', url: 'https://praiometro.pt/' },
    { nome: 'Praias', url: 'https://praiometro.pt/praias/' },
    { nome: r.n },
  ];
  const total = r.praias.length;
  const desc = `As ${total} praias ${r.n === 'Açores' || r.n === 'Madeira' ? 'da' : 'do'} `
    .replace('do Lisboa e Setúbal', 'de Lisboa e Setúbal')
    .replace('do Centro', 'do Centro');

  /* O que torna cada hub diferente de uma lista: os números da região. */
  const factos = [];
  factos.push(`<strong>${total} praias</strong> em ${r.concelhos.size} concelhos`);
  if (r.rio === 0) factos.push('todas de mar');
  else if (r.rio > r.mar) factos.push(`<strong>mais de rio (${r.rio}) do que de mar (${r.mar})</strong>`);
  else factos.push(`${r.mar} de mar e ${r.rio} de rio`);

  let clima = '';
  if (r.medidas.length) {
    const mais = r.medidas[0], menos = r.medidas[r.medidas.length - 1];
    clima = `      <div class="nota-lado">
        <p>Medimos dez Verões de vento hora a hora em ${r.medidas.length} ${r.medidas.length === 1 ? 'praia' : 'praias'} desta região.
        ${mais === menos
          ? `Na ${esc(mais.n)}, ${virgula(mais.pct_nortada, 1)} % das tardes de Julho e Agosto tiveram nortada.`
          : `A mais exposta é a ${esc(mais.n)}, com nortada em <strong>${virgula(mais.pct_nortada, 1)} %</strong>
             das tardes de Julho e Agosto; a mais abrigada é a ${esc(menos.n)}, com <strong>${virgula(menos.pct_nortada, 1)} %</strong>.`}
        <a href="/nortada/#abrigadas">A tabela completa e o que ela quer dizer</a>.</p>
      </div>`;
  }

  const corpo = `    <h1>Praias ${preposicao(r.n)}</h1>

    <p class="texto__lead">${factos.join(' · ')}. Carrega numa para veres se hoje vale a
    pena ir — vento, sol, calor e temperatura da água numa nota de 0 a 100.</p>

${clima}
    <h2 id="concelhos">Concelho a concelho</h2>

    <p>As praias estão agrupadas pelo concelho a que pertencem, do que tem mais
    para o que tem menos. O concelho vem da Carta Administrativa Oficial de Portugal,
    da Direcção-Geral do Território.</p>

${listaConcelhos(r)}

    <p class="texto__data">Lista de praias do
    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
    (ODbL) e das águas balneares identificadas pela <a href="https://apambiente.pt/agua/aguas-balneares" target="_blank" rel="noopener">Agência Portuguesa do Ambiente</a>.
    Concelhos da CAOP, Direcção-Geral do Território. As praias de rio estão
    marcadas: a nota delas <a href="/metodologia/#rio">não é directamente comparável</a>
    com a de uma praia de mar.</p>

    <p class="texto__voltar"><a href="/praias/">← Todas as regiões</a></p>`;

  return {
    caminho: `praias/${r.slug}/index.html`,
    url,
    html: pagina({
      titulo: `Praias ${preposicao(r.n)}: as ${total} do mapa — Praiómetro`,
      descricao: `As ${total} praias ${preposicao(r.n)} em ${r.concelhos.size} concelhos, `
        + `${r.rio > r.mar ? `${r.rio} delas de rio` : `${r.mar} de mar e ${r.rio} de rio`}. `
        + 'Vê numa nota de 0 a 100 se hoje vale a pena ir a cada uma.',
      url, migalhas: migalhaHTML(migalhas), corpo,
      ld: ld(url, `Praias ${preposicao(r.n)}`, migalhas),
    }),
  };
}

function preposicao(regiao) {
  if (regiao === 'Madeira') return 'da Madeira';
  if (regiao === 'Açores') return 'dos Açores';
  if (regiao === 'Lisboa e Setúbal') return 'de Lisboa e Setúbal';
  return 'do ' + regiao;
}

function migalhaHTML(ms) {
  return ms.map(m => m.url ? `<a href="${m.url.replace('https://praiometro.pt', '')}">${esc(m.nome)}</a>` : esc(m.nome))
    .join(' › ');
}

/* -------------------------------------------------------- índice nacional */
function indice(regioes) {
  const url = 'https://praiometro.pt/praias/';
  const migalhas = [{ nome: 'Praiómetro', url: 'https://praiometro.pt/' }, { nome: 'Praias' }];
  const total = PRAIAS.length;
  const mar = PRAIAS.filter(p => p.m === 1).length;
  const concelhos = new Set(Object.values(CONCELHOS).map(c => c.co)).size;

  const cartoes = regioes.map(r => `      <li>
        <a href="/praias/${r.slug}/">
          <strong>${esc(r.n)}</strong>
          <span>${r.praias.length} praias · ${r.concelhos.size} concelhos</span>
          <span class="regiao__mar">${r.rio === 0 ? 'todas de mar'
            : r.rio > r.mar ? `${r.rio} de rio, ${r.mar} de mar` : `${r.mar} de mar, ${r.rio} de rio`}</span>
        </a>
      </li>`).join('\n');

  const centro = regioes.find(r => r.n === 'Centro');
  const corpo = `    <h1>As praias de Portugal, região a região</h1>

    <p class="texto__lead">São <strong>${total} praias</strong> em ${concelhos} concelhos —
    ${mar} de mar e ${total - mar} de rio. Escolhe a região para ver a lista, ou
    <a href="/">procura a tua praia pelo nome</a>.</p>

    <ul class="regioes">
${cartoes}
    </ul>

    <h2 id="rio">Portugal tem mais praias de rio do que se pensa</h2>

    <p>Das ${total} praias desta lista, <strong>${total - mar} são de rio</strong> — quase
    um quarto. E há uma região onde são a maioria: no
    <a href="/praias/centro/">Centro</a> há ${centro.rio} praias de rio contra
    ${centro.mar} de mar.</p>

    <p>As praias de rio são pontuadas de outra maneira, porque não há dados de mar nenhuns
    para elas: nem temperatura da água, nem ondulação. A nota passa a ser calculada sobre
    86 pontos em vez de 100, e por isso <strong>não é directamente comparável</strong> com
    a de uma praia de mar no mesmo dia. Está explicado em
    <a href="/metodologia/#rio">como se calcula a nota de uma praia de rio</a>.</p>

    <h2 id="nortada">A nortada não trata as regiões por igual</h2>

    <p>Medimos dez Verões de vento hora a hora em 31 praias, e a diferença entre a costa
    oeste e o Algarve nascente é enorme: no Guincho e no Amado houve nortada em mais de
    quatro em cada dez tardes de Julho e Agosto, e nas praias da ria Formosa não houve
    <strong>uma única</strong> em dez anos.
    <a href="/nortada/">A medição completa, e a que horas o vento acalma</a>.</p>

    <p class="texto__data">Lista de praias do
    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
    (ODbL). Concelhos e distritos da Carta Administrativa Oficial de Portugal, da
    Direcção-Geral do Território.</p>

    <p class="texto__voltar"><a href="/">← Ver se hoje vale a pena ir à praia</a></p>`;

  return {
    caminho: 'praias/index.html',
    url,
    html: pagina({
      titulo: `As ${total} praias de Portugal, região a região — Praiómetro`,
      descricao: `${total} praias portuguesas em ${concelhos} concelhos, ${mar} de mar e `
        + `${total - mar} de rio, agrupadas por região e concelho. Vê numa nota de 0 a 100 `
        + 'se hoje vale a pena ir.',
      url, migalhas: migalhaHTML(migalhas), corpo,
      ld: ld(url, 'As praias de Portugal', migalhas),
    }),
  };
}

/* ---------------------------------------------------------------- escrever */
const regioes = reunir();
const paginas = [indice(regioes), ...regioes.map(hubRegiao)];

/* CADA LIGAÇÃO TEM DE ABRIR A PRAIA QUE DIZ. Isto corre sempre, e não só no
   `--verificar`, porque não é uma comparação de ficheiros: é resolver cada
   endereço com a MESMA regra do app.js (`doEndereco`) e confirmar que chega à
   praia de onde saiu. A comparação de ficheiros não podia apanhar 66 links
   errados, porque a saída batia certo com a função que a escreveu — estava
   errada, mas era consistente consigo própria. */
(function conferirLigacoes() {
  const resolver = (h) => {
    const k = h.lastIndexOf('@');
    const nome = decodeURIComponent(k > 0 ? h.slice(0, k) : h);
    const coord = k > 0 ? h.slice(k + 1) : '';
    return PRAIAS.find(x => x.n === nome && (!coord || S.id(x) === coord))
        || PRAIAS.find(x => x.n === nome) || null;
  };
  const maus = LIGACOES.filter(l => {
    const achou = resolver(l.href);
    return !achou || S.id(achou) !== l.id;
  });
  if (maus.length) {
    console.error(`✗ ${maus.length} de ${LIGACOES.length} ligações abrem outra praia:`);
    for (const m of maus.slice(0, 5)) {
      const foi = resolver(m.href);
      console.error(`   «${m.nome}» (${m.id}) -> /#${m.href} abre ${foi ? S.id(foi) : 'NADA'}`);
    }
    process.exit(1);
  }
  const comCoord = LIGACOES.filter(l => l.href.includes('@')).length;
  console.log(`✓ ${LIGACOES.length} ligações resolvem para a praia certa `
    + `(${comCoord} precisam da coordenada)`);
})();

/* E A NORTADA QUE CADA HUB CITA É DA SUA REGIÃO. O hub escreve uma frase com
   número e nome — «a mais exposta é X, com N %» — e essa frase é lida como
   facto. Era falsa no Norte: citava uma praia da Lourinhã com 31,0 %, número
   medido 200 km a sul, enquanto a /nortada/ do mesmo site a listava como
   «Oeste e Lisboa». Compara-se contra a REGIÃO DA PRAIA nos dados, que é uma
   fonte independente do filtro que montou a lista. */
(function conferirNortada() {
  const daPraia = new Map(PRAIAS.map(p => [S.id(p), p.r]));
  const maus = [];
  for (const r of regioes) {
    for (const m of r.medidas) {
      if (daPraia.get(m.id) !== r.n) {
        maus.push(`${r.n}: cita «${m.n}» (${m.pct_nortada} %), que é de ${daPraia.get(m.id) || '?'}`);
      }
    }
  }
  if (maus.length) {
    console.error(`✗ ${maus.length} medidas de nortada atribuídas à região errada:`);
    for (const m of maus.slice(0, 5)) console.error('   ' + m);
    process.exit(1);
  }
  const total = regioes.reduce((s, r) => s + r.medidas.length, 0);
  console.log(`✓ as ${total} medidas de nortada citadas são das regiões que as citam`);
})();

let diferentes = 0;
for (const p of paginas) {
  const abs = path.join(RAIZ, p.caminho);
  const antigo = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (antigo !== p.html) diferentes++;
  if (!process.argv.includes('--verificar')) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, p.html);
  }
}

if (process.argv.includes('--verificar')) {
  if (diferentes) {
    console.error(`✗ ${diferentes} das ${paginas.length} páginas de /praias/ estão diferentes dos dados.`);
    console.error('  Correr: node _source/gerar-praias.js');
    process.exit(1);
  }
  console.log(`✓ as ${paginas.length} páginas de /praias/ batem certo com os dados`);
  process.exit(0);
}
console.log(`${paginas.length} páginas escritas (${diferentes} mudaram):`);
for (const p of paginas) console.log('   /' + p.caminho.replace('/index.html', '/'));
