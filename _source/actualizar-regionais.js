/* AS ZONAS BALNEARES QUE SÓ AS REGIÕES AUTÓNOMAS DESIGNAM.
   =============================================================
   Correr:  node _source/actualizar-regionais.js --verificar   (só compara)
            node _source/actualizar-regionais.js               (aplica)

   PORQUÊ ISTO EXISTE, e é a terceira vez que aprendo a mesma lição.

   Primeiro verifiquei a lista de praias contra o OpenStreetMap, de onde ela
   tinha saído — e isso não é verificar, é perguntar à cópia se concorda com o
   original. Escondeu 131 águas balneares oficiais.

   Depois passei a usar a lista da APA como oráculo de QUE praias existem, e
   fiquei convencido de que estava resolvido. Não estava, e a pergunta que o
   revelou foi simples: «as ilhas da Madeira e dos Açores também aparecem?»

   Aparecem. Mas nos AÇORES e na MADEIRA quem designa zonas balneares são os
   governos regionais, e a lista da APA é um subconjunto do que eles publicam.
   Medido a 8/9/2026:

     · SÃO JORGE tinha CINCO cartões. É uma ilha de 246 km² cujas fajãs têm
       quase todas portinho ou poça com zona de banho — o Edital da Capitania
       do Porto da Horta lista lá VINTE.
     · o OpenStreetMap tem ZERO objectos de banho nomeados em SANTA MARIA.
       Não é a consulta que está partida: confirmei com uma caixa geográfica
       directa. A fonte é que está vazia.

   Um oráculo melhor do que o anterior continua a não ser o território.

   O QUE ESTÁ NO FICHEIRO AO LADO. Trinta e cinco zonas balneares, cada uma
   lida num documento oficial que está escrito no campo `doc`: o POCMAD
   (Resolução do Conselho do Governo Regional da Madeira n.º 48/2024), o Edital
   n.º 340/2018 da Capitania do Porto da Horta, o Portal do Turismo dos Açores
   e a Câmara Municipal do Porto Moniz.

   O QUE NÃO ESTÁ, e é de propósito: sete candidatos que não se conseguiram
   confirmar em documento nenhum. Ficam de fora até alguém os ler. Um sítio de
   banho que só existe porque um programa disse que existia não entra num mapa.

   PORQUE É CURADORIA E NÃO UM ALIMENTADOR. As Portarias regionais saem em PDF,
   o Portal do Turismo dos Açores está atrás de um desafio da Cloudflare, e o
   Anexo II do Edital é uma lista a duas colunas onde as ilhas do Pico e de São
   Jorge se confundem à vista desarmada. Um raspador calava-se no dia em que o
   PDF mudasse de formato, e ninguém dava por isso. Assim, quando a lista
   mudar, alguém tem de a ler — e o git regista quem leu e quando. */
'use strict';
const fs = require('fs');
const path = require('path');
const { morrer } = require('./rede.js');

const RAIZ = path.dirname(__dirname);
const PRAIAS = path.join(RAIZ, 'data', 'praias.json');
const FONTE = path.join(RAIZ, '_source', 'zonas-balneares-regionais.json');
const DA_APA = path.join(RAIZ, '_source', 'praias-da-apa.json');

/* A MESMA MEDIDA DO actualizar-balneares.js, e pela mesma razão: nas 605 águas
   balneares que casam com um cartão pelo nome, a distância entre os dois
   pontos tem percentil 90 de 572 m. Acima de 600 m é outro sítio. */
const KM_MESMA = 0.6;

const km = (a, b) => Math.hypot(
  (a[0] - b[0]) * 111.32,
  (a[1] - b[1]) * 111.32 * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180));

/* A `normalizar()` lê-se do app.js, nunca se copia — ver o comentário gémeo
   no actualizar-praias.js, que conta o que custou copiá-la uma vez. */
const normalizar = (function () {
  const src = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'app.js'), 'utf8');
  const m = src.match(/function normalizar\(s\) \{[\s\S]*?\n {2}\}/);
  if (!m) { console.error('✗ não encontrei a normalizar() em app.js — mudou de forma?'); process.exit(1); }
  return new Function(m[0] + '; return normalizar;')();
})();
const N = (s) => normalizar(s || '').replace(/\s+/g, ' ').trim();

/* ---------------------------------------------------------------- mar? --- */
/* TODAS ESTAS SÃO DE MAR, e não se pergunta à API marinha por isso. São poças,
   portinhos, calhaus e piscinas naturais nas costas dos dois arquipélagos —
   água salgada, toda ela. Perguntar seria gastar quota para confirmar uma
   coisa que o documento já diz, e a API marinha responde mal junto a falésias
   (encaixa na célula de oceano aberto mais próxima). O `m` fica a 1.
   Se um dia entrar aqui uma lagoa ou uma ribeira, isto tem de mudar — e por
   isso a verificação abaixo recusa qualquer entrada que não seja costeira. */
/* A comparação faz-se SEM ACENTOS, com a mesma `normalizar()` do site. Escrevi
   isto primeiro com «poca» na expressão e a guarda chumbou três poças a sério
   — «poça de mar» tem cedilha. Uma guarda que rejeita o que devia aceitar é
   tão inútil como uma que aceita tudo, e esta apanhou-se a si própria. */
const TIPOS_DE_MAR = /praia|poca|piscina|portinho|porto|cais|zona balnear|zona de banhos|complexo|baia|calhau|areal|faja|clube|solario|enseada/;
const eDeMar = (s) => TIPOS_DE_MAR.test(N(s));

/* ---------------------------------------------------------------- main --- */
(async function () {
  const verificar = process.argv.includes('--verificar');
  const fonte = JSON.parse(fs.readFileSync(FONTE, 'utf8'));
  const zonas = fonte.zonas || [];
  const praias = JSON.parse(fs.readFileSync(PRAIAS, 'utf8'));

  /* Uma entrada sem documento não entra. É a única regra deste ficheiro que
     não admite excepção: foi a falta dela que quase me pôs uma praia em
     Espanha e outra a 3,7 km do sítio. */
  const semDoc = zonas.filter((z) => !z.doc || z.doc.length < 20);
  if (semDoc.length) {
    console.error(`✗ ${semDoc.length} zona(s) sem documento no campo \`doc\`:`);
    for (const z of semDoc) console.error('   ' + z.n);
    process.exit(1);
  }
  const semTipo = zonas.filter((z) => !eDeMar(z.tipo || '') && !eDeMar(z.n));
  if (semTipo.length) {
    console.error(`✗ ${semTipo.length} zona(s) cujo tipo não é reconhecidamente costeiro —`);
    console.error('  este ficheiro assume `m=1` para tudo o que traz. Ver o comentário.');
    for (const z of semTipo) console.error(`   ${z.n} (${z.tipo})`);
    process.exit(1);
  }

  console.log(`fonte curada: ${zonas.length} zonas balneares regionais · site: ${praias.length} praias`);

  const novas = [], jaEsta = [];
  for (const z of zonas) {
    const perto = praias
      .map((p) => ({ p, d: km([z.la, z.lo], [p.la, p.lo]) }))
      .sort((a, b) => a.d - b.d)[0];
    if (perto && perto.d < KM_MESMA) { jaEsta.push({ z, p: perto.p, d: perto.d }); continue; }
    /* E entre as próprias: duas entradas no mesmo ponto seriam dois cartões
       com a mesma previsão. */
    const gemea = novas.find((x) => km([z.la, z.lo], [x.la, x.lo]) < KM_MESMA);
    if (gemea) { jaEsta.push({ z, p: gemea, d: km([z.la, z.lo], [gemea.la, gemea.lo]) }); continue; }
    novas.push(z);
  }

  console.log(`  já no site (a menos de ${KM_MESMA * 1000} m): ${jaEsta.length}`);
  console.log(`  a acrescentar                     : ${novas.length}`);
  for (const z of novas) console.log(`     ${z.n}  (${z.co}, ${z.ilha}, ${z.tipo})`);

  if (verificar) {
    if (novas.length) {
      console.error('');
      console.error(`✗ ${novas.length} zonas balneares regionais por acrescentar.`);
      console.error('  Correr: node _source/actualizar-regionais.js');
      process.exit(1);
    }
    console.log(`✓ as ${zonas.length} zonas balneares regionais estão todas no site`);
    process.exit(0);
  }

  if (!novas.length) { console.log('nada a fazer'); process.exit(0); }

  for (const z of novas) {
    praias.push({ n: z.n, la: z.la, lo: z.lo, r: 'Açores', m: 1 });
  }
  praias.sort((p, q) => N(p.n).localeCompare(N(q.n)) || p.la - q.la);
  fs.writeFileSync(PRAIAS, '[\n' + praias.map((p) => JSON.stringify(p)).join(',\n') + '\n]\n');

  /* E FICAM REGISTADAS COMO NÃO SENDO DO OSM, pela mesma razão que as da APA:
     senão a comparação diária com o OpenStreetMap acusa-as todas as noites de
     terem desaparecido dele, e um aviso que aparece sempre deixa de se ler. */
  const daApa = fs.existsSync(DA_APA)
    ? (JSON.parse(fs.readFileSync(DA_APA, 'utf8')).pontos || []) : [];
  for (const z of novas) daApa.push([z.la, z.lo]);
  const vistos = new Set();
  const unicos = daApa.filter((q) => {
    const k = q[0].toFixed(5) + ',' + q[1].toFixed(5);
    if (vistos.has(k)) return false;
    vistos.add(k); return true;
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cabecalho = fs.existsSync(DA_APA)
    ? JSON.parse(fs.readFileSync(DA_APA, 'utf8')).porque : '';
  fs.writeFileSync(DA_APA, '{\n "porque": ' + JSON.stringify(cabecalho) + ',\n "pontos": [\n'
    + unicos.map((q) => '  ' + JSON.stringify(q)).join(',\n') + '\n ]\n}\n');

  console.log('');
  console.log(`${novas.length} zonas balneares regionais acrescentadas`);
  console.log('');
  console.log('A SEGUIR, e por esta ordem:');
  console.log('   python3 _source/gerar-concelhos.py   (concelho das novas)');
  console.log('   node _source/gerar-regioes.js        (região, que sai do concelho)');
  console.log('   node _source/gerar-slugs.js --escrever');
})().catch((e) => morrer('actualizar-regionais.js', e));
