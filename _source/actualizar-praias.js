/* A LISTA DE PRAIAS CONTRA O OPENSTREETMAP DE HOJE.
   =============================================================
   Correr:  node _source/actualizar-praias.js --verificar   (só compara)
            node _source/actualizar-praias.js --recolher    (vai ao Overpass)
            node _source/actualizar-praias.js               (aplica o que der)

   PORQUÊ ISTO EXISTE. A lista saiu de UMA consulta ao Overpass, guardada em
   `_source/osm-praias.json`, e depois ninguém lhe voltou a tocar. Vinte e três
   dias depois já tinha derivado: quatro praias mudaram de nome no OSM e o site
   continuava a mostrar os antigos («Praia de Machico» passara a «Praia da
   Banda d'Além», «Praia de Troia (Galé)» a «Praia Tróia-Galé»), e havia uma
   praia nova que não estava cá. Nada no projecto dava por isso — a cópia é um
   ficheiro sem data de validade, e um ficheiro assim envelhece em silêncio.

   O QUE SE DECIDE SOZINHO E O QUE NÃO SE DECIDE:

   · RENOMEAR decide-se: mesma coordenada, nome diferente. O OSM é a fonte, e
     se lá mudou, aqui muda. Aplica-se e escreve-se o que mudou.

   · ACRESCENTAR decide-se quase todo. O concelho vem da CAOP (correr a seguir
     o gerar-concelhos.py) e a região vem do concelho (gerar-regioes.js). Falta
     o `m` — mar ou rio —, e esse não se adivinha pelo nome: 35 das 995 não
     seguem o nome («Azenhas do Guadiana» é rio, «Praia da Lagoa» é mar).
     Pergunta-se à API MARINHA da Open-Meteo: se ela devolve ondulação naquele
     ponto, é mar; se devolve nulos, é interior. Testado contra 24 praias que
     já cá estavam, 12 de cada: acertou nas 24.

   · APAGAR não se decide aqui. Uma praia que desaparece do OSM pode ter sido
     apagada por engano, ou renomeada de tal maneira que este programa não a
     reconheceu. Tirá-la do site sozinho é deixar uma edição de terceiros
     apagar conteúdo sem ninguém ver. Reporta-se, e decide-se à mão. */
'use strict';
const fs = require('fs');
const path = require('path');
const { morrer } = require('./rede.js');

const RAIZ = path.dirname(__dirname);
const PRAIAS = path.join(RAIZ, 'data', 'praias.json');
const OSM = path.join(RAIZ, '_source', 'osm-praias.json');
const CONSULTA = path.join(RAIZ, '_source', 'overpass.txt');
const BALNEARES = path.join(RAIZ, '_source', 'aguas-balneares.json');
const DA_APA = path.join(RAIZ, '_source', 'praias-da-apa.json');

/* AS ÁGUAS FECHADAS DA COSTA, uma a uma e com a razão à frente.
   =============================================================
   O `m` significa «a grelha marinha da Open-Meteo descreve esta água», e não
   «tem água salgada». Uma ria, uma lagoa costeira ou uma barrinha é água do
   mar — e a grelha marinha descreve-a MAL, porque não tem célula lá dentro:
   encaixa no oceano aberto mais próximo e responde com números de lá.

   Medido no arquivo de Junho a Setembro de 2025, janela das 9h às 19h:

     Praia da Foz do Arelho-Lagoa   19 dos 122 dias com veto de «mar muito
                                    cavado», 15,6 %, ondas até 4,88 m
     Carcavelos (mar aberto)         4 dos 122 dias, 3,3 %, ondas até 4,52 m

   A lagoa leva quase cinco vezes mais vetos de mar cavado do que uma praia
   oceânica — por ondulação que ela não tem. E a Armona-Ria recebe EXACTAMENTE
   os mesmos números que a Armona-Mar, a 1,3 km: a mesma célula serve as duas,
   uma dentro da ria e outra virada ao Atlântico.

   No outro sentido é igualmente errado: a temperatura do oceano servida a uma
   lagoa fechada tira-lhe pontos de água que ela tem de sobra no Verão.

   Marcadas `m=0`, ficam sem factor de água — o modelo reparte esses pontos
   pelos outros, como já faz nas praias de rio. É menos errado do que descrever
   água parada com a ondulação do Atlântico.

   ISTO É CURADORIA, e é assim de propósito: o nome não chega (a «Praia da
   Lagoa» é no concelho de Lagoa e é mar aberto, a «Praia de Lagoa I» é na
   costa de Vila do Conde), e a API marinha também não — ela responde em toda a
   costa, portanto nunca diz «esta água não é minha». Verificadas as seis
   candidatas por nome que NÃO entram: todas apanham célula a menos de 3 km. */
const AGUA_FECHADA = {
  /* Ria Formosa: as quatro «-Ria» estão do lado de dentro das ilhas-barreira,
     e três delas têm a irmã «-Mar» no ficheiro, a menos de 1,5 km. */
  '37.0234,-7.8047': 'Armona: lado da ria, com a Armona-Mar a 1,3 km',
  '37.0500,-7.7443': 'Fuseta: lado da ria, com a Fuseta-Mar a 0,6 km',
  '36.9811,-7.8615': 'Farol: lado da ria, com a Praia do Farol a 0,5 km',
  '37.1151,-7.6234': 'Tavira: lado da ria',
  /* Lagoas costeiras fechadas por cordão de areia. */
  '39.4290,-9.2245': 'Lagoa de Óbidos, com a Foz do Arelho de mar a 0,6 km',
  '38.5048,-9.1793': 'Lagoa de Albufeira, fechada por cordão dunar',
  '40.9661,-8.6521': 'Barrinha de Esmoriz',
  /* Estuário. O Minho em Vila Nova de Cerveira está a 10 km da foz, e a grelha
     marinha responde-lhe com o Atlântico — a única praia com «fluvial» no nome
     que ficou marcada como mar. */
  '41.9566,-8.7461': 'Praia Fluvial da Lenta: estuário do Minho, a 10 km da foz',
};

const KM_IGUAL = 3.0;          /* o mesmo nome a menos disto é a mesma praia */
const M_MESMO_SITIO = 60;      /* coordenadas a menos disto são o mesmo ponto */
const KM_MESMA_PRAIA = 2.5;    /* o mesmo núcleo de nome a menos disto é a mesma praia */

/* O CAMPO `b` É A `normalizar()` DO app.js, e vai-se lá buscá-la em vez de a
   copiar. Copiei-a e divergiu à primeira praia: a do site troca TUDO o que não
   é letra ou dígito por espaço, e a minha guardava hífenes e apóstrofos —
   «Praia Tróia-Galé» ficou com `b` a dizer «praia troia-gale», que a procura
   nunca encontraria. O testar-slugs.js existe justamente para apanhar esta
   divergência, e apanhou-a. Uma função copiada é uma função que vai divergir;
   esta é lida do ficheiro que manda. */
const normalizar = (function () {
  const src = fs.readFileSync(path.join(RAIZ, 'assets', 'js', 'app.js'), 'utf8');
  const m = src.match(/function normalizar\(s\) \{[\s\S]*?\n {2}\}/);
  if (!m) { console.error('✗ não encontrei a normalizar() em app.js — mudou de forma?'); process.exit(1); }
  return new Function(m[0] + '; return normalizar;')();
})();

/* Para COMPARAR nomes (não para o campo `b`): o que interessa é reconhecer a
   mesma praia escrita de outra maneira, e aí os espaços a mais atrapalham. */
const semAcentos = (s) => normalizar(s || '').replace(/\s+/g, ' ').trim();

/* O NÚCLEO DO NOME — o que sobra depois de tirar o que não distingue nada.
   O OSM tem a mesma praia mais do que uma vez, e com nomes diferentes: o
   Furadouro está lá como way «Furadouro» e como duas relations «Praia do
   Furadouro - Norte» e «- Sul», a 520 m, 1,1 km e 1,6 km do ponto que o site
   usa. Sem isto, cada uma dessas aparecia como praia NOVA — três entradas para
   uma praia, e a mesma areia com três notas no ecrã. */
const nucleo = (s) => semAcentos(s)
  .replace(/^(praia|parque|zona)\s+(fluvial\s+)?(de|da|do|das|dos)?\s*/, '')
  /* O sufixo do lado corta-se DEPOIS de normalizar, e por isso não se procura o
     hífen: a normalizar() do app.js troca tudo o que não é letra ou dígito por
     espaço, portanto «Praia do Furadouro - Norte» chega aqui já sem o traço.
     Procurar «- norte» era procurar uma coisa que já não existe, e as duas
     metades do Furadouro voltavam a aparecer como praias novas.

     O RISCO, dito: isto engole um «X Norte» que seja mesmo uma praia à parte,
     se houver um «X» a menos de 2,5 km. Aceita-se — três cartões para a mesma
     areia é pior do que um cartão a menos, e o relatório do --verificar mostra
     sempre o que foi engolido. */
  .replace(/\s+(norte|sul|nascente|poente|este|oeste|centro|\d+)$/, '')
  .trim();
const coord = (e) => (e.center ? [e.center.lat, e.center.lon] : [e.lat, e.lon]);
const metros = (a, b) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 88000);

/* ------------------------------------------------------------ recolher --- */
/* Os servidores do Overpass. O de.de é o principal; o kumi é espelho. Nenhum
   deles é de confiança sozinho: numa tarde apanhei 400, 406, 502 e 504, e uma
   consulta que esgota o tempo devolve HTTP 200 com uma lista vazia. */
const ESPELHOS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function umaConsulta(q, n) {
  let ultimo = null;
  for (let volta = 0; volta < 4; volta++) {
    const url = ESPELHOS[volta % ESPELHOS.length];
    try {
      return await pedir(url, q, n);
    } catch (e) {
      ultimo = e;
      const transitorio = /respost(a|as) (429|50[0-4])|fetch failed|aviso|zero elementos/.test(e.message);
      if (!transitorio) throw e;
      const espera = 15 * (volta + 1);
      console.log(`   consulta ${n}: ${e.message.slice(0, 70)} — outra vez em ${espera}s`);
      await new Promise((r) => setTimeout(r, espera * 1000));
    }
  }
  throw ultimo;
}

async function pedir(url, q, n) {
  /* O `User-Agent` não é cortesia, é requisito: sem ele o Overpass responde
     406 ao agente por omissão do Node. E o corpo vai como formulário, com o
     Content-Type explícito — é o que a API espera. */
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'praiometro.pt (actualizar-praias.js; renato.l.valente+praiometro@gmail.com)',
    },
    /* SEM OS COMENTÁRIOS. O ficheiro está cheio deles — é onde vive a razão de
       cada ramo — mas nem todos os espelhos os digerem, e são bytes a viajar
       para nada. Tira-se aqui e o ficheiro fica legível para quem o lê. */
    body: 'data=' + encodeURIComponent(
      q.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').trim()),
  });
  if (!r.ok) throw new Error(`a consulta ${n} teve resposta ${r.status}`);
  const d = await r.json();
  /* O `remark` É UM ERRO, e vem com HTTP 200 e uma lista vazia. Uma consulta
     que esgota o tempo devolve exactamente isto, e quem só olhe para a
     contagem lê «zero elementos» e conclui que não há nada em Portugal. */
  if (d.remark) throw new Error(`a consulta ${n} devolveu um aviso: ${d.remark.slice(0, 120)}`);
  if (!d.elements || !d.elements.length) throw new Error(`a consulta ${n} devolveu zero elementos`);
  console.log(`   consulta ${n}: ${d.elements.length} elementos`);
  return d;
}

async function recolher() {
  /* O ficheiro traz DUAS consultas, separadas por uma linha de ---: a segunda
     procura por nome em todo o país e esgota o tempo se for junta com a
     primeira. Juntam-se aqui os resultados, sem repetir elementos. */
  const partes = fs.readFileSync(CONSULTA, 'utf8').split(/^---$/m)
    .map((x) => x.trim()).filter(Boolean);
  const vistos = new Set(), elements = [];
  let base = null;
  for (let i = 0; i < partes.length; i++) {
    if (i) await new Promise((r) => setTimeout(r, 8000));   /* educação com o servidor */
    const d = await umaConsulta(partes[i], i + 1);
    base = base || (d.osm3s || {}).timestamp_osm_base;
    for (const e of d.elements) {
      const k = e.type + e.id;
      if (vistos.has(k)) continue;
      vistos.add(k);
      elements.push(e);
    }
  }
  const d = { osm3s: { timestamp_osm_base: base }, elements };
  fs.writeFileSync(OSM, JSON.stringify(d));
  console.log(`_source/osm-praias.json — ${elements.length} elementos únicos, base ${base}`);
  return d;
}

/* ---------------------------------------------------------------- lixo --- */
/* O QUE NÃO É SÍTIO DE BANHO SAI POR ETIQUETA, NUNCA POR NOME.
   A consulta por nome traz paragens de autocarro chamadas «Praia Fluvial de
   X», painéis informativos, parques de merendas e cafés. Filtrar por nome
   parece mais simples e é pior: deixa passar piscinas municipais chamadas
   «Piscina Natural» e classifica uma poça geotérmica dos Açores como praia de
   mar, a receber ondulação do Atlântico a 362 m de altitude.

   O que FICA: areal e calhau (`natural=beach|shingle`), zonas de banho
   designadas (`leisure=swimming_area|beach_resort|bathing_place`), banhos
   públicos (`amenity=public_bath`, que é como as piscinas naturais dos Açores
   e da Madeira estão mapeadas) e massas de água nomeadas. */
const MANTER_NATURAL = new Set(['beach', 'shingle', 'water']);
const MANTER_LEISURE = new Set(['swimming_area', 'beach_resort', 'bathing_place', 'river_beach']);
const FORA_BATH = new Set(['pool', 'thermal', 'hot_spring', 'onsen']);
/* E ESTAS PROVAM O CONTRÁRIO: `bath:type=river` num `amenity=public_bath` diz
   que ali há um rio em que se entra, que é exactamente o que se procura. Não
   estar aqui custou 22 praias fluviais oficiais — a de Côja, a de Folques, a
   de Foz d'Égua —, todas descartadas por «banho público sem água
   corroborada» quando a etiqueta ao lado dizia que a água era um rio. */
const BATH_AGUA = new Set(['river', 'lake', 'natural', 'open_air', 'sea', 'lido']);
const FORA_LEISURE = new Set(['water_park', 'swimming_pool', 'park', 'pitch', 'playground',
  'sports_centre', 'fitness_centre', 'garden', 'marina', 'slipway', 'picnic_table']);
const FORA_TOURISM = new Set(['camp_site', 'caravan_site', 'information', 'picnic_site',
  'hotel', 'guest_house', 'apartment', 'viewpoint', 'artwork', 'museum']);
const FORA_AMENITY = new Set(['cafe', 'restaurant', 'bar', 'parking', 'toilets', 'fuel',
  'pub', 'shelter', 'bench', 'drinking_water', 'waste_basket', 'fast_food', 'ice_cream']);

/* O QUE NEM UMA PROVA OFICIAL SALVA. Um café, um parque de estacionamento ou
   uns sanitários ao lado de uma praia partilham-lhe o nome com frequência, e
   estar a 40 m de uma água balnear oficial não os torna num sítio de banho. */
const NUNCA = new Set(['parking', 'toilets', 'cafe', 'restaurant', 'bar', 'fuel',
  'pub', 'fast_food', 'ice_cream', 'waste_basket', 'bench', 'drinking_water', 'shelter']);

/* E UMA PLACA NÃO É UMA PRAIA, por mais oficial que seja o nome escrito nela.
   Foi assim que a prova oficial se virou contra mim à primeira corrida: seis
   postes `tourism=information` em Vila Nova de Gaia, com os dizeres «Zona
   Balnear de Valadares Norte, Praia de Valadares Norte», passaram a ser seis
   praias novas a 90-170 m de praias que o site já tinha. E um marco de um
   trilho pedestre — «Ecovia do rabaçal: Da Praia Fluvial a Lilela» — entrou
   como praia fluvial. O nome numa placa é o nome do sítio para onde ela
   aponta, e não o do sítio onde ela está espetada. */
const NEM_COM_PROVA = (t) => t.tourism === 'information' || t.information
  || t.route || t.highway || t.railway || t.aeroway || t.public_transport;

/* Devolve a RAZAO por que se descarta, ou null para ficar.
   O `oficial` diz que este objecto foi reconhecido como uma agua balnear da
   lista da APA — ver o casarComOficiais() mais abaixo. */
function lixo(t, oficial) {
  if (t.amenity && NUNCA.has(t.amenity)) return 'amenity=' + t.amenity;
  if (t.shop || t.office) return 'comercio';
  if (NEM_COM_PROVA(t)) return 'placa, via ou percurso';
  /* A PROVA OFICIAL VEM ANTES DE TODAS AS HEURISTICAS, e a razao e simples: as
     heuristicas abaixo sao minhas e a designacao e da APA. Quando discordam,
     quem manda e quem designa.

     Medido: 44 das 100 aguas balneares oficiais que faltavam ao site ESTAVAM
     no OpenStreetMap, com o nome por extenso, e foram descartadas por este
     filtro — 22 por «banho publico sem agua corroborada», 5 por
     `leisure=swimming_pool` (e chamavam-se «Praia Fluvial de Almaceda»), 4 por
     `leisure=park`, 2 por `tourism=picnic_site`, 2 por `fee=yes` (as Piscinas
     Naturais do Porto Moniz, que tem bandeira azul), 1 por `highway`.

     O `ref:EU:bwid` e a mesma prova posta pelo proprio OSM: e o identificador
     europeu da agua balnear, igual ao `codigo_agua_balnear` da APA. */
  if (t['ref:EU:bwid']) return null;
  if (oficial) return null;
  /* O AREAL MANDA, e vem PRIMEIRO. Cinco praias fluviais estão mapeadas como
     `leisure=park` E `natural=beach` ao mesmo tempo — o parque de merendas e o
     areal são o mesmo polígono. Com as exclusões a correr primeiro, o
     `leisure=park` ganhava e o areal era descartado: cinco praias que já
     estavam no site desapareciam dele. Uma praia continua a ser uma praia
     ainda que também seja outra coisa. */
  if (t.natural && MANTER_NATURAL.has(t.natural)) return null;
  if (t.public_transport || t.highway || t.railway || t.aeroway) return 'transporte ou via';
  if (t.man_made) return 'construcao (' + t.man_made + ')';
  if (['spring', 'hot_spring', 'geyser'].includes(t.natural)) return 'nascente ou termal';
  if (t['bath:type'] && FORA_BATH.has(t['bath:type'])) return 'termas ou piscina (' + t['bath:type'] + ')';
  if (t.leisure && FORA_LEISURE.has(t.leisure)) return 'lazer=' + t.leisure;
  if (t.tourism && FORA_TOURISM.has(t.tourism)) return 'turismo=' + t.tourism;
  if (t.amenity && FORA_AMENITY.has(t.amenity)) return 'amenity=' + t.amenity;
  /* UM EDIFÍCIO NÃO É UMA PRAIA. Apanha as termas: o «Balneário das Termas de
     Caldelas» está mapeado como `amenity=public_bath` + `building=yes` com dois
     pisos. E um `barrier` é um recinto murado. */
  if (t.building) return 'edificio';
  if (t.barrier) return 'recinto murado (' + t.barrier + ')';
  /* PAGA-SE À ENTRADA: é um equipamento, não uma água balnear. */
  if (t.fee === 'yes') return 'entrada paga';
  /* `amenity=public_bath` NU, sem nada que corrobore que ali há água em que se
     entra — nem `sport`, nem `natural`, nem `leisure`, nem `water`. É como
     estão mapeadas as termas, os balneários municipais e a Caldeira Velha, que
     é um parque geotérmico pago com horário de abertura. As piscinas naturais
     dos Açores e da Madeira, que são o que se quer, trazem `sport=swimming` ou
     `natural=water` ao lado. */
  if (t.amenity === 'public_bath'
      && !(t.sport || t.natural || t.leisure || t.water
           || (t['bath:type'] && BATH_AGUA.has(t['bath:type'])))) {
    return 'banho publico sem agua corroborada';
  }
  if (t.leisure && MANTER_LEISURE.has(t.leisure)) return null;
  if (t.amenity === 'public_bath') return null;
  if (t.water) return null;
  return 'sem etiqueta que o classifique como sitio de banho';
}

/* --------------------------------------------------- a lista da APA ------ */
/* RECONHECER UM OBJECTO DO OSM COMO UMA ÁGUA BALNEAR OFICIAL.
   Duas condições, e as duas são precisas de propósito:

     · estar a menos de 400 m de um ponto da lista da APA, e
     · ter o MESMO NÚCLEO DE NOME que esse ponto.

   O nome é que faz o trabalho. Sem ele, «a menos de 400 m de uma praia
   oficial» apanha o bar, o parque de campismo e o miradouro — e a seguir o
   site tem três cartões para a mesma areia. Com ele, o «Snack-Bar do Zé» a
   30 m da Praia do Negrito não casa, e a «Praia fluvial do Negrito» casa.

   Isto NÃO é a via por que uma praia oficial entra no site — essa é o
   actualizar-balneares.js. Isto é só o que impede o filtro de etiquetas de
   deitar fora um objecto que a APA já designou. */
const M_OFICIAL = 400;
function casarComOficiais(elementos) {
  if (!fs.existsSync(BALNEARES)) return new Map();
  const aguas = JSON.parse(fs.readFileSync(BALNEARES, 'utf8')).aguas;
  const oficiais = new Map();
  for (const e of elementos) {
    const t = e.tags || {};
    if (!t.name) continue;
    const c = coord(e);
    if (c[0] == null) continue;
    const nEl = nucleo(t.name);
    for (const a of aguas) {
      if (metros([a.la, a.lo], c) > M_OFICIAL) continue;
      const nOf = nucleo(a.n);
      if (nEl === nOf || nEl.includes(nOf) || nOf.includes(nEl)) { oficiais.set(e, a); break; }
    }
  }
  return oficiais;
}

/* --------------------------------------------------------------- mar? ---- */
async function saoDeMar(pontos) {
  /* Uma chamada só, com todas as coordenadas: a API marinha aceita listas. */
  const la = pontos.map((p) => p[0].toFixed(4)).join(',');
  const lo = pontos.map((p) => p[1].toFixed(4)).join(',');
  const r = await fetch('https://marine-api.open-meteo.com/v1/marine?latitude=' + la
    + '&longitude=' + lo + '&hourly=wave_height&forecast_days=1&timezone=auto');
  if (!r.ok) throw new Error('a API marinha respondeu ' + r.status);
  let d = await r.json();
  if (!Array.isArray(d)) d = [d];
  return d.map((x) => {
    const h = ((x || {}).hourly || {}).wave_height || [];
    return h.some((v) => v != null) ? 1 : 0;
  });
}

/* ---------------------------------------------------------------- main --- */
(async function () {
  if (process.argv.includes('--recolher')) await recolher();

  const praias = JSON.parse(fs.readFileSync(PRAIAS, 'utf8'));
  const dados = JSON.parse(fs.readFileSync(OSM, 'utf8'));
  const base = (dados.osm3s || {}).timestamp_osm_base || '?';
  const dias = base === '?' ? null
    : Math.round((Date.now() - Date.parse(base)) / 86400000);

  /* A CÓPIA TEM IDADE, e é preciso dizê-la. Sem isto ninguém sabe se está a
     comparar com o OSM de hoje ou com o de há três meses — e a resposta «não
     há nada a mudar» quer dizer coisas muito diferentes nos dois casos. */
  console.log(`cópia do OSM: ${base}${dias == null ? '' : ` (há ${dias} dia${dias === 1 ? '' : 's'})`}`
    + `, ${dados.elements.length} elementos`);

  /* --- casar por nome + proximidade, que é como a lista foi montada ------ */
  const porNome = new Map();
  for (const p of praias) {
    const k = semAcentos(p.n);
    if (!porNome.has(k)) porNome.set(k, []);
    porNome.get(k).push(p);
  }
  const usadas = new Set();
  const novas = [], renomeadas = [], outroNome = [], conflitos = [];

  const descartados = new Map();
  const oficiais = casarComOficiais(dados.elements);
  console.log(`  reconhecidos como águas balneares oficiais: ${oficiais.size}`);
  for (const e of dados.elements) {
    const nome = (e.tags || {}).name;
    if (!nome) continue;
    const porque = lixo(e.tags || {}, oficiais.has(e));
    if (porque) { descartados.set(porque, (descartados.get(porque) || 0) + 1); continue; }
    const c = coord(e);
    const iguais = (porNome.get(semAcentos(nome)) || [])
      .filter((p) => metros([p.la, p.lo], c) < KM_IGUAL * 1000);
    if (iguais.length) { iguais.forEach((p) => usadas.add(p)); continue; }
    /* A MESMA PRAIA COM OUTRO NOME? Compara-se o núcleo, num raio largo: o
       OSM parte praias grandes em pedaços com nomes derivados, e o centro de
       cada pedaço fica a mais de um quilómetro do ponto que o site usa. */
    const mesmoNucleo = praias.filter((p) => nucleo(p.n) === nucleo(nome)
      && metros([p.la, p.lo], c) < KM_MESMA_PRAIA * 1000);
    if (mesmoNucleo.length) { mesmoNucleo.forEach((p) => usadas.add(p)); continue; }
    /* UM CARTAO POR AGUA BALNEAR OFICIAL, e este e o invariante que faltava.
       O OSM tem a mesma agua mapeada mais do que uma vez e com especies
       diferentes — em Pomares, Arganil, ha uma «Piscina Fluvial de Pomares» e
       uma «Praia Fluvial de Pomares» a 70 m, e a APA designa ali UMA agua
       balnear (PTCT7Q). O nucleo dos dois nomes nao coincide (um comeca por
       «piscina», outro por «praia»), portanto a comparacao de nomes deixa-os
       passar aos dois. A designacao da APA e que os junta: se a agua oficial
       que este objecto representa JA TEM praia no ficheiro, esta e a mesma. */
    const oficial = oficiais.get(e);
    if (oficial) {
      const jaTem = praias.find((p) => metros([p.la, p.lo], [oficial.la, oficial.lo]) < M_OFICIAL);
      if (jaTem) { usadas.add(jaTem); continue; }
    }
    /* Sem o nome: é o MESMO PONTO com outro nome, ou é ponto novo? */
    const noSitio = praias.filter((p) => metros([p.la, p.lo], c) < M_MESMO_SITIO);
    if (noSitio.length === 1 && !usadas.has(noSitio[0])) {
      /* SÓ O `natural=beach` RENOMEIA. A lista foi montada a partir dessa
         etiqueta, e é dela que um nome novo é mesmo um nome novo. Os ramos
         acrescentados a 25/08/2026 trazem OUTROS objectos no mesmo sítio: uma
         `leisure=swimming_area` a dois metros de uma praia, com o nome escrito
         de outra maneira. Tratá-los como renomeação estragava dados — uma
         delas ia trocar «Praia Fluvial dos Olhos d'Água do Alviela» por
         «Praia Fluvial Dos Olhos De Água», com maiúsculas a meio e um
         topónimo a menos. Reportam-se, e decide-se à mão. */
      const eBeach = (e.tags || {}).natural === 'beach';
      if (eBeach) {
        renomeadas.push({ p: noSitio[0], de: noSitio[0].n, para: nome });
      } else {
        outroNome.push({ p: noSitio[0], osm: nome, etiqueta:
          Object.entries(e.tags).filter(([k]) => ['natural','leisure','amenity'].includes(k))
            .map(([k, v]) => k + '=' + v).join(' ') });
      }
      usadas.add(noSitio[0]);
    } else if (!noSitio.length) {
      /* E ENTRE OS PROPRIOS NOVOS: o OSM tem a mesma poca mapeada como
         `amenity=public_bath` e como `leisure=swimming_area`, com nomes
         parecidos e a poucos metros. Sem isto entravam as duas. */
      /* A MESMA MEDIDA que se usa contra os que já lá estão — 60 m —, e não
         uma mais larga. Tinha aqui 300 m e era inconsistente: na primeira
         corrida engolia onze sítios com nomes próprios, e na corrida seguinte
         eles reapareciam como novos porque contra o ficheiro a medida é
         outra. Nos Açores e na Madeira duas poças com nome diferente a 80 m
         são duas poças, não uma mapeada duas vezes. */
      const jaNovo = novas.some((x) => metros([x.la, x.lo], c) < M_MESMO_SITIO
        || (nucleo(x.n) === nucleo(nome) && metros([x.la, x.lo], c) < KM_MESMA_PRAIA * 1000));
      /* UM NOME QUE JA EXISTE NOUTRO SITIO NAO ENTRA SOZINHO.
         O OSM tem os «Poceirões piscinas naturais» da Graciosa mapeados DUAS
         vezes com o mesmo nome e a 3,6 km um do outro — sao dois nos do mesmo
         autor, com ids seguidos, e so um deles fica a 55 m do ponto oficial da
         APA. Sao 600 m a mais do que o KM_IGUAL, portanto a comparacao por
         nome nao os junta, e entravam os dois: duas praias com o mesmo nome no
         mesmo concelho dao o mesmo endereco, e o gerar-slugs.js fica sem
         maneira de as distinguir — perde o endereco que ja estava publicado.

         Nao se escolhe aqui qual das duas coordenadas esta certa: uma delas
         esta errada no OSM e corrigi-la e uma edicao no OSM, nao uma decisao
         deste programa. Reporta-se. A agua balnear oficial nao fica por isso
         de fora: o actualizar-balneares.js acrescenta-a a seguir, com o nome
         oficial, que nao colide. */
      const nomeUsado = praias.some((x) => semAcentos(x.n) === semAcentos(nome))
        || novas.some((x) => semAcentos(x.n) === semAcentos(nome));
      if (nomeUsado && !jaNovo) {
        conflitos.push({ n: nome, la: +c[0].toFixed(5), lo: +c[1].toFixed(5) });
      } else if (!jaNovo) {
        novas.push({ n: nome, la: +c[0].toFixed(5), lo: +c[1].toFixed(5), tipo: e.type });
      }
    }
    /* noSitio.length > 1 ou já usada: é uma segunda representação da mesma
       praia (o OSM tem a mesma praia como way E como relation). Ignora-se. */
  }
  /* OS CONFLITOS QUE JÁ FORAM VISTOS E DECIDIDOS.
     Um conflito de nome tem de chumbar o `--verificar`, senão a praia
     desaparece em silêncio. Mas os dois que estão aqui em baixo já foram
     olhados, e chumbar por causa deles todas as noites é fabricar o alarme que
     se deixa de ler. Ficam escritos, com a razão; um conflito NOVO continua a
     parar tudo, que é o que interessa. */
  const CONFLITO_CONHECIDO = {
    /* O OSM tem os Poceirões da Graciosa mapeados duas vezes, com o mesmo nome,
       a 3,7 km um do outro e por ids seguidos do mesmo autor (6710754585 e
       6710754685). A dúvida acabou a 8/9/2026: TRÊS fontes independentes põem
       os Poceirões no mesmo sítio — a APA (PTAN9W, 39,07631/−28,06332), o
       Portal do Turismo dos Açores (a 57 m) e o nó 6710754685 (a 57 m). O nó
       6710754585, a 3,7 km, é o discrepante, e era dele que a coordenada do
       site vinha. O cartão foi movido para o ponto oficial.
       O nó errado continua no OSM e continua a bater à porta com o mesmo nome;
       fica aqui reconhecido para não parar o CI todas as noites. Corrigi-lo é
       uma edição no OpenStreetMap, e não uma decisão deste programa. */
    '39.09629,-28.02944': 'Poceirões: o nó do OSM que está 3,7 km fora do sítio',
    /* Uma «Piscina fluvial» sem topónimo nenhum, em Penacova, com o mesmo nome
       de outra em Águeda. Um nome que não distingue nada não deve entrar. */
    '40.03061,-8.12281': 'Piscina fluvial: nome sem topónimo, já usado em Águeda',
  };
  const novosConflitos = conflitos.filter(
    (c2) => !CONFLITO_CONHECIDO[c2.la + ',' + c2.lo]);
  if (conflitos.length) {
    console.log(`  nome ja usado noutro sitio, NAO entraram: ${conflitos.length}`
      + (novosConflitos.length ? '' : ' (todos conhecidos)'));
    for (const c2 of conflitos) {
      const k = CONFLITO_CONHECIDO[c2.la + ',' + c2.lo];
      console.log(`     ${c2.n} (${c2.la},${c2.lo})${k ? '  — conhecido: ' + k : '  ← NOVO'}`);
    }
  }
  /* UMA PRAIA QUE A APA DESIGNOU NAO ESTA «SUMIDA» POR FALTAR AO OSM.
     57 das praias deste ficheiro entraram pela lista de aguas balneares
     oficiais e nao existem no OpenStreetMap — a Vagueira, a de Sao Bernardino,
     as quatro de Santa Maria. Sem esta linha, a comparacao diaria com o OSM
     acusava-as todas as noites de terem desaparecido, e um aviso que aparece
     todos os dias sem nada para corrigir e um aviso que se deixa de ler.

     O OSM diz onde estao as praias; a APA diz quais existem. Faltar a uma
     fonte que nao manda no assunto nao e uma falta. */
  /* E A EXEMPÇÃO É SÓ PARA AS QUE ENTRARAM POR AQUI.
     A primeira versão marcava «qualquer praia a menos de 400 m de um ponto da
     APA», que são 679 das 1239 — mais de metade do ficheiro a ficar fora do
     relatório de «já não no OSM». Se uma delas fosse mesmo apagada do
     OpenStreetMap, por engano ou por vandalismo, ninguém dava por isso.

     A lista certa é outra: as praias que o actualizar-balneares.js
     ACRESCENTOU, porque essas nunca estiveram no OSM e não faz sentido
     esperá-las lá. Ele grava-as em `_source/praias-da-apa.json` — fora do
     data/praias.json, que viaja em cada visita e não pode engordar com
     proveniência. São 58, e não 679. */
  const designadas = new Set();
  if (fs.existsSync(DA_APA)) {
    const pontos = JSON.parse(fs.readFileSync(DA_APA, 'utf8')).pontos || [];
    for (const p of praias) {
      if (pontos.some((q) => metros(q, [p.la, p.lo]) < M_MESMO_SITIO)) designadas.add(p);
    }
  }
  const sumidas = praias.filter((p) => !usadas.has(p) && !designadas.has(p));
  if (descartados.size) {
    const total = [...descartados.values()].reduce((a, b) => a + b, 0);
    console.log(`  descartados por nao serem sitio de banho: ${total}`);
    for (const [k, v] of [...descartados].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
      console.log(`     ${v.toString().padStart(4)} - ${k}`);
    }
  }

  /* As águas fechadas impõem-se em TODAS as corridas, e não só quando entra
     uma praia nova: sem isto, uma reimportação devolvia-lhes o `m=1` e o veto
     de mar cavado voltava sem ninguém dar por ele. */
  const fechadas = [];
  for (const p of praias) {
    const k = `${p.la.toFixed(4)},${p.lo.toFixed(4)}`;
    if (AGUA_FECHADA[k] && p.m !== 0) fechadas.push({ p, porque: AGUA_FECHADA[k] });
  }
  const orfas = Object.keys(AGUA_FECHADA).filter((k) =>
    !praias.some((p) => `${p.la.toFixed(4)},${p.lo.toFixed(4)}` === k));
  if (orfas.length) {
    console.log(`  ⚠ ${orfas.length} coordenada(s) de água fechada já não existem na lista:`);
    for (const o of orfas) console.log(`     ${o} — ${AGUA_FECHADA[o]}`);
  }
  console.log(`  águas fechadas marcadas como mar: ${fechadas.length}`);
  for (const f of fechadas) console.log(`     ${f.p.n} — ${f.porque}`);

  if (outroNome.length) {
    console.log(`  mesmo sítio, outro objecto do OSM com outro nome: ${outroNome.length}`);
    console.log('     (não se aplicam: só o natural=beach renomeia — ver o comentário)');
    for (const o of outroNome.slice(0, 6)) {
      console.log(`     «${o.p.n}» tem lá um ${o.etiqueta} chamado «${o.osm}»`);
    }
  }
  console.log(`  renomeadas no OSM: ${renomeadas.length}`);
  for (const r of renomeadas) console.log(`     «${r.de}» -> «${r.para}»`);
  console.log(`  novas no OSM: ${novas.length}`);
  for (const n of novas) console.log(`     ${n.n} (${n.tipo}) ${n.la},${n.lo}`);
  console.log(`  no site e já não no OSM: ${sumidas.length}`
    + (designadas.size ? `  (e ${designadas.size} que entraram pela lista da APA e o OSM nunca teve)` : ''));
  for (const s of sumidas) console.log(`     ${s.n} ${s.la},${s.lo}`);

  /* OS CONFLITOS CONTAM. Sem isto, uma praia recusada por ter o nome de outra
     desaparecia em silêncio: o `--verificar` saía 0, o passo do CI escrevia
     «✅ a lista bate certo com o OpenStreetMap», e a praia nunca entrava em
     corrida nenhuma. O `nada` é a resposta à pergunta «há alguma coisa por
     decidir?», e um conflito é precisamente isso. */
  const nada = !renomeadas.length && !novas.length && !sumidas.length
    && !fechadas.length && !novosConflitos.length;

  if (process.argv.includes('--verificar')) {
    if (nada) { console.log('✓ a lista bate certo com a cópia do OSM'); process.exit(0); }
    console.error('✗ a lista e o OSM divergem — correr: node _source/actualizar-praias.js');
    process.exit(1);
  }
  if (nada) { console.log('nada a fazer'); return; }

  /* --- aplicar o que se decide sozinho ---------------------------------- */
  /* Sem tocar no `b`: ele saiu do ficheiro e é derivado no carregamento, com
     esta mesma `normalizar()`. Escrevê-lo aqui era repor 6 KB por visita para
     dizer o que o browser calcula sozinho. */
  for (const r of renomeadas) r.p.n = r.para;
  for (const f of fechadas) f.p.m = 0;
  if (novas.length) {
    const mar = await saoDeMar(novas.map((n) => [n.la, n.lo]));
    novas.forEach((n, i) => {
      praias.push({ n: n.n, la: n.la, lo: n.lo, r: '', m: mar[i] });
      console.log(`  ${n.n}: a API marinha diz ${mar[i] ? 'MAR' : 'INTERIOR'}`);
    });
  }
  praias.sort((a, b) => (a.r || '').localeCompare(b.r || '', 'pt')
    || a.n.localeCompare(b.n, 'pt'));
  fs.writeFileSync(PRAIAS, '[\n' + praias.map((p) => JSON.stringify(p)).join(',\n') + '\n]\n');
  console.log(`data/praias.json — ${praias.length} praias`);
  if (sumidas.length) {
    console.log('');
    console.log('AS QUE SUMIRAM FICARAM NO FICHEIRO, de propósito: uma praia que');
    console.log('desaparece do OSM pode ter sido apagada por engano. Decide-se à mão.');
  }
  if (novas.length) {
    console.log('');
    console.log('A SEGUIR, e por esta ordem:');
    console.log('   python3 _source/gerar-concelhos.py     (o concelho das novas)');
    console.log('   node _source/gerar-regioes.js          (a região vem do concelho)');
    console.log('   node _source/gerar-slugs.js --escrever (o endereço de cada uma)');
    console.log('   node _source/gerar-praias.js           (os hubs)');
  }
})().catch((e) => morrer('actualizar-praias.js', e));
