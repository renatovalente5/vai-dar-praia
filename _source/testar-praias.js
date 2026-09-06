/* Passa o modelo por muitas praias reais, com dados reais, e verifica que
   nenhuma produz um resultado impossível ou uma excepção.
   Correr:  node _source/testar-praias.js  [quantas]                          */

global.window = global;
require('../assets/js/modelo.js');
const { morrer } = require('./rede.js');
var M = global.Modelo;
var fs = require('fs');

var MODELOS = ['ecmwf_ifs025', 'icon_seamless', 'gfs_seamless', 'ukmo_seamless'];
var PRAIAS = JSON.parse(fs.readFileSync(__dirname + '/../data/praias.json', 'utf8'));
var QUANTAS = parseInt(process.argv[2] || '40', 10);

/* A API AINDA RESPONDE? Sem isto, com a quota do dia esgotada, este ficheiro
   cospe quarenta linhas de «excepção — Cannot read properties of undefined» e
   parece que o modelo se partiu. Não se partiu: é o 429 da Open-Meteo, cujo
   tecto são 10 000 pedidos por dia POR IP. Não afecta quem visita o site —
   cada browser fala com a API a partir do IP de quem lá está — mas afecta
   quem corre os testes muitas vezes seguidas. Um teste que não sabe dizer «não
   consegui medir» manda-nos perseguir defeitos que não existem. */
async function apiViva() {
  try {
    var r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=41.18'
      + '&longitude=-8.69&hourly=temperature_2m&forecast_days=1&models=ecmwf_ifs025');
    if (r.ok) return null;
    var t = '';
    try { t = (await r.text()).slice(0, 150); } catch (e) { }
    return 'HTTP ' + r.status + ' ' + t;
  } catch (e) { return String(e && e.message || e); }
}

/* Amostra espalhada de norte a sul, e com praias de rio pelo meio, em vez das
   primeiras N do ficheiro — que seriam todas do mesmo canto do país. */
function amostra(n) {
  var ordenadas = PRAIAS.slice().sort(function (a, b) { return b.la - a.la; });
  var passo = ordenadas.length / n, out = [];
  for (var i = 0; i < n; i++) out.push(ordenadas[Math.floor(i * passo)]);
  return out;
}

function url(base, pontos, extra) {
  return base + '?latitude=' + pontos.map(function (p) { return p.la; }).join(',')
    + '&longitude=' + pontos.map(function (p) { return p.lo; }).join(',')
    + extra + '&timezone=auto&forecast_days=6';
}
function comoArray(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }

var falhas = [], avisos = [], contagem = { verde: 0, amarelo: 0, vermelho: 0 }, testes = 0;
var metadesFalam = 0, metadesPares = 0;
function ok(cond, texto) {
  testes++;
  if (!cond) falhas.push(texto);
}

(async function () {
  var morta = await apiViva();
  if (morta) {
    console.log('\n' + '='.repeat(56));
    console.log('NÃO É POSSÍVEL MEDIR: a Open-Meteo não responde.');
    console.log('  ' + morta);
    console.log('');
    console.log('  Não é defeito do site: a previsão é pedida pelo browser de quem');
    console.log('  visita, com o IP dele. É a quota DESTE computador que se esgotou.');
    console.log('='.repeat(56) + '\n');
    process.exit(2);
  }
  var praias = amostra(QUANTAS);
  var mar = praias.filter(function (p) { return p.m; });
  console.log('\nA pedir ' + praias.length + ' praias (' + mar.length + ' de mar, '
    + (praias.length - mar.length) + ' de rio) em 2 pedidos…\n');

  var tempo = comoArray(await (await fetch(url('https://api.open-meteo.com/v1/forecast', praias,
    '&hourly=temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,wind_direction_10m,'
    + 'cloud_cover,precipitation,precipitation_probability,uv_index,weather_code'
    + '&daily=weather_code,precipitation_sum&models=' + MODELOS.join(',')))).json());
  var marinho = comoArray(await (await fetch(url('https://marine-api.open-meteo.com/v1/marine', mar,
    '&hourly=sea_surface_temperature,wave_height'))).json());

  ok(tempo.length === praias.length, 'a API devolveu ' + tempo.length + ' de ' + praias.length + ' praias');
  var porMar = {};
  mar.forEach(function (p, i) { porMar[p.n + p.la] = marinho[i] || null; });

  praias.forEach(function (p, i) {
    var rot = (p.m ? 'mar ' : 'rio ') + p.n.slice(0, 30);
    var dias, veredictos;
    try {
      dias = M.agregar(M.consenso(tempo[i], MODELOS), porMar[p.n + p.la], p);
      veredictos = dias.map(M.classificarDia);
    } catch (e) {
      falhas.push(rot + ': excepção — ' + e.message);
      return;
    }

    ok(dias.length === 6, rot + ': deviam ser 6 dias, são ' + dias.length);

    /* ------------------------------------------ as duas partes do dia ---- */
    var cons = M.consenso(tempo[i], MODELOS);
    dias.forEach(function (d, iDia) {
      var a = M.avaliarDia(cons, porMar[p.n + p.la], p, d.dia);
      var onde = rot + ' dia ' + iDia;
      /* Um buraco de dados horários da API chegava ao ecrã como silêncio, e
         silêncio é indistinguível de «não há notícia». Aqui distingue-se. */
      ok(a.partes.length === 2, onde + ': deviam ser 2 partes, são ' + a.partes.length);
      ok(a.partes.every(function (x) { return x.v; }), onde + ': falta uma das partes');
      if (!a.v || a.partes.some(function (x) { return !x.v; })) return;

      var ns = a.partes.map(function (x) { return x.v.notaPropria; });
      /* A NOTA DO DIA É A MÉDIA DAS DUAS. É a queixa que originou o redesenho,
         e esta é a asserção que impede que volte. Com duas parcelas a média
         está SEMPRE entre elas — se isto falhar, o cartão mostra três números
         que não fecham e a pessoa vê uma conta mal feita. */
      var m = Math.round((ns[0] + ns[1]) / 2);
      /* A nota do dia é a MÉDIA das duas — e nunca acima do que a penalização
         do próprio dia deixa. O `min` existe por um caso real: a chuva
         soma-se ao longo do dia, portanto o DIA pode estar vetado com as duas
         partes sãs, e aí a média delas seria alta de mais para um dia
         chumbado. Sem veto nem despromoção do dia, é a média exacta. */
      ok(a.v.nota <= m,
         onde + ': a nota do dia é ' + a.v.nota + ' e a média das partes é ' + m
         + ' (' + ns.join(', ') + ') — o dia nunca pode valer MAIS do que as suas partes');
      /* E SÓ SE AFASTA DA MÉDIA POR UMA PENALIZAÇÃO DA MESMA ESPÉCIE QUE
         NENHUMA PARTE TEM. Medido em 3896 dias-praia, o dia tem penalização
         própria e as partes sãs em 1,1 % dos dias — fora esses, é a média.

         A ESPÉCIE importa, e esta asserção já esteve a fixar o comportamento
         errado: dizia «se alguma parte estiver penalizada, o dia É a média»,
         o que deixava uma parte apenas DESPROMOVIDA (leve, tecto 69) dispensar
         o tecto de um VETO do dia (grave, tecto ≈ 44 %). Passava na Praia dos
         Namorados a 26/08/2026 — veto de chuva a sério com 2,88 mm, as duas
         partes só despromovidas, dia a 69 amarelo em vez de 33 vermelho. */
      var algumaGrave = a.partes.some(function (x) { return x.v.penalizacao === 'grave'; });
      var algumaPenal = a.partes.some(function (x) { return x.v.penalizacao != null; });
      var dispensa = a.v.penalizacao === 'grave' ? !algumaGrave
                   : (a.v.penalizacao === 'leve' ? !algumaPenal : false);
      ok(a.v.nota === m || dispensa,
         onde + ': a nota do dia (' + a.v.nota + ') não é a média (' + m
         + ') das partes ' + ns.join('-') + '. O dia carrega penalização '
         + (a.v.penalizacao || 'nenhuma') + ' e as partes carregam '
         + a.partes.map(function (x) { return x.v.penalizacao || 'nenhuma'; }).join('+')
         + ' — está a ser contada duas vezes');
      ok(a.v.nota <= Math.max(ns[0], ns[1]),
         onde + ': a nota do dia (' + a.v.nota + ') está acima da melhor parte ' + ns.join('-'));
      /* E NUNCA ABAIXO DA PIOR, sem um veto que o justifique. Foi assim que a
         despromoção passou despercebida um dia inteiro: ela mandava um dia de
         soma 71 para 46, e o cartão mostrava 47 numa sexta com a manhã a 69 e
         a tarde a 78. Um veto é outra coisa — aí o dia pode mesmo cair abaixo
         das partes, porque a chuva soma-se ao longo do dia. */
      ok(a.v.cor === 'vermelho' || a.v.nota >= Math.min(ns[0], ns[1]),
         onde + ': a nota do dia (' + a.v.nota + ') está ABAIXO da pior parte '
         + ns.join('-') + ' e o dia nem sequer é vermelho');

      /* A COR SAI DA NOTA, E SÓ DELA — no dia e em cada parte. Um dia a 46
         pintado de vermelho enquanto outro a 44 saía amarelo é exactamente a
         conta mal feita que a pessoa vê ao comparar dois cartões lado a lado.
         Havia um `if (vetos.length) cor = 'vermelho'` que fazia isso. */
      [{ v: a.v, q: 'dia' }, { v: a.partes[0].v, q: 'manhã' }, { v: a.partes[1].v, q: 'tarde' }]
        .forEach(function (x) {
          if (x.v.nota == null) return;
          var esperada = x.v.nota >= 70 ? 'verde' : (x.v.nota >= 45 ? 'amarelo' : 'vermelho');
          ok(x.v.cor === esperada,
             onde + ' (' + x.q + '): nota ' + x.v.nota + ' devia ser ' + esperada
             + ' e está ' + x.v.cor);
        });

      /* A água e a ondulação são as do DIA, e são as que cada parte usou. O
         painel escreve «igual de manhã e à tarde», e tem de ser verdade. */
      ok(a.partes.every(function (x) { return x.d.agua === a.d.agua; }),
         onde + ': a água não é a mesma nas duas partes');

      /* Toda a classificação tem razão escrita: é o que a interface usa quando
         é uma PARTE a falar, e sem ela o bloco vermelho fica mudo. */
      ok(a.partes.every(function (x) { return typeof x.v.razao === 'string' && x.v.razao.length; }),
         onde + ': uma das partes ficou sem razão');

      /* A escala de uma praia de rio (86 pontos normalizados a 100) tem de
         sobreviver à divisão da janela. */
      if (!p.m) {
        a.partes.forEach(function (x, k) {
          var us = x.v.factores.filter(function (f) { return f.pontos != null; });
          var pt = us.reduce(function (s2, f) { return s2 + f.peso; }, 0);
          ok(Math.abs(pt - 86) < 0.6,
             onde + ' ' + (k ? 'tarde' : 'manhã') + ': pesos de rio ' + pt.toFixed(1) + ', esperado 86');
        });
      }
      /* Os dois contadores sobre a MESMA população — todos os dias-praia. Ao
         contar os partidos nos seis dias e os pares só no dia 0, a taxa dava
         140 %. */
      metadesPares++;
      if (a.partes[0].v.cor !== a.partes[1].v.cor) metadesFalam++;
    });

    veredictos.forEach(function (v, d) {
      var onde = rot + ' dia ' + d;
      ok(['verde', 'amarelo', 'vermelho'].indexOf(v.cor) >= 0, onde + ': cor inválida «' + v.cor + '»');
      ok(v.nota === null || (v.nota >= 0 && v.nota <= 100), onde + ': nota fora de 0-100 (' + v.nota + ')');
      ok(typeof v.frase === 'string' && v.frase.length > 0, onde + ': frase vazia');
      ok(Array.isArray(v.factores) && v.factores.length >= 4, onde + ': factores a menos');
      /* TODA a parte-dia tem nota. Era `null` quando havia veto, e 38,9 % das
         partes-dia ficavam sem número nenhum — saiu a pedido. */
      ok(v.nota !== null, onde + ': ficou sem nota nenhuma');
      /* E o veto entra NA nota: um dia vetado cai na banda do vermelho. */
      ok(!(v.vetos && v.vetos.length) || v.nota < 45,
         onde + ': tem veto e mostra ' + v.nota + ', fora da banda do vermelho');
      /* A COR SAI DA NOTA, e só dela. É a queixa que originou isto: um dia
         vermelho com 61 ao lado de um amarelo com 52. */
      var esperada = v.nota >= 70 ? 'verde' : (v.nota >= 45 ? 'amarelo' : 'vermelho');
      ok(v.cor === esperada,
         onde + ': nota ' + v.nota + ' pede ' + esperada + ' e a cor é ' + v.cor);
      /* A cor não pode contrariar a nota. */
      if (v.nota !== null) {
        ok(!(v.nota >= 70 && v.cor === 'vermelho'), onde + ': nota ' + v.nota + ' mas vermelho');
        ok(!(v.nota < 45 && v.cor === 'verde'), onde + ': nota ' + v.nota + ' mas verde');
      }
      if (d === 0) contagem[v.cor]++;
    });

    /* Praia de rio: não pode inventar temperatura da água nem ondas. */
    if (!p.m) {
      var temAgua = veredictos[0].factores.some(function (f) { return f.id === 'agua'; });
      ok(!temAgua, rot + ': praia de rio com factor de água');
      ok(dias[0].ondas == null, rot + ': praia de rio com ondulação');
    }

    /* A nota tem de ser a proporção dos pontos obtidos sobre os pesos que
       existem nesta praia — é assim que uma praia de rio, que não tem factor
       de água, continua a ter uma escala que vai a 100. */
    var usaveis = veredictos[0].factores.filter(function (f) { return f.pontos != null; });
    var pesoTotal = usaveis.reduce(function (s, f) { return s + f.peso; }, 0);
    var obtidos = usaveis.reduce(function (s, f) { return s + f.pontos; }, 0);
    ok(pesoTotal > 0, rot + ': nenhum factor utilizável');
    /* Compara-se a SOMA CRUA e não a nota mostrada: a nota já traz a
       penalização do veto ou do factor limitante, e essa não sai desta conta. */
    if (veredictos[0].notaBruta !== null) {
      ok(Math.abs(veredictos[0].notaBruta - Math.round(obtidos / pesoTotal * 100)) <= 0,
         rot + ': a soma crua ' + veredictos[0].notaBruta + ' não bate com ' + obtidos + '/' + pesoTotal);
    }
    ok(Math.abs(pesoTotal - (p.m ? 100 : 86)) < 0.6,
       rot + ': pesos ' + pesoTotal.toFixed(1) + ' (esperado ' + (p.m ? 100 : 86) + ')');

    var vento = dias[0].vento;
    if (vento != null && (vento < 0 || vento > 150)) avisos.push(rot + ': vento improvável ' + vento + ' km/h');
    if (dias[0].agua != null && (dias[0].agua < 5 || dias[0].agua > 32)) {
      avisos.push(rot + ': água improvável ' + dias[0].agua.toFixed(1) + ' °C');
    }
  });

  console.log('  hoje: ' + contagem.verde + ' verdes · ' + contagem.amarelo
    + ' amarelas · ' + contagem.vermelho + ' vermelhas');
  console.log('  ' + testes + ' verificações');

  /* Quantas vezes o cartão se parte em dois. Não há limiar a afinar — quem
     manda é a cor — mas se alguém trocar a regra por uma diferença de pontos,
     esta percentagem dispara e o alarme toca antes do utilizador. A taxa-base
     medida contra o ERA5 é de 32,6 % dos dias com as partes em cores
     diferentes, portanto qualquer coisa muito acima de metade é sinal de que
     a regra deixou de ser a cor. */
  var taxa = metadesPares ? metadesFalam / metadesPares * 100 : 0;
  console.log('  cartões partidos: ' + metadesFalam + ' em ' + metadesPares
    + ' dias-praia = ' + taxa.toFixed(1) + ' %  [taxa-base medida 32,6 %]');
  ok(taxa <= 60, 'o cartão parte-se em ' + taxa.toFixed(1)
    + ' % das praias — a regra deixou de ser a cor?');
  if (avisos.length) {
    console.log('\n  valores estranhos (não são falhas, mas vale a pena ver):');
    avisos.slice(0, 10).forEach(function (a) { console.log('    ⚠ ' + a); });
  }
  console.log('\n' + '='.repeat(56));
  if (falhas.length) {
    console.log('✗ ' + falhas.length + ' FALHAS');
    falhas.slice(0, 20).forEach(function (f) { console.log('  - ' + f); });
  } else {
    console.log('✓ nenhuma praia produziu um resultado impossível');
  }
  console.log('='.repeat(56));
  process.exit(falhas.length ? 1 : 0);
})().catch(function (e) { morrer('testar-praias.js', e); });
