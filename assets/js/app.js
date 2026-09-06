/* =============================================================
   PRAIÓMETRO — aplicação
   =============================================================
   Site estático: não há servidor nenhum. Tudo o que acontece aqui acontece no
   browser de quem visita, e as duas APIs da Open-Meteo são públicas, sem chave
   e com CORS aberto — verificado antes de escolher.

   Este ficheiro trata da interface. Quem decide se o dia é bom é o modelo.js,
   que não sabe o que é o DOM.
   ============================================================= */
(function () {
  'use strict';

  var doc = document;
  var el = function (id) { return doc.getElementById(id); };
  var M = window.Modelo;

  /* Ligar um ouvinte a um elemento que pode não existir nesta página.
     Hoje o ficheiro faz `el('perto').addEventListener(...)` quinze vezes ao
     nível de cima. Basta faltar UM desses id para dar `TypeError: null is not
     an object` — e, como isto corre tudo dentro do mesmo IIFE, nada a seguir
     chega a correr, incluindo o fetch do praias.json que está no fim. A página
     fica com o HTML e mais nada, sem erro nenhum à vista.
     As páginas de praia que aí vêm não vão ter os diálogos da conta. Replicar
     o esqueleto inteiro em cada uma delas era a outra saída, e era pior: o
     mesmo texto literal repetido em centenas de páginas é exactamente o que
     não se quer. */
  function on(id, ev, fn) {
    var n = el(id);
    if (n) n.addEventListener(ev, fn);
    return n;
  }

  var PRAIAS = [];
  var praiaActual = null;
  var dias = [];          /* dados agregados por dia */
  var veredictos = [];    /* classificação por dia */
  var avaliacoes = [];    /* {d, v, partes, media} por dia — é o que vai ao ecrã */
  var horaDesenhada = null;
  /* null | 'manha' | 'tarde'. Vive só nesta visita e NUNCA vai ao
     localStorage: um cartão que abre de maneira diferente conforme o que se
     fez há três semanas é um cartão que se aprende duas vezes. */
  var parteAberta = null;
  var diaEscolhido = 0;

  /* Praias conhecidas para arrancar, para o ecrã inicial não estar vazio.
     Escolhidas por serem conhecidas, não por serem as melhores, e postas por
     ORDEM GEOGRÁFICA, de norte para sul — a latitude está ao lado para se ver
     que a ordem é essa e não outra.

     São cinco e não mais: no computador têm de caber todas numa linha, e o
     `nowrap` do CSS não deixa a lista quebrar. Quem acrescentar uma praia aqui
     tem de confirmar que continua a caber — sobretudo com nomes compridos. */
  var ATALHOS = [
    'Praia de Matosinhos',   /* 41,18 — Porto */
    'Praia da Barra',        /* 40,64 — Aveiro */
    'Praia da Nazaré',       /* 39,60 — Leiria */
    'Praia de Carcavelos',   /* 38,68 — Lisboa */
    'Praia da Rocha'         /* 37,12 — Algarve */
  ];

  /* ------------------------------------------------------------ ícones */
  /* Cada veredicto tem uma FORMA diferente, não só uma cor: sol, sol com
     nuvem, e nuvem com chuva. Quem não distingue verde de vermelho continua a
     perceber, e a WCAG 1.4.1 exige exactamente isto. */
  var ICONES = {
    verde: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="24" cy="24" r="9" fill="currentColor" stroke="none"/><path d="M24 5v5M24 38v5M5 24h5M38 24h5M10.6 10.6l3.5 3.5M33.9 33.9l3.5 3.5M10.6 37.4l3.5-3.5M33.9 14.1l3.5-3.5"/></svg>',
    amarelo: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="17" r="7" fill="currentColor" stroke="none"/><path d="M17 4v4M4 17h4M8.3 8.3l2.8 2.8"/><path d="M35 40H16a8 8 0 0 1 0-16 10 10 0 0 1 19.3-2.4A7.5 7.5 0 0 1 35 40Z" fill="var(--carta)"/></svg>',
    vermelho: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M34 29H15a8 8 0 0 1 0-16 10 10 0 0 1 19.3-2.4A7.5 7.5 0 0 1 34 29Z"/><path d="M16 35l-2 6M25 35l-2 6M34 35l-2 6"/></svg>'
  };
  /* «Hoje não» num cartão de sexta-feira é simplesmente falso — e é também o
     que o leitor de ecrã lê em voz alta. A palavra passa a depender do dia. */
  var PALAVRAS = {
    verde:    { hoje: 'Dia de praia',   outro: 'Dia de praia' },
    amarelo:  { hoje: 'Assim-assim',    outro: 'Assim-assim' },
    vermelho: { hoje: 'Hoje não',       outro: 'Não vale a pena' }
  };
  function palavra(cor, i) { return PALAVRAS[cor][i === 0 ? 'hoje' : 'outro']; }

  var ICONES_FACTOR = {
    ceu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5"/></svg>',
    vento: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8h11a3 3 0 1 0-3-3M3 16h14a3 3 0 1 1-3 3M3 12h7"/></svg>',
    ar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4.5 4.5 0 1 1-4 0Z"/></svg>',
    agua: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 15c2 0 2-1.6 4-1.6s2 1.6 4 1.6 2-1.6 4-1.6 2 1.6 4 1.6M3 19c2 0 2-1.6 4-1.6s2 1.6 4 1.6 2-1.6 4-1.6 2 1.6 4 1.6"/><path d="M12 3c2.5 3.4 4 5.6 4 7.4a4 4 0 0 1-8 0C8 8.6 9.5 6.4 12 3Z"/></svg>',
    chuva: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 15H8a4.5 4.5 0 0 1 0-9 5.6 5.6 0 0 1 10.8-1.3A4.2 4.2 0 0 1 17 15Z"/><path d="M9 19l-1 3M14 19l-1 3"/></svg>'
  };

  /* ------------------------------------------------------------ ajudas */

  /* Tem de fazer EXACTAMENTE a mesma limpeza que fez o ficheiro de praias,
     senão escrever o nome tal como o site o mostra não encontra nada: em
     «Praia do Furadouro - Norte» o hífen virou espaço nos dados, e na pesquisa
     ficava um termo «-» que não existe em lado nenhum. */
  function normalizar(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  }
  /* Vírgula decimal. Em português escreve-se 18,3 °C, não 18.3 °C. */
  function num(v, casas) {
    if (v == null) return '—';
    return v.toFixed(casas == null ? 0 : casas).replace('.', ',');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function distancia(a, b, c, d) {
    var R = 6371, p = Math.PI / 180;
    var dl = (c - a) * p, dn = (d - b) * p;
    var x = Math.sin(dl / 2) * Math.sin(dl / 2) +
            Math.cos(a * p) * Math.cos(c * p) * Math.sin(dn / 2) * Math.sin(dn / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function nomeDia(iso, i) {
    var d = new Date(iso + 'T12:00:00');
    if (i === 0) return 'Hoje';
    if (i === 1) return 'Amanhã';
    return d.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', '');
  }
  function dataCurta(iso) {
    var d = new Date(iso + 'T12:00:00');
    return d.getDate() + '/' + (d.getMonth() + 1);
  }
  function dataLonga(iso, i) {
    var d = new Date(iso + 'T12:00:00');
    var s = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
    s = (i === 0 ? 'hoje, ' : i === 1 ? 'amanhã, ' : '') + s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ------------------------------------------------------------ procura */

  var caixa = el('procura');
  var lista = el('sugestoes');
  var estado = el('procura-estado');
  var marcado = -1;

  /* Pontua cada praia contra o que foi escrito. Começar pelo nome vale mais do
     que aparecer a meio: quem escreve «carca» quer Carcavelos, não «Praia do
     Carcavelos de Baixo» de outro sítio qualquer. */
  function procurar(q) {
    var n = normalizar(q).trim();
    if (n.length < 2) return [];
    var termos = n.split(/\s+/);
    var res = [];
    for (var i = 0; i < PRAIAS.length; i++) {
      var p = PRAIAS[i], alvo = p.b, pontos = 0, falhou = false;
      /* LIMPA-SE À ENTRADA, e para todas — não só para as que casam. O `al` é
         a marca de «foi este nome oficial que te trouxe aqui» e vive no
         próprio registo, como o `d` da distância. Se só se limpasse nas que
         casam, uma praia que casou numa procura anterior guardava a marca e
         mostrava-a na procura seguinte, ao lado de uma palavra que nada tinha
         que ver com ela. */
      p.al = null;
      for (var t = 0; t < termos.length; t++) {
        var k = alvo.indexOf(termos[t]);
        if (k === -1) { falhou = true; break; }
        pontos += k === 0 ? 100 : (alvo[k - 1] === ' ' ? 60 : 20);
        pontos -= Math.min(k, 30) * 0.3;
      }
      if (falhou) continue;
      /* QUAL O NOME QUE FEZ O ENCONTRO. Se os termos todos cabem no nome que o
         cartão mostra, não há nada a explicar. Se não cabem, foi um nome
         oficial que os encontrou — e mostrar «Praia Velha» a quem escreveu
         «Esmoriz» sem dizer porquê é mostrar uma praia que ele não pediu. */
      if (p.a) {
        var soNome = normalizar(p.n);
        for (var u = 0; u < termos.length; u++) {
          if (soNome.indexOf(termos[u]) !== -1) continue;
          var outros = p.a.split(' · ');
          for (var v = 0; v < outros.length; v++) {
            if (normalizar(outros[v]).indexOf(termos[u]) !== -1) { p.al = outros[v]; break; }
          }
          if (p.al) break;
        }
      }
      /* praias de mar primeiro: é o que a esmagadora maioria procura */
      if (p.m) pontos += 12;
      pontos -= p.bl * 0.08;
      res.push({ p: p, s: pontos });
    }
    res.sort(function (a, b) { return b.s - a.s; });
    return res.slice(0, 8).map(function (x) { return x.p; });
  }

  /* Um listbox só pode conter `option`, e uma `option` não pode conter nada
     interactivo — tinha aqui um <button> dentro de cada uma. Num combobox as
     opções não se percorrem com o Tab: o foco fica na caixa de escrita e é o
     aria-activedescendant que diz ao leitor de ecrã qual está marcada. */
  function mostrarSugestoes(arr, titulo) {
    if (!arr.length) { esconderSugestoes(); return; }
    lista.innerHTML =
      (titulo ? '<li class="sugestao sugestao--titulo" role="presentation"><span class="sugestao__meta">' + esc(titulo) + '</span></li>' : '') +
      arr.map(function (p, i) {
        return '<li class="sugestao" role="option" id="sug-' + i + '" aria-selected="false"' +
          ' data-i="' + PRAIAS.indexOf(p) + '">' +
          '<span class="sugestao__nome">' + esc(p.n) + '</span>' +
          (p.al ? '<span class="sugestao__alias">' + esc(p.al) + '</span>' : '') +
          (p.m ? '' : '<span class="sugestao__rio">rio</span>') +
          '<span class="sugestao__meta">' + esc(p.c ? p.c + ' · ' + p.r : p.r) +
            (p.d != null ? ' · ' + num(p.d) + ' km' : '') + '</span>' +
          '</li>';
      }).join('');
    lista.hidden = false;
    caixa.setAttribute('aria-expanded', 'true');
    desmarcar();
  }
  /* Apontar para uma opção que já não existe é pior do que não apontar para
     nenhuma: o leitor de ecrã fica a anunciar um id fantasma. */
  function desmarcar() {
    marcado = -1;
    caixa.removeAttribute('aria-activedescendant');
  }
  function esconderSugestoes() {
    lista.hidden = true; lista.innerHTML = '';
    caixa.setAttribute('aria-expanded', 'false');
    desmarcar();
  }

  caixa.addEventListener('input', function () {
    var r = procurar(caixa.value);
    /* «Não encontrámos» num <li role=presentation> dentro do listbox não é
       anunciado por leitor nenhum, e dizer aria-expanded="true" sobre uma lista
       sem opções é mentira. A mensagem vai para a região que já é live. */
    if (caixa.value.trim().length >= 2 && !r.length) {
      esconderSugestoes();
      estado.textContent = 'Não encontrámos nenhuma praia com esse nome.';
    } else {
      estado.textContent = r.length ? r.length + (r.length === 1 ? ' praia encontrada' : ' praias encontradas') : '';
      mostrarSugestoes(r);
    }
  });

  caixa.addEventListener('keydown', function (e) {
    var opcoes = [].slice.call(lista.querySelectorAll('.sugestao[data-i]'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!opcoes.length) return;
      e.preventDefault();
      marcado += (e.key === 'ArrowDown' ? 1 : -1);
      if (marcado < 0) marcado = opcoes.length - 1;
      if (marcado >= opcoes.length) marcado = 0;
      opcoes.forEach(function (o, i) {
        o.setAttribute('aria-selected', i === marcado ? 'true' : 'false');
      });
      caixa.setAttribute('aria-activedescendant', opcoes[marcado].id);
      opcoes[marcado].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Home' || e.key === 'End') {
      if (!opcoes.length) return;
      e.preventDefault();
      marcado = e.key === 'Home' ? 0 : opcoes.length - 1;
      opcoes.forEach(function (o, i) { o.setAttribute('aria-selected', i === marcado ? 'true' : 'false'); });
      caixa.setAttribute('aria-activedescendant', opcoes[marcado].id);
      opcoes[marcado].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (marcado >= 0 && opcoes[marcado]) { e.preventDefault(); escolher(PRAIAS[+opcoes[marcado].dataset.i]); }
      else if (opcoes.length) { e.preventDefault(); escolher(PRAIAS[+opcoes[0].dataset.i]); }
    } else if (e.key === 'Escape') {
      esconderSugestoes();
    }
  });

  /* O RATO NÃO PODE TIRAR O FOCO DA CAIXA, e isto tem de ficar ANTES do
     `click`. Uma `<li role="option">` não é focável: ao carregar nela o foco
     sai da caixa para lado nenhum, e o `focusout` aqui em baixo — que existe
     para fechar a lista com Tab — fechava-a entre o carregar e o soltar do
     rato. O `click` chegava a seguir e já não encontrava sugestão nenhuma:
     carregar com o rato não fazia rigorosamente nada, e sem erro.
     `preventDefault` no `mousedown` é o que impede o foco de se mexer. O
     teclado não passa por aqui — chega ao mesmo sítio pelo Enter. */
  lista.addEventListener('mousedown', function (e) {
    if (e.target.closest('.sugestao[data-i]')) e.preventDefault();
  });

  lista.addEventListener('click', function (e) {
    var b = e.target.closest('.sugestao[data-i]');
    if (!b) return;
    escolher(PRAIAS[+b.dataset.i]);
  });

  doc.addEventListener('click', function (e) {
    if (!e.target.closest('.procura')) esconderSugestoes();
  });

  /* E FECHA QUANDO O FOCO SAI, não só com Escape ou com um clique fora. Sair da
     caixa com Tab deixava a lista aberta: um painel opaco, com z-index 30, por
     cima do que vinha a seguir — nos três Tabs seguintes, o elemento focado
     estava debaixo dela e não se via. E o combobox continuava a anunciar
     `aria-expanded="true"` e um `aria-activedescendant` que já não tinha o foco
     lá dentro. É a WCAG 2.4.11.
     O `relatedTarget` é para onde o foco VAI: se for ainda dentro da procura —
     uma sugestão, por exemplo — não se fecha nada. */
  doc.addEventListener('focusout', function (e) {
    if (!e.target.closest || !e.target.closest('.procura')) return;
    var vai = e.relatedTarget;
    if (vai && vai.closest && vai.closest('.procura')) return;
    esconderSugestoes();
  });

  /* --------------------------------------------------------- geolocalização */

  on('perto', 'click', function () {
    var b = this;
    if (!navigator.geolocation) {
      estado.textContent = 'O teu browser não permite saber onde estás.';
      return;
    }
    b.setAttribute('aria-busy', 'true');
    estado.textContent = 'À procura de onde estás…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      b.removeAttribute('aria-busy');
      var la = pos.coords.latitude, lo = pos.coords.longitude;
      /* SEM FILTRO DE MAR. Estava aqui um `.filter(p.m)` que deitava fora as
         236 praias de rio, e o resultado era este: quem carrega no alfinete em
         Bragança recebe praias de mar a mais de 50 km, com uma praia fluvial a
         três. «Mais perto de ti» a mostrar o que está longe é a única coisa
         que este botão não pode fazer. */
      var perto = PRAIAS
        /* E o `al` limpa-se aqui também: esta lista não vem de ninguém ter
           escrito nada, portanto não há nome oficial nenhum a explicar. */
        .map(function (p) { p.d = distancia(la, lo, p.la, p.lo); p.al = null; return p; })
        .sort(function (x, y) { return x.d - y.d; })
        .slice(0, 6);
      if (!perto.length || perto[0].d > 300) {
        estado.textContent = 'Não encontrámos praias perto de ti.';
        return;
      }
      estado.textContent = '';
      caixa.value = '';
      mostrarSugestoes(perto, 'Mais perto de ti');
      caixa.focus();
    }, function (err) {
      b.removeAttribute('aria-busy');
      estado.textContent = err.code === 1
        ? 'Não deste permissão para saber onde estás. Escreve o nome da praia.'
        : 'Não conseguimos saber onde estás. Escreve o nome da praia.';
    }, { timeout: 10000, maximumAge: 300000 });
  });

  /* ------------------------------------------------------------- dados */

  /* Quatro centros meteorológicos independentes em vez de um.
     Medido no Furadouro, mesmo ponto e mesma janela: ECMWF 10,8 · ICON 11,2 ·
     KNMI 12,7 · Météo-France 13,5 · UKMO 13,8 · GFS 16,0 km/h. A dispersão
     entre modelos é de 1,6x, e o modelo por omissão calhava no extremo baixo —
     era por isso que o site dizia menos vento do que os outros sítios.
     Custa 26 KB em vez de 8, num único pedido. */
  var MODELOS = ['ecmwf_ifs025', 'icon_seamless', 'gfs_seamless', 'ukmo_seamless'];

  /* Um só construtor para uma praia ou para muitas. A Open-Meteo aceita
     coordenadas separadas por vírgula e devolve um array pela mesma ordem —
     verificado nas duas APIs. Interessa que seja o MESMO construtor: se a
     tira de favoritos pedisse menos variáveis do que a página, a bolinha
     podia dizer verde e a praia aberta dizer amarelo. */
  function urlTempo(pontos, dias) {
    var a = [].concat(pontos);
    return 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + a.map(function (p) { return p.la; }).join(',')
      + '&longitude=' + a.map(function (p) { return p.lo; }).join(',')
      + '&hourly=temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,'
      + 'wind_direction_10m,cloud_cover,precipitation,precipitation_probability,uv_index,weather_code'
      + '&daily=weather_code,precipitation_sum'
      + '&timezone=auto&forecast_days=' + (dias || 6)
      + '&models=' + MODELOS.join(',');
  }

  function urlMar(pontos, dias) {
    var a = [].concat(pontos);
    return 'https://marine-api.open-meteo.com/v1/marine'
      + '?latitude=' + a.map(function (p) { return p.la; }).join(',')
      + '&longitude=' + a.map(function (p) { return p.lo; }).join(',')
      /* O `sea_level_height_msl` NÃO custa um pedido novo: entra na lista deste,
         que já se faz. Verificado que é maré a sério medindo a amplitude em
         sítios de maré conhecida: Baleares 0,20 m, Furadouro 2,84, Canal de
         Bristol 10,22. */
      + '&hourly=sea_surface_temperature,wave_height,sea_level_height_msl'
      + '&timezone=auto&forecast_days=' + (dias || 6);
  }

  /* Com uma coordenada a resposta é um objecto, com várias é um array. */
  function comoArray(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }

  /* Guarda a resposta durante meia hora. Sem isto, cada abertura da página
     eram dois pedidos, e os favoritos passariam a quatro — a Open-Meteo é
     gratuita e sem chave, mas responde 429 a quem abusa. */
  var TTL = 30 * 60 * 1000;

  /* A RESERVA, para quem está na areia com uma barra de rede. O sessionStorage
     acima morre quando o separador fecha; esta cópia fica no localStorage e
     sobrevive. Quando a rede falha, é ela que responde.

     A REGRA, e não tem excepção: uma previsão velha NUNCA é servida sem se
     dizer que é velha e de que horas é. Um site de praia que mostra o sol de
     ontem por baixo de chuva é pior do que um site que não abre. O
     `previsaoDe` guarda a hora e a interface é obrigada a mostrá-la.

     Só a ÚLTIMA praia fica guardada: uma destas respostas são centenas de KB
     (seis dias, hora a hora, quatro modelos) e o localStorage anda nos 5 MB.
     Guardar todas as praias visitadas enchia-o e partia os favoritos. */
  var previsaoDe = null;      /* hora da mais VELHA das respostas servidas da reserva */

  /* A coordenada que vive dentro do URL do pedido. É por ela que a reserva se
     poda: por PRAIA e não por relógio. */
  function coordDoUrl(u) {
    var m = /latitude=([-\d.]+)&longitude=([-\d.]+)/.exec(u || '');
    return m ? m[1] + ',' + m[2] : '';
  }

  function reservaGuardar(url, agora, d) {
    try {
      localStorage.setItem('pm:g:' + url, JSON.stringify({ t: agora, d: d }));
      /* PODA-SE POR PRAIA, e não pelas duas entradas mais recentes.
         Ficavam as duas mais novas do relógio, na ideia de que eram a previsão
         e o mar da mesma praia. Mas o desenho das cores dos favoritos usa o
         mesmo `buscar()` e arranca DEPOIS, portanto ganhava sempre a poda:
         medido, com dois favoritos a reserva da praia que se está a ver nunca
         sobrevivia, e offline dava ecrã vazio. Que é exactamente o cenário
         para que a reserva existe — quem está na areia com uma barra de rede.
         Agora só sai o que for de OUTRA praia. */
      var meu = coordDoUrl(url), fora = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('pm:g:') === 0 && coordDoUrl(k) !== meu) fora.push(k);
      }
      fora.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { }
  }

  /* CORTA O QUE JÁ PASSOU. Uma reserva de há cinco dias tem o dia 0 em Agosto
     19, e o cartão chamava-lhe «Hoje» — o nome do dia sai do ÍNDICE, não da
     data, portanto os seis separadores diziam «Hoje, Amanhã, Sexta» sobre dias
     todos passados. A linha «Sem rede, buscada às 13h29» cumpre a regra escrita
     mas está em letra pequena por baixo de seis separadores que afirmam o
     contrário, e quem está na praia lê os separadores.
     Não se deita fora a reserva inteira: uma de ontem ainda traz cinco dias
     bons. Corta-se o que passou e o índice volta a bater certo. */
  function alinharAHoje(d) {
    if (!d || !d.hourly || !Array.isArray(d.hourly.time)) return null;
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    var t = d.hourly.time, corte = 0;
    while (corte < t.length && new Date(t[corte]).getTime() < hoje.getTime()) corte++;
    if (corte >= t.length) return null;          /* está tudo no passado */
    if (!corte) return d;
    function cortar(bloco, n) {
      if (!bloco) return bloco;
      var saida = {}, ref = bloco.time ? bloco.time.length : 0;
      Object.keys(bloco).forEach(function (c) {
        saida[c] = (Array.isArray(bloco[c]) && bloco[c].length === ref)
          ? bloco[c].slice(n) : bloco[c];
      });
      return saida;
    }
    var dias = Math.floor(corte / 24);
    var novo = {};
    Object.keys(d).forEach(function (c) { novo[c] = d[c]; });
    novo.hourly = cortar(d.hourly, corte);
    if (d.daily) novo.daily = cortar(d.daily, dias);
    return novo;
  }

  function reservaLer(url) {
    try {
      var g = JSON.parse(localStorage.getItem('pm:g:' + url) || 'null');
      if (!g || !g.d) return null;
      var d = alinharAHoje(g.d);
      if (!d) { localStorage.removeItem('pm:g:' + url); return null; }
      return { t: g.t, d: d };
    } catch (e) { return null; }
  }

  /* O `semReserva` é para os pedidos que não servem de reserva nenhuma: o
     desenho das cores dos favoritos pede UM dia para várias praias de uma vez,
     e guardar isso ocupava lugar sem nunca poder alimentar um cartão. */
  function buscar(url, semReserva) {
    var agora = new Date().getTime();
    try {
      var c = JSON.parse(sessionStorage.getItem('pm:c:' + url) || 'null');
      if (c && agora - c.t < TTL) {
        /* A RESERVA ACOMPANHA O QUE SE ESTÁ A VER, e não o último pedido que
           foi à rede. Sem esta linha ela só se actualizava quando havia
           `fetch`, portanto rever uma praia que já estava na cache de sessão
           deixava lá a reserva da ANTERIOR: escolhia-se A, escolhia-se B, e ao
           voltar a A a reserva continuava com B. Depois, sem rede, o cartão de
           A abria vazio. E é o cenário para que a reserva existe — quem está na
           areia volta às mesmas duas ou três praias.
           Guarda-se com o `c.t` e não com o `agora`: a linha «Sem rede, esta
           previsão foi buscada às 09h35» tem de dizer quando FOI BUSCADA, e
           não quando alguém voltou a olhar para ela. */
        if (!semReserva) reservaGuardar(url, c.t, c.d);
        return Promise.resolve(c.d);
      }
    } catch (e) { }
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (d) {
      try { sessionStorage.setItem('pm:c:' + url, JSON.stringify({ t: agora, d: d })); } catch (e) { }
      if (!semReserva) reservaGuardar(url, agora, d);
      return d;
    }).catch(function (e) {
      var g = reservaLer(url);
      if (!g) throw e;
      previsaoDe = previsaoDe == null ? g.t : Math.min(previsaoDe, g.t);
      return g.d;
    });
  }

  /* `automatico` é true quando a praia vem do endereço ou da última visita —
     aí não se mexe no foco, porque ninguém pediu nada. */
  function escolher(praia, automatico) {
    praiaActual = praia;
    previsaoDe = null;          /* praia nova: a marca da reserva recomeça */
    var focoAoPedir = doc.activeElement;
    esconderSugestoes();
    caixa.value = praia.n;
    caixa.blur();
    estado.textContent = 'A ver como está…';
    el('vazio').hidden = true;

    var pedidos = [buscar(urlTempo(praia))];
    /* A API marinha só responde em pontos com mar. Numa praia de rio o pedido
       nem se faz; noutras pode falhar, e isso não pode deitar a página abaixo. */
    pedidos.push(praia.m
      ? buscar(urlMar(praia)).catch(function () { return null; })
      : Promise.resolve(null));

    Promise.all(pedidos).then(function (r) {
      /* QUEM CHEGA ATRASADO NÃO ESCREVE. É a mesma guarda que o mostrarMapa()
         já tinha, e faltava aqui — escolher duas praias seguidas com a segunda
         em cache e a rede lenta deixava a resposta ANTIGA chegar por último e
         escrever por cima: título de uma praia, números de outra, e o
         `history.replaceState` a gravar o endereço errado. Isso não se corrige
         sozinho, porque a visita seguinte abre pelo que ficou gravado. */
      if (praiaActual !== praia) return;
      var cons = M.consenso(r[0], MODELOS);
      dias = M.agregar(cons, r[1], praia);
      /* O dia e as suas três partes vêm juntos do modelo, e a nota do dia JÁ É
         a média das três. Não se volta a chamar classificarDia aqui: havia
         duas fontes para a mesma nota e uma delas ficaria para trás. */
      avaliacoes = dias.map(function (d) { return M.avaliarDia(cons, r[1], praia, d.dia); });
      veredictos = avaliacoes.map(function (a) { return a.v; });
      diaEscolhido = 0;
      /* Praia nova, pergunta nova: o gesto que abriu o painel foi feito sobre
         um cartão que já não está no ecrã. Ao mudar de DIA não se toca — quem
         abriu a manhã está a comparar manhãs, e fechá-la a cada dia obrigava a
         seis toques para ver seis manhãs. */
      parteAberta = null;
      estado.textContent = '';
      /* Já sabemos a cor de hoje desta praia: a tira de favoritos aproveita-a
         em vez de a voltar a pedir. */
      if (veredictos[0]) coresFav[F.id(praia)] = veredictos[0].cor;
      desenhar();
      desenharReserva();
      /* Sem isto o foco ficava no <body> depois de escolher: quem anda de
         teclado tinha de percorrer a página toda outra vez para chegar ao
         resultado que acabou de pedir. Mas a resposta pode demorar segundos
         numa rede móvel, e roubar o foco a quem já está a escrever noutro
         sítio é pior do que não o mover. */
      if (!automatico && (doc.activeElement === focoAoPedir || doc.activeElement === doc.body)) {
        /* `preventScroll` porque mover o foco é para orientar quem usa teclado
           ou leitor de ecrã, não para levar a página a passear: sem isto o
           browser rolava até ao resultado a cada praia escolhida, e quem
           escolheu a partir da caixa de procura ou da tira de favoritos —
           ambas acima do resultado — perdia de vista onde estava. */
        el('resultado').focus({ preventScroll: true });
      }
      try {
        localStorage.setItem('pm:praia', JSON.stringify({ id: F.id(praia), n: praia.n }));
        history.replaceState(null, '', '#' + endereco(praia));
      } catch (e) { }
    }).catch(function (e) {
      if (praiaActual !== praia) return;
      estado.textContent = 'Não conseguimos ir buscar a previsão. Tenta outra vez daqui a pouco.';
      el('vazio').hidden = false;
      /* Sem isto, uma praia que falhasse herdava as partes da anterior — e era
         a silhueta dessa que ficava no ecrã.
         E O CARTÃO INTEIRO SAI. Limpar só as avaliações deixava lá os `dias` e
         os `veredictos` da praia anterior: a tira continuava a responder ao
         clique e o cartão passava a dizer o NOME da praia nova por cima dos
         números, da maré e do mapa da antiga — sem nada no ecrã a dizê-lo. A
         linha da previsão guardada também não servia de aviso, porque isto não
         é uma previsão velha desta praia, é a previsão de outra. */
      dias = []; avaliacoes = []; veredictos = []; parteAberta = null;
      el('resultado').hidden = true;
      var f = el('v-sem-mar'); if (f) { f.innerHTML = ''; f.removeAttribute('data-k'); }
    });
  }

  /* A LINHA DA PREVISÃO GUARDADA. Só aparece quando os números que estão no
     ecrã vieram da reserva, ou seja, quando a rede falhou. Diz a que HORAS
     foram buscados, porque é isso que permite a quem está na areia decidir se
     confia neles — «das 9h14» numa tarde de Agosto é uma informação, «previsão
     guardada» sozinho não é nada.
     Num dia diferente do de hoje diz também o dia, senão a hora sozinha mente
     por omissão sobre a idade verdadeira. */
  function desenharReserva() {
    var p = el('v-antiga');
    if (!p) return;
    if (previsaoDe == null) { p.hidden = true; p.textContent = ''; return; }
    var d = new Date(previsaoDe), agora = new Date();
    var hora = ('0' + d.getHours()).slice(-2) + 'h' + ('0' + d.getMinutes()).slice(-2);
    var mesmoDia = d.toDateString() === agora.toDateString();
    p.textContent = 'Sem rede. Esta previsão foi buscada '
      + (mesmoDia ? 'às ' + hora
                  : 'a ' + d.getDate() + '/' + (d.getMonth() + 1) + ' às ' + hora) + '.';
    p.hidden = false;
  }

  /* ---------------------------------------------------------- desenhar */

  function desenhar() {
    el('resultado').hidden = false;
    desenharDias();
    desenharVeredicto();
    desenharSemMar();
    /* Fica para o fim e é assíncrono: o mapa é a coisa menos urgente do ecrã,
       e o ficheiro dos contornos só se pede na primeira praia escolhida. */
    if (praiaActual) mostrarMapa(praiaActual);
  }

  function desenharDias() {
    el('dias').innerHTML = dias.map(function (d, i) {
      var v = veredictos[i];
      var pal = palavraDoDia(i);
      /* SEM a data dd/m (eram doze números em seis células) e SEM os três
         rectângulos em miniatura: a 34x12, com notas a quinze pontos de
         distância, davam um píxel de diferença entre si — e a classe .dia--cor
         nunca definiu `color`, por isso saíam a azul-quase-preto. */
      return '<button class="dia dia--' + v.cor + '" type="button" role="tab" data-i="' + i + '"' +
        ' id="dia-' + i + '" aria-controls="veredicto"' +
        ' tabindex="' + (i === diaEscolhido ? '0' : '-1') + '"' +
        ' aria-selected="' + (i === diaEscolhido) + '"' +
        ' aria-label="' + esc(nomeDiaLongo(d.dia, i) + ', ' + pal.toLowerCase() +
          (v.nota == null ? '' : ', nota ' + v.nota + ' em 100')) + '">' +
        '<span class="dia__nome" aria-hidden="true">' + esc(nomeDiaLongo(d.dia, i)) + '</span>' +
        '<span class="dia__bolha" aria-hidden="true">' + ICONES[v.cor] + '</span>' +
        /* Onde não há nota há PALAVRAS. Nunca um «✕», que se lê como avaria ou
           como «fechado», e nunca como «não vale a pena». */
        (v.nota == null ? '' : '<span class="dia__nota" aria-hidden="true">' + v.nota + '</span>') +
        '<span class="dia__palavra" aria-hidden="true">' + esc(pal) + '</span>' +
        '</button>';
    }).join('');
    trazerDiaAVista();
  }

  /* O `desenharDias` reescreve o innerHTML da tira, e isso põe o `scrollLeft` a
     zero. Numa tira que rola, quem tivesse rolado até «Domingo» e lhe tocasse
     via a tira saltar para o princípio e o dia que acabou de escolher sair do
     ecrã. Mexe-se no `scrollLeft` da TIRA e não se chama `scrollIntoView`: esse
     também mexe na página, e na primeira pintura a tira ainda está abaixo da
     dobra — puxava o ecrã para baixo sem ninguém ter pedido nada.
     Os 3 px são a folga do anel de selecção, a mesma do padding da tira. */
  function trazerDiaAVista() {
    var t = el('dias');
    if (!t || t.scrollWidth <= t.clientWidth + 1) return;
    var sel = t.querySelector('.dia[aria-selected="true"]');
    if (!sel) return;
    var tr = t.getBoundingClientRect(), sr = sel.getBoundingClientRect();
    if (sr.left < tr.left + 3) t.scrollLeft += sr.left - tr.left - 3;
    else if (sr.right > tr.right - 3) t.scrollLeft += sr.right - tr.right + 3;
  }

  on('dias', 'click', function (e) {
    var b = e.target.closest('.dia');
    if (!b) return;
    diaEscolhido = +b.dataset.i;
    /* O `desenhar()` reescreve o innerHTML da tira e destrói o botão que tem o
       foco — que passa para o <body>. O ouvinte de `keydown` aqui ao lado já
       repunha o foco de propósito, com o comentário a dizer porquê; este não,
       e Enter e Espaço num <button> disparam um CLICK nativo, portanto quem
       anda de teclado caía sempre no caminho descoberto: escolhia um dia e a
       seta seguinte não fazia nada.
       Só se repõe se o foco ESTAVA na tira: com o rato não há foco a devolver,
       e roubá-lo seria pior. E `preventScroll`, senão a página passeia — o
       `trazerDiaAVista()` já trata do lado horizontal. */
    var tinhaFoco = doc.activeElement && doc.activeElement.closest
                    && doc.activeElement.closest('#dias');
    desenhar();
    if (tinhaFoco) {
      var novo = el('dias').querySelector('.dia[data-i="' + diaEscolhido + '"]');
      if (novo) novo.focus({ preventScroll: true });
    }
  });

  on('dias', 'keydown', function (e) {
    var n = dias.length;
    if (!n) return;
    var novo = null;
    /* Uma fila e não uma grelha: as setas de cima e de baixo andavam três
       células, que era o que a grelha de 3x2 pedia. Com a tira outra vez em
       fila, andar três é arbitrário — e, pior, o preventDefault tirava a essas
       duas teclas o seu trabalho normal, que é rolar a página. Saíram. */
    if (e.key === 'ArrowRight') novo = (diaEscolhido + 1) % n;
    else if (e.key === 'ArrowLeft') novo = (diaEscolhido - 1 + n) % n;
    else if (e.key === 'Home') novo = 0;
    else if (e.key === 'End') novo = n - 1;
    if (novo === null) return;
    e.preventDefault();
    diaEscolhido = novo;
    desenhar();
    /* Depois de redesenhar, o botão é outro: o foco tem de o seguir, senão
       fica no <body> e a seguinte seta não faz nada. */
    var b = el('dias').querySelector('.dia[data-i="' + novo + '"]');
    if (b) { b.focus(); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  });

  function desenharVeredicto() {
    var d = dias[diaEscolhido], v = veredictos[diaEscolhido], a = avaliacoes[diaEscolhido];
    doc.body.setAttribute('data-cor', v.cor);
    el('veredicto').setAttribute('aria-labelledby', 'dia-' + diaEscolhido);
    el('v-praia').textContent = praiaActual.n;
    el('v-praia').setAttribute('title', praiaActual.c ? praiaActual.c + ', ' + praiaActual.r : praiaActual.r);
    desenharEstrela();
    desenharFavoritos();

    /* «Hoje» / «Amanhã» / «Sábado», e mais nada. A data por extenso saiu: a
       tira já diz que dia é, e ninguém precisa de «Hoje, segunda-feira, 12 de
       agosto». O prazo só a partir do 5.º dia — que amanhã é uma previsão,
       toda a gente sabe. */
    /* «Previsão a 5 dias — ainda pode mudar» saiu: quem escolhe o quinto
       cartão de uma tira de seis já sabe que está a olhar para uma previsão. */
    el('v-dia').textContent = nomeDiaLongo(d.dia, diaEscolhido);

    desenharPartes(a);
    desenharMare(d);
    desenharAvisos(d, v);
    horaDesenhada = new Date().getHours();
  }

  /* Os nomes das partes, declinados. Em português o artigo contrai-se («da
     manhã») e o particípio concorda («a manhã está chumbada»). Uma tabela
     resolve; um corte de string dava «54 contra 40 d manhã», e deu. */
  var NOMES = {
    manha: { com: 'a manhã', de: 'da manhã', alta: 'A manhã', chumbo: 'A manhã está chumbada' },
    tarde: { com: 'a tarde', de: 'da tarde', alta: 'A tarde', chumbo: 'A tarde está chumbada' }
  };

  /* ============================================= as duas partes do dia ====
     A manhã e a tarde são SEMPRE dois blocos, com uma fenda real entre eles.
     Houve uma versão em que os dias iguais apareciam num bloco só — a forma
     mudava consoante o dia — e foi tirada a pedido: duas caixas todos os dias
     são uma coisa que se aprende uma vez e nunca mais surpreende, e a pessoa
     que abre isto de três em três semanas nunca vê o ecrã mudar de feitio.

     O que continua a depender da COR é o que se DIZ, não o que se desenha: a
     frase comparativa por cima («A manhã está melhor») só aparece quando as
     duas partes caem em cores diferentes. Um limiar em pontos seria pior —
     três pontos de diferença estão abaixo dos 5,4 de desvio-padrão do
     desacordo entre os quatro modelos, e o cartão falaria por ruído. */
  function haDados(partes) {
    return !!(partes && partes.length === 2 && partes[0].v && partes[1].v);
  }
  /* Cores diferentes é que é notícia — e é isso, e só isso, que faz o cartão
     abrir a boca por cima dos dois blocos. */
  function coresDiferem(partes) {
    if (!haDados(partes)) return false;
    var a = partes[0].v, b = partes[1].v;
    if (a.nota == null || b.nota == null) return true;
    return a.cor !== b.cor;
  }

  /* Aqui viviam o FRASES_PARTIDO, o semNumero, o razaoDoDia e o
     respostaPartida — tudo o que escrevia a linha por cima dos blocos. Saíram
     com ela: a linha existia para explicar uma parte SEM número, e desde que a
     penalização passou a entrar na nota já não há partes sem número. */

  /* Só no dia de hoje, e só depois de a janela fechar. `>=` e não `>`: às 13h
     em ponto a manhã já acabou. */
  function jaPassou(p) {
    return diaEscolhido === 0 && new Date().getHours() >= p.fim;
  }

  function desenharPartes(a) {
    var caixa = el('v-partes'), resp = el('v-resposta');
    if (!caixa || !resp) return false;
    var partes = a && a.partes;

    if (!haDados(partes)) {
      resp.textContent = '';
      caixa.className = 'partes';
      caixa.innerHTML = '<p class="partes__sem">Não há previsão para este dia.</p>';
      return false;
    }

    /* A frase comparativa («A manhã está melhor») saiu: os dois blocos, com a
       palavra e o número de cada um, já dizem qual é a melhor — repeti-lo por
       extenso era dizer duas vezes a mesma coisa. O que fica é o caso em que
       uma das partes NÃO TEM número: aí não há nada no bloco que explique
       porquê, e a frase é a única coisa que o diz. */
    /* A LINHA POR CIMA DOS BLOCOS SAIU, a pedido — «A tarde está chumbada:
       chuva quase certa.» e as suas irmãs. Ela existia para explicar uma parte
       SEM número, e desde que a penalização passou a entrar na nota já não há
       partes sem número: cada bloco mostra o seu, na banda da sua cor, e a
       palavra ao lado diz o resto.
       O que se perde, e fica dito: num dia chumbado por chuva, o cartão deixa
       de nomear a chuva. O aviso VERMELHO de segurança continua a nomear o que
       é perigo — trovoada, rajadas, mar cavado — que é o que não pode faltar. */
    resp.textContent = '';
    caixa.className = 'partes';
    caixa.innerHTML = '<ol class="partes__blocos">' + partes.map(function (p) {
      var pv = p.v, pp = jaPassou(p);
      var semNota = !pv || pv.nota == null;
      var semDados = semNota && (!pv || !pv.vetos.length);
      var c = semDados ? 'semdados' : pv.cor;
      var pal = semDados ? 'Sem previsão' : PALAVRAS[pv.cor].outro;
      var lido = p.nome + ': ' + (semDados ? 'não há previsão'
        : pal.toLowerCase() + (semNota ? ', ' + pv.vetos[0] : ', nota ' + pv.nota + ' em 100'))
        + (pp ? ', já passou' : '');
      /* Um bloco sem números NÃO é botão: sai como <div>, sem seta e sem
         painel. Não entra no Tab e não anuncia um estado que não tem. Um bloco
         CHUMBADO (sem nota, mas com factores) É botão — é exactamente onde o
         «porquê» mais interessa. */
      var abrivel = temNumeros(p);
      var tag = abrivel ? 'button' : 'div';
      return '<li class="bloco parte--' + c + (semNota ? ' bloco--sem-nota' : '') +
               (pp ? ' bloco--passou' : '') + '" data-parte="' + p.id + '">' +
        '<' + tag + ' class="bloco__cabeca"' + (abrivel
          ? ' type="button" id="cab-' + p.id + '" aria-controls="nums-' + p.id + '"'
            + ' aria-expanded="false"' : '') + '>' +
          /* O nome acessível nomeia o OBJECTO e nunca a acção: quem diz o
             estado é o aria-expanded. */
          '<span class="visually-hidden">' + esc(lido) + '.</span>' +
          (semDados ? '' : '<span class="bloco__icone" aria-hidden="true">' + ICONES[pv.cor] + '</span>') +
          '<span class="bloco__texto" aria-hidden="true">' +
            '<span class="bloco__nome">' + esc(p.nome) + (pp ? ' · já passou' : '') + '</span>' +
            '<span class="bloco__palavra">' + esc(pal) + '</span>' +
            (semNota && !semDados ? '<span class="bloco__razao">' + esc(pv.vetos[0]) + '</span>' : '') +
          '</span>' +
          '<span class="bloco__dir" aria-hidden="true">' +
            (semNota ? '' : '<b class="bloco__nota">' + pv.nota + '</b>') +
            (abrivel ? '<span class="bloco__seta">' + SETA + '</span>' : '') +
          '</span>' +
        '</' + tag + '>' +
        /* role="group" e NÃO role="region": um region com nome é um LANDMARK, e
           ficavam dois marcos a entrar e a sair do rotor a cada toque, dentro
           de um role="tabpanel" que já é o painel de outro tablist.
           aria-live="off" não é decoração: o #veredicto inteiro é
           aria-live="polite", e sem isto abrir um bloco despejava os cinco
           factores em voz alta por cima do «expandido». */
        (abrivel
          ? '<div class="bloco__numeros" id="nums-' + p.id + '" role="group"' +
            ' aria-label="Números ' + esc(NOMES[p.id].de) + '" aria-live="off" hidden>' +
            numerosDaParte(p, a) + '</div>'
          : '') +
      '</li>';
    }).join('') + '</ol>' +
      /* O único sinal escrito de que os blocos se carregam. aria-hidden porque
         quem usa leitor de ecrã tem o aria-expanded, que é melhor — e porque
         isto vive dentro de uma região aria-live e não pode ser lido em voz
         alta de cada vez que o cartão se redesenha. */
      '<p class="partes__pista" id="v-pista" aria-hidden="true">Carrega na ' +
      '<b>Manhã</b> ou na <b>Tarde</b> para ver detalhes.</p>';
    /* Na MESMA passagem, nunca em duas: senão um dia o painel mostra os
       factores de terça debaixo do cabeçalho de sexta. */
    aplicarAbertura();
    return true;
  }

  /* A LINHA «Nota do dia 74 em 100» SAIU do cartão, a pedido. A nota do dia
     continua a ver-se na célula deste dia na tira de baixo, ao lado da sua
     palavra, e a aritmética continua a fechar à vista: a nota da tira é a média
     das duas que estão nos blocos.
     A escala «em 100» deixa de aparecer para quem vê; para quem ouve continua,
     porque o texto lido de cada bloco diz «nota 92 em 100». E a razão de um dia
     sem nota é dita pela linha por cima dos blocos — nos DOIS casos em que ela
     falta: parte chumbada, e dia chumbado com as partes sãs. */

  /* «sáb» num telemóvel de 320 px não custa menos do que «Sábado» e lê-se
     pior. «quarta-feira» corta-se no hífen: seis letras, cabem em 90 px. */
  function nomeDiaLongo(iso, i) {
    if (i === 0) return 'Hoje';
    if (i === 1) return 'Amanhã';
    var t = new Date(iso + 'T12:00:00')
      .toLocaleDateString('pt-PT', { weekday: 'long' }).split('-')[0];
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /* A palavra de cada dia na tira. NUNCA repete a palavra das partes quando o
     dia se parte: aí diz «Melhor de manhã» / «Melhor de tarde». É assim que a
     mesma palavra deixa de aparecer cinco vezes no mesmo ecrã sem se perder
     informação — e é o que responde a «então quando?» sem obrigar ninguém a
     interpretar um 91. */
  function palavraDoDia(i) {
    var a = avaliacoes[i], v = veredictos[i];
    var partes = a && a.partes;
    /* «Melhor de manhã» só quando as cores DIFEREM. Com os dois blocos a
       aparecerem todos os dias, usar o desenho como critério punha esta
       palavra em todos os cartões, incluindo naqueles em que as duas partes
       são a mesma coisa. */
    if (coresDiferem(partes) &&
        partes[0].v && partes[1].v && partes[0].v.nota != null && partes[1].v.nota != null) {
      return partes[0].v.nota > partes[1].v.nota ? 'Melhor de manhã' : 'Melhor de tarde';
    }
    return palavra(v.cor, i);
  }

  /* A MARÉ, só as horas que caem dentro do dia de praia. Dois terços dos
     extremos acontecem fora das 9h-19h — a preia-mar das 00h27 não interessa a
     ninguém que vá à praia — e listá-los todos era encher a linha com náutica.
     As palavras são as do Instituto Hidrográfico e do curso de nadador-salvador:
     «preia-mar» e «baixa-mar», não «maré alta» e «maré baixa». */
  /* A CURVA, desenhada em SVG à mão. Sem biblioteca — este projecto não tem
     dependências e não vai ter.

     A ESCALA é dos SEIS DIAS e não do dia aberto: normalizar cada dia ao seu
     próprio máximo faria um dia de águas mortas parecer igual a um de águas
     vivas, e essa diferença é a única coisa que a maré tem de real para dizer
     ao longo da semana (a amplitude é 99,6 % do dia).

     NÃO LEVA METROS, e é a mesma razão de antes: o zero desta fonte é o
     geóide, e o Zero Hidrográfico das tabelas portuguesas está ~2,6 m abaixo.
     Uma CURVA não tem esse problema — mostra a forma sem afirmar uma altura.

     E leva o texto por baixo, escondido à vista: um desenho que só existe para
     quem vê não entra neste cartão. */
  /* A altura deixa espaço para os rótulos das horas, que ficam FORA da curva:
     em cima na preia-mar e em baixo na baixa-mar. Sem essa folga, um deles era
     cortado pela borda da tela. */
  /* A LARGURA É MEDIDA, não é uma constante. O `viewBox` era fixo em 300 e o
     `preserveAspectRatio="none"` esticava tudo até à largura do cartão — e
     esticava TAMBÉM as letras. No telemóvel a escala é 1,06 e não se nota; no
     computador é 1,8 e as horas saem deformadas. Medido nas três larguras.
     Agora o viewBox é escrito em pixéis reais: a escala fica a 1 e uma letra
     de 11 px é uma letra de 11 px em qualquer ecrã. */
  var MARE_A = 78, MARE_PAD = 14;

  function pontoMare(largura, hora, v, min, max) {
    var x = MARE_PAD + (hora / 23) * (largura - 2 * MARE_PAD);
    var f = max > min ? (v - min) / (max - min) : 0.5;
    return [x, MARE_A - 22 - f * (MARE_A - 48)];
  }

  function desenharMare(d) {
    var caixa = el('v-mare'), tela = el('v-mare-svg'), txt = el('v-mare-txt');
    if (!caixa || !tela || !txt) return;
    var c = d && d.mareCurva;
    /* TODOS os extremos que a curva mostra, e não só os da janela de praia:
       um desenho com três picos e um só ponto marcado deixa quem olha a
       perguntar porque é que os outros dois não contam. Se estão desenhados,
       são marcados. */
    var ms = (d && d.mares) || [];
    if (!c || !ms.length) { caixa.hidden = true; tela.innerHTML = ''; txt.textContent = ''; return; }

    /* O mínimo e o máximo dos seis dias desta praia. */
    var min = Infinity, max = -Infinity;
    dias.forEach(function (x) {
      (x.mareCurva || []).forEach(function (p) {
        if (p.v < min) min = p.v; if (p.v > max) max = p.v;
      });
    });
    if (!(max > min)) { caixa.hidden = true; return; }

    /* Desesconde-se ANTES de medir: um elemento com [hidden] mede zero, e o
       desenho saía todo empilhado no canto esquerdo. */
    caixa.hidden = false;
    var L = Math.max(240, Math.round(tela.getBoundingClientRect().width));
    tela.setAttribute('viewBox', '0 0 ' + L + ' ' + MARE_A);

    var pts = c.map(function (p) { return pontoMare(L, p.h, p.v, min, max); });
    var linha = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }).join(' ');
    var chao = MARE_A - 18;
    var area = linha + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + chao
             + ' L' + pts[0][0].toFixed(1) + ' ' + chao + ' Z';

    /* UMA faixa CONTÍNUA, do princípio da manhã ao fim da tarde. Foi pedida
       assim, depois de ter estado partida em duas.
       O que ela diz, e é preciso ser exacto: é o DIA DE PRAIA — das 9h às 19h,
       que é o intervalo de que este cartão fala. NÃO é «as horas que o modelo
       pontua»: essas são duas, 9h-13h e 15h-19h, e as 13h-15h ficam de fora de
       propósito. Essa distinção é de cálculo e vive na /metodologia/, não num
       rectângulo cinzento.
       Os extremos vêm do `Modelo.PARTES` e não de números escritos à mão: no
       dia em que as janelas mudarem, a faixa acompanha. */
    var ps = M.PARTES || [{ ini: 9, fim: 13 }, { ini: 15, fim: 19 }];
    var xIni = pontoMare(L, ps[0].ini, 0, 0, 1)[0];
    var xFim = pontoMare(L, ps[ps.length - 1].fim, 0, 0, 1)[0];
    var faixas = '<rect class="mare__janela" x="' + xIni.toFixed(1) + '" y="0" width="'
      + (xFim - xIni).toFixed(1) + '" height="' + chao + '"/>';

    var marcas = ms.map(function (m) {
      var p = pontoMare(L, m.h + m.min / 60, m.v, min, max);
      var hora = ('0' + m.h).slice(-2) + 'h' + ('0' + m.min).slice(-2);
      var ancora = p[0] < L * 0.25 ? 'start' : (p[0] > L * 0.75 ? 'end' : 'middle');
      /* A hora da BAIXA-MAR vai por baixo do bloco de água, e não em cima
         dele: sobre o azul o texto ficava com um fundo que o medidor de
         contraste não sabe resolver — em SVG não há `background-color` para
         ele subir. Fora do azul, o fundo é o do cartão e a medida é real. */
      var y = m.tipo === 'preia' ? p[1] - 8 : chao + 13;
      return '<circle class="mare__ponto" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3"/>'
        + '<text class="mare__hora" x="' + p[0].toFixed(1) + '" y="' + y.toFixed(1)
        + '" text-anchor="' + ancora + '">' + hora + '</text>';
    }).join('');

    /* A janela vai do topo ao chão e sem cantos redondos: é uma FAIXA DE
       TEMPO, e com cantos e altura própria lia-se como uma caixa pousada por
       cima do desenho. */
    tela.innerHTML = faixas
      + '<path class="mare__area" d="' + area + '"/>'
      + '<path class="mare__linha" d="' + linha + '"/>'
      + marcas;

    txt.textContent = 'Maré: ' + ms.map(function (m) {
      return (m.tipo === 'preia' ? 'preia-mar' : 'baixa-mar') + ' às '
        + ('0' + m.h).slice(-2) + 'h' + ('0' + m.min).slice(-2);
    }).join(', ') + '.';
  }

  /* A largura muda quando a janela muda, e o desenho tem de a acompanhar —
     senão redimensionar o browser deixa a curva com a escala da largura
     anterior, que é o mesmo defeito por outra porta. Adiado, para não redesenhar
     sessenta vezes durante o arrasto. */
  var mareTimer = null;
  addEventListener('resize', function () {
    clearTimeout(mareTimer);
    mareTimer = setTimeout(function () {
      if (dias && dias[diaEscolhido]) desenharMare(dias[diaEscolhido]);
    }, 150);
  });

  function desenharAvisos(d, v) {
    /* Os avisos de CONFORTO saíram do cartão a pedido: o protector solar, o
       vento que se levanta de tarde e o mar cavado a metro e meio. Eram três
       linhas a competir com os dois números que respondem à pergunta, e o
       estado do mar continua a ver-se em «Ver os números», na linha da água.

       O que FICA é o aviso de SEGURANÇA — trovoada, rajadas perigosas, mar
       muito cavado. Esse não é um comentário sobre o conforto do dia: é a
       única coisa no ecrã que pode impedir alguém de se magoar, e tem caixa,
       cor e tom próprios exactamente por isso. */
    var av = el('v-aviso');
    if (!av) return;
    /* Pode vir de um veto (o dia está chumbado) ou de um aviso (o dia está bom
       E há um risco) — desde que a trovoada deixou de vetar, o segundo caso
       existe e é o mais comum. Ler `v.vetos[0]` às cegas dava «Aviso de
       segurança: undefined» num dia de nota 86. */
    if (!v.perigo) {
      av.hidden = true; av.textContent = '';
      av.className = 'veredicto__aviso';   /* senão ficava vermelho para sempre */
      return;
    }
    /* SÓ os perigos, e TODOS eles. Lia-se `vetos[0]`, que é o primeiro veto e
       não o primeiro perigo: num dia de chuva a sério com o mar a 3,2 m, a
       caixa vermelha dizia «chuva quase certa» e escondia o mar. E nomeia-se
       mais do que um, porque quando há dois é quando mais importa. */
    var perigos = v.perigos || [];
    if (!perigos.length) { av.hidden = true; av.textContent = ''; av.className = 'veredicto__aviso'; return; }
    var lista = perigos.length > 1
      ? perigos.slice(0, -1).join(', ') + ' e ' + perigos[perigos.length - 1]
      : perigos[0];
    var texto = 'Aviso de segurança: ' + lista + '.';
    /* Um aviso que não diz o que fazer não serve de nada a quem já está na
       areia — e este aparece ao lado de «Dia de praia». */
    if ((v.avisos || []).indexOf('pode haver trovoada') >= 0) {
      texto += ' Se ouvires trovões, sai da água e da praia.';
    }
    /* A CLASSE ESTAVA MORTA. O `.veredicto__aviso--perigo` existe no CSS desde
       que o aviso de segurança foi separado do de conforto — com um comentário
       a dizer que um veto de trovoada «não pode ser dito no mesmo tom amarelo
       que a água está fria» — e o JavaScript nunca lha punha. Resultado: a
       única coisa no ecrã que pode impedir alguém de se magoar era pintada com
       a cor do desconforto. É aqui, e só aqui, que o TRIÂNGULO cabe: em
       meteorologia ▲ e ▼ já querem dizer tendência, e o triângulo com a
       exclamação é o símbolo de risco de lesão da ANSI Z535.4. Usá-lo para
       dizer «o vento é o que trava o dia» seria gastá-lo no sítio errado. */
    av.className = 'veredicto__aviso veredicto__aviso--perigo';
    av.hidden = false;
    av.innerHTML = '<span class="veredicto__aviso-icone" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
      + ' stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M12 3.5 22 20H2Z"/><path d="M12 10v4"/><path d="M12 17.2v.1"/></svg></span>'
      + '<span>' + esc(texto) + '</span>';
  }

  /* ============================ os números, repartidos pelas três partes ==
     Uma <table> a sério, com <th scope="col"> nas partes e <th scope="row">
     nos factores: dá «Vento, Tarde, 14» a um leitor de ecrã sem um único
     aria-label escrito à mão. Foi por isso que se preferiu a uma grelha de
     <div> com rótulos escondidos. */

  var SETA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M6 9l6 6 6-6"/></svg>';

  /* Devolve o valor JÁ COM a unidade. Devolve '' — e não '—' — quando não há
     valor, porque uma linha sem valor não chega a ser escrita.

     Precisa do agregado da parte por causa do CALOR: o ecrã mostra a
     temperatura do TERMÓMETRO (`arReal`), que é o que se pede a uma aplicação
     de tempo, enquanto o modelo continua a pontuar a APARENTE — a que inclui
     o vento e a humidade. Medido em 96 partes-dia: diferem 1 °C ou mais em
     90 % dos casos, e a real é em mediana 2 °C mais baixa.
     Por isso a PALAVRA («Calor de praia») continua a vir da aparente: é o
     veredicto do modelo sobre este factor e tem de continuar colada à nota.
     O número é o termómetro; a palavra é a nota. */
  function valorDoFactor(id, f, dp) {
    if (!f || f.valor == null) return '';
    switch (id) {
      /* «Sol: 82% de nuvens» era uma contradição em duas palavras. */
      case 'ceu':   return (100 - Math.round(f.valor)) + '%';
      case 'vento': return Math.round(f.valor) + ' km/h';
      case 'ar':    return Math.round(dp && dp.arReal != null ? dp.arReal : f.valor) + ' °C';
      case 'agua':  return num(f.valor, 1) + ' °C';
      case 'chuva': return Math.round(f.valor) + '%';
    }
    return '';
  }

  /* Os extras vêm do agregado DA PARTE e não do dia. É uma correcção de
     verdade: o painel antigo lia as rajadas, o termómetro e os milímetros do
     dia inteiro e mostrava-os por cima de colunas de manhã e de tarde — a
     mesma classe de mentira que repartir a água seria. A ondulação está aqui
     porque o avaliarDia a copiou do dia para dentro da parte ANTES de a
     pontuar: é o número que a conta usou. */
  function extraDoFactor(f, dp) {
    if (!dp) return '';
    if (f.id === 'vento' && dp.rajada) return 'rajadas até ' + Math.round(dp.rajada) + ' km/h';
    if (f.id === 'agua' && dp.ondas != null) {
      return M.palavrasOndas(dp.ondas).toLowerCase() + ' (' + num(dp.ondas, 1) + ' m)';
    }
    /* «ATÉ 2,2 mm» era mentira, e era a mentira que fazia a chuva parecer pouca:
       o `mm` do modelo é a SOMA da janela inteira (modelo.js, na agregação), não
       um tecto horário. Uma tarde com 2,2 mm ao todo é o que chega para o veto
       de «chuva a sério» — e medido contra o ERA5, quando o site prevê isso e
       diz que é pouco provável, choveu mesmo em 83% dos casos. Dizer «até»
       convidava a ler o veto como exagero. */
    if (f.id === 'chuva' && dp.mm) return num(dp.mm, 1) + ' mm ao todo';
    return '';
  }

  /* A LEI DO CARTÃO, feita ESTRUTURA e não vigilância: sem valor OU sem
     palavra, a linha inteira não sai. Não há caminho neste ficheiro que
     produza um número sem a palavra ao lado. */
  /* O TRIÂNGULO, na linha do valor mau e mais nada — pedido assim. Vai a
     `--amarelo`, que é a cor do DESCONFORTO neste cartão, e nunca a
     `--vermelho`, que é a da SEGURANÇA e vive no aviso de trovoada. São dois
     triângulos com dois significados, e o que os separa é a cor e a caixa:
     este anda solto ao lado de um nome, aquele vem dentro de uma caixa
     vermelha com texto a dizer «Aviso de segurança».
     Leva texto para quem ouve, porque um símbolo sozinho não diz nada a um
     leitor de ecrã — e a lei deste cartão é que nenhum número aparece sem a
     sua palavra. */
  var TRIANGULO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M12 4 21.5 20.5H2.5Z"/><path d="M12 10.5v4"/><path d="M12 17.6v.1"/></svg>';

  function linhaDoFactor(f, dp, fraco) {
    var v = valorDoFactor(f.id, f, dp);
    if (!v || !f.texto) return '';
    /* «Sem chuva à vista · 1,8 mm ao todo» é uma linha a contradizer-se, e o
       triângulo que agora a acompanha torna isso gritante. A palavra da chuva
       sai da PROBABILIDADE (abaixo de 10 % diz que não há chuva à vista) e os
       milímetros vêm de outro sítio. Se há milímetros previstos, não se pode
       dizer que não há chuva à vista. */
    var texto = f.texto;
    if (f.id === 'chuva' && dp && dp.mm > 0 && texto === 'Sem chuva à vista') {
      texto = 'Pode cair um aguaceiro';
    }
    /* Sem sufixos: «96% de céu limpo» e «0% de hipótese» eram três palavras a
       explicar um número que a linha já nomeou. A palavra por baixo diz o que
       o número quer dizer, e é para isso que ela existe. */
    var ex = extraDoFactor(f, dp);
    return '<li class="nums__linha' + (fraco ? ' nums__linha--fraco' : '') + '">'
      + '<span class="nums__icone" aria-hidden="true">' + (ICONES_FACTOR[f.id] || '') + '</span>'
      /* O texto para quem ouve fica FORA do `.nums__nome`, e é de propósito:
         dentro dele colava-se ao nome e qualquer código que lesse o nome
         recebia «Vento, ponto fraco». Apanhou-me duas vezes — a asserção da
         ordem dos factores e a guarda nova — e essas são as vezes em que dei
         por isso. O nome fica um nó limpo.
         E «ponto fraco» e não «é o que trava»: há linhas marcadas ao mesmo
         tempo, e aí o singular exclusivo seria mentira. */
      /* O TRIÂNGULO vai DENTRO do nome, para ficar na mesma linha que ele: dois
         itens de grelha na mesma coluna empilham um por baixo do outro, e foi
         o que aconteceu à primeira. Como é um SVG com aria-hidden, não
         acrescenta uma única letra ao `textContent` do nome.
         O TEXTO para quem ouve vai FORA, e é aí que está a diferença: lá
         dentro colava-se ao nome e quem lesse o nome recebia «Vento, ponto
         fraco». Apanhou-me duas vezes — a asserção da ordem dos factores e a
         guarda nova. É `position: absolute`, portanto não ocupa célula nenhuma.
         E «ponto fraco» e não «é o que trava»: há linhas marcadas ao mesmo
         tempo, e aí o singular exclusivo seria mentira. */
      + '<span class="nums__nome">' + esc(f.nome)
        + (fraco ? '<span class="nums__mau">' + TRIANGULO + '</span>' : '') + '</span>'
      + (fraco ? '<span class="visually-hidden">, ponto fraco</span>' : '')
      + '<span class="nums__valor">' + esc(v) + '</span>'
      + '<span class="nums__palavra">' + esc(texto)
        + (ex ? ' <span class="nums__extra">· ' + esc(ex) + '</span>' : '') + '</span>'
      + '</li>';
  }

  /* Um bloco só é botão se tiver mesmo alguma coisa para mostrar. Um botão que
     abre um painel vazio, ou cheio de travessões, é uma mentira. */
  function temNumeros(p) {
    return !!(p && p.v && p.v.factores && p.v.factores.some(function (f) {
      return f.valor != null && f.texto;
    }));
  }

  /* A ordem em que os factores se lêem. NÃO é a do peso na nota — o vento pesa
     34 e o sol 26 — mas é a ordem por que se pensa num dia de praia: primeiro
     olha-se para o céu, depois para o calor, e só depois para o vento.
     Por isso o painel também já não diz «por ordem do que mais pesa»: dizia-o
     quando a ordem era essa, e uma linha dessas por cima desta lista passaria
     a mentir. Quem quiser os pesos tem-nos na /metodologia/. */
  var ORDEM = ['ceu', 'ar', 'vento', 'agua', 'chuva'];

  /* QUAL DAS MÉTRICAS NÃO ESTÁ BOA. Era a pergunta que o painel não respondia:
     cinco linhas com cinco escalas diferentes — 83% de sol, 18 km/h de vento,
     30 °C — e ninguém tem de saber de cor qual é boa e qual é má.

     Houve aqui uma frase por cima da lista a nomear o culpado. Saiu a pedido: o
     que se quer é a MARCA na linha do valor mau, e mais nada.

     O corte é 0,40 e NÃO é um número novo: é o mesmo com que o modelo despromove
     um dia de verde para amarelo quando um factor sozinho está fraco de mais
     (modelo.js). Daí sai uma garantia que não é estatística, é a mesma condição
     escrita duas vezes: NUM BLOCO VERDE NUNCA APARECE MARCA NENHUMA. Um dia bom
     abre o painel exactamente como abria.

     Marcam-se TODOS os fracos e não só o pior: a pergunta é «qual dos valores
     não está bom», e num dia mau pode ser mais do que um.

     A ÁGUA entra, ao contrário do que o modelo faz no seu factor limitante —
     onde ela está de fora por uma razão que é sobre o DIA («o mar gelado impede
     o banho, não impede o dia de praia»). Aqui a marca é sobre O NÚMERO daquela
     linha, e uma água a 14 °C é um número mau, diga-se o que se disser sobre o
     dia. Medido em 11 550 partes-dia com água verdadeira: ela seria o pior dos
     cinco em 24% dos casos, e nunca era apontada. */
  var FRACO_RACIO = 0.40;

  /* E O QUE UM VETO NOMEIA, sempre. Sem isto havia um buraco que se via: o
     cartão dizia «O dia está chumbado: chuva a sério» e a linha da chuva ficava
     LIMPA. A razão é que a chuva se pontua pela PROBABILIDADE e o veto dispara
     pelos MILÍMETROS — 17% de hipótese dá rácio 0,76, muito acima do corte,
     enquanto os 2 mm acumulados chumbam o dia. Os milímetros nunca entram na
     nota, portanto o rácio nunca os podia ver.
     Entram os vetos da PARTE sempre, e os do DIA só quando esta parte contribui
     mesmo para eles. O dia pode chumbar com as duas partes sãs, porque os
     milímetros SOMAM-SE ao longo do dia — 1,2 mm de manhã e 1,2 à tarde passam
     as duas e o dia chumba nos 2 — e é justamente esse o caso em que a
     contradição aparecia. Mas se a chuva toda cair de manhã, uma tarde com
     0 mm não pode levar triângulo por cima de «Sem chuva à vista»: isso seria
     trocar uma contradição por outra.
     Os restantes vetos agregam-se por máximo ou mínimo, não por soma, portanto
     a parte que os provoca tem-nos como veto seu e já entra pela primeira via. */
  var VETO_FACTOR = {
    'chuva quase certa': 'chuva', 'chuva a sério': 'chuva',
    'vento demasiado forte': 'vento', 'rajadas perigosas': 'vento',
    'frio a mais': 'ar', 'mar muito cavado': 'agua'
  };

  function factoresVetados(p, a) {
    var fora = {};
    ((p && p.v && p.v.vetos) || []).forEach(function (t) {
      if (VETO_FACTOR[t]) fora[VETO_FACTOR[t]] = 1;
    });
    /* O VETO DO DIA SÓ DESCE ÀS PARTES SE NENHUMA JÁ O CARREGAR. É a mesma
       regra da nota, aplicada à marca: a chuva soma-se ao longo do dia, e um
       dia pode chumbar com as duas metades sãs — nesse caso a marca tem de
       aparecer algures, e desce. Mas quando UMA das partes já está vetada pela
       chuva, descer também à outra é acusar duas vezes o mesmo: dava um
       triângulo na Chuva de uma tarde verde com 0,1 mm ao todo, ao lado de uma
       manhã já vetada. Abaixo de FRACO_MM a chuva daquela parte não chega para
       a marcar por si — foi isso que os 16 128 partes-dia mediram.

       A CONDIÇÃO É SÓ `jaMarcada[id]`, e esteve mais complicada do que devia:
       tinha pendurado um `&& !(p.v.vetos.length)`, na ideia de não roubar as
       marcas a uma parte vetada. Mas isso deixava uma parte com um veto de
       VENTO herdar também o de CHUVA do dia — e a guarda apanhou-o, numa tarde
       com 0,1 mm ao lado de uma manhã com 0,5 mm. As marcas próprias da parte
       já entraram no `forEach` de cima; esta passagem só trata das do dia. */
    var jaMarcada = {};
    ((a && a.partes) || []).forEach(function (q) {
      ((q.v && q.v.vetos) || []).forEach(function (t) {
        if (VETO_FACTOR[t]) jaMarcada[VETO_FACTOR[t]] = 1;
      });
      if (q.d && q.d.mm >= FRACO_MM) jaMarcada.chuva = 1;
    });
    ((a && a.v && a.v.vetos) || []).forEach(function (t) {
      var id = VETO_FACTOR[t];
      if (!id) return;
      if (jaMarcada[id]) return;
      if (id === 'chuva' && !(p && p.d && p.d.mm > 0)) return;   /* esta parte não deu chuva nenhuma */
      fora[id] = 1;
    });
    return fora;
  }

  /* E MILÍMETROS BASTANTES, mesmo sem veto. A chuva pontua-se pela
     PROBABILIDADE, e 12% de hipótese dá rácio alto — mas «0,8 mm ao todo» é
     água a cair em cima de quem lá está. Sem isto, uma tarde com chuva prevista
     e sem veto ficava sem marca nenhuma.

     0,5 mm não é um número escolhido a gosto. Medido em 16 128 partes-dia
     (16 praias, Maio a Outubro de 2023, 2024 e 2025, previsão arquivada dos
     mesmos quatro modelos contra o que o ERA5 registou):

        mm previstos   parte-dia acabou com >= 0,5 mm
        zero                 0,7 %
        0 a 0,3             23,9 %
        0,3 a 0,8           49,8 %
        0,8 a 1,5           64,1 %
        1,5 a 2             77,4 %
        2 ou mais           93,2 %   <- é aqui que o veto dispara

     O joelho está nos 0,5: acima disso acerta 75% e marca 7,0% das partes-dia.
     A 0,2 marcaria 11,1% e acertaria 63,2% — demasiada marca para o que diz. */
  var FRACO_MM = 0.5;

  function eFraco(f, vetados, dp) {
    if (!f) return false;
    if (vetados && vetados[f.id]) return true;
    if (f.id === 'chuva' && dp && dp.mm >= FRACO_MM) return true;
    return !!(f.pontos != null && f.peso && (f.pontos / f.peso) < FRACO_RACIO);
  }

  function numerosDaParte(p, a) {
    /* Os que não estão na ORDEM vão para o fim em vez de desaparecerem. Uma
       lista de ids escrita à mão é uma armadilha: no dia em que alguém
       renomear um factor, ou acrescentar um sexto, esta linha impede que ele
       se evapore do ecrã em silêncio. */
    var fs = p.v.factores.slice().sort(function (x, y) {
      var ix = ORDEM.indexOf(x.id), iy = ORDEM.indexOf(y.id);
      return (ix < 0 ? ORDEM.length : ix) - (iy < 0 ? ORDEM.length : iy);
    });
    var vetados = factoresVetados(p, a);
    return '<ul class="nums" role="list">'
      + fs.map(function (f) { return linhaDoFactor(f, p.d, eFraco(f, vetados, p.d)); }).join('')
      + '</ul><p class="nums__ordem">'
      + '<a href="/metodologia/">Como isto decide</a></p>';
  }

  function aplicarAbertura() {
    var caixa = el('v-partes');
    if (!caixa) return;
    var cabs = caixa.querySelectorAll('button.bloco__cabeca');
    for (var i = 0; i < cabs.length; i++) {
      var li = cabs[i].parentNode;
      var painel = li.querySelector('.bloco__numeros');
      var aberto = li.getAttribute('data-parte') === parteAberta;
      cabs[i].setAttribute('aria-expanded', aberto ? 'true' : 'false');
      /* `hidden` e não altura zero nem visibility: fica fora da árvore de
         acessibilidade e fora do Tab, e o [hidden]{display:none!important}
         garante-o mesmo contra uma regra de autor. */
      if (painel) painel.hidden = !aberto;
    }
    var pista = el('v-pista');
    if (!pista) return;
    /* O convite desaparece assim que um bloco abre — já não tem nada a dizer —
       e nunca aparece num dia em que não haja nada para abrir. */
    pista.hidden = !cabs.length || !!caixa.querySelector('.bloco__numeros:not([hidden])');
  }

  on('v-partes', 'click', function (e) {
    var b = e.target.closest && e.target.closest('button.bloco__cabeca');
    if (!b) return;
    /* NÃO se mexe no scroll da página. Houve aqui um `window.scrollBy` a
       compensar a diferença de altura, para o bloco tocado ficar no mesmo
       píxel. Fazia duas coisas erradas ao mesmo tempo, e as duas medidas:

         · atirava o ecrã inteiro. Com a manhã aberta, tocar na tarde dava
           `scrollY` −248 no telemóvel e −291 no computador, e o nome da praia
           saltava para baixo esses mesmos pixéis. Era isto que se via.
         · e nem chegava ao alvo: pedia 374 px de compensação com 248 de scroll
           acima, ficava cortado no limite, e a cabeça tocada ainda fugia 126.

       Sem ele o ecrã fica onde está, sempre. O que se move é o CONTEÚDO — o
       bloco da tarde sobe para o lugar que a manhã deixou —, que é o que um
       acordeão faz e o que toda a gente já viu fazer. */
    var id = b.parentNode.getAttribute('data-parte');
    parteAberta = (parteAberta === id) ? null : id;
    aplicarAbertura();
  });

  /* Escape com o foco no bloco ou dentro do painel (há lá um link) fecha e
     devolve o foco à cabeça. As setas NÃO são apanhadas aqui: pertencem à tira
     dos dias, e é lá que estão. */
  on('v-partes', 'keydown', function (e) {
    if (e.key !== 'Escape' || !parteAberta) return;
    var b = el('cab-' + parteAberta);
    parteAberta = null;
    aplicarAbertura();
    if (b) b.focus();
  });

  /* SÓ quando não há mar. A atribuição aos dados, que partilhava esta linha,
     passou para o rodapé da página — a licença da Open-Meteo exige que a
     atribuição exista e se veja, não que esteja dentro do cartão, e o rodapé
     leva também a referência ao DWD que a documentação marinha pede.
     O que fica é a única parte que era informação sobre ESTA praia: sem ela, a
     ausência do factor «Água do mar» lá dentro dos números lê-se como avaria. */
  function desenharSemMar() {
    var p = el('v-sem-mar'), d = dias[diaEscolhido];
    if (!p) return;
    if (!d) { p.textContent = ''; p.removeAttribute('data-k'); return; }
    /* A chave existe porque isto vive dentro de uma região aria-live="polite":
       reescrever a mesma frase a cada mudança de dia fazia o leitor de ecrã
       repeti-la seis vezes a percorrer a semana. */
    var k = (d.mar ? '1' : '0') + (d.agua == null ? '0' : '1');
    if (p.getAttribute('data-k') === k) return;
    p.textContent = !d.mar
      ? 'Esta é uma praia de rio: não há dados de temperatura da água nem de ondulação.'
      : (d.agua == null ? 'Não há dados de mar para este ponto.' : '');
    p.setAttribute('data-k', k);
  }

  /* ---------------------------------------------------------- favoritos */

  var F = window.Favoritos;
  var coresFav = {};        /* id da praia -> cor de hoje, durante esta visita */
  var LEGENDA = { verde: 'hoje vai dar praia', amarelo: 'hoje assim-assim', vermelho: 'hoje não vale a pena' };

  /* Nome curto para o chip: «Praia de Matosinhos» não cabe seis vezes numa
     tira de telemóvel, e quem a guardou sabe bem qual é. */
  function curto(n) {
    return n.replace(/^Praia (Fluvial )?(da |de |do |dos |das )?/, '').replace(/^Prainha d[ao] /, '');
  }

  function desenharEstrela() {
    var b = el('v-estrela');
    if (!praiaActual) return;
    var marcada = F.tem(praiaActual);
    b.setAttribute('aria-pressed', marcada ? 'true' : 'false');
    el('v-estrela-texto').textContent = marcada ? 'Guardada' : 'Guardar';
    /* O rótulo nomeia o OBJECTO, não a acção. Com «Remover…» mais
       aria-pressed="true" o leitor de ecrã dizia «Remover Carcavelos das tuas
       praias, botão, premido» — e ninguém percebe se acabou de guardar ou de
       apagar. Fixo no objecto, lê-se «Guardar Carcavelos…, premido». */
    b.setAttribute('aria-label', 'Guardar ' + praiaActual.n + ' nas tuas praias');
  }

  on('v-estrela', 'click', function () {
    if (!praiaActual) return;
    var r = F.alternar(praiaActual);
    /* Quando dá 'cheio' nada muda, e portanto o F.aoMudar não dispara: sem esta
       mensagem quem não vê carregava na estrela e não recebia retorno nenhum. */
    avisar(r === 'cheio'
      ? 'Já tens ' + F.limite + ' praias guardadas. Tira uma da lista para guardares esta.'
      : '');
    if (r === 'cheio') { desenharEstrela(); desenharFavoritos(); }
  });

  function desenharFavoritos() {
    var arr = PRAIAS.length ? F.resolver(PRAIAS) : [];
    el('favoritos').hidden = !arr.length;
    if (!arr.length) return;
    el('favoritos-lista').innerHTML = arr.map(function (p) {
      var k = F.id(p), cor = coresFav[k];
      var aqui = praiaActual && F.id(praiaActual) === k;
      return '<li>' +
        '<button class="fav' + (cor ? ' fav--' + cor : '') + '" type="button" data-id="' + esc(k) + '"' +
        (aqui ? ' aria-current="true"' : '') +
        ' aria-label="' + esc(p.n + (p.m ? '' : ', praia de rio') + (cor ? ', ' + LEGENDA[cor] : '')) + '">' +
        /* A cor sozinha não chega (WCAG 1.4.1): cada veredicto tem a mesma
           FORMA que tem no cartão grande — sol, sol com nuvem, chuva. */
        '<span class="fav__ponto" aria-hidden="true">' + (cor ? ICONES[cor] : '') + '</span>' +
        '<span class="fav__nome">' + esc(curto(p.n)) + '</span>' +
        /* Numa praia de rio não entra a temperatura da água, e por isso a nota
           sai ~6 pontos acima da de uma praia de mar com o mesmo tempo. Lado a
           lado numa tira, isso enganaria sem esta marca. */
        (p.m ? '' : '<span class="fav__rio" aria-hidden="true">rio</span>') +
        '</button></li>';
    }).join('');
  }

  on('favoritos-lista', 'click', function (e) {
    var b = e.target.closest('.fav');
    if (!b) return;
    var p = PRAIAS.find(function (x) { return F.id(x) === b.dataset.id; });
    if (p) escolher(p);
  });

  /* Todas as cores em falta num único par de pedidos, em vez de um par por
     praia: a Open-Meteo aceita várias coordenadas de uma vez. */
  function coresDosFavoritos() {
    var arr = PRAIAS.length ? F.resolver(PRAIAS) : [];
    var falta = arr.filter(function (p) { return !coresFav[F.id(p)]; });
    if (!falta.length) return;
    var mar = falta.filter(function (p) { return p.m; });

    Promise.all([
      buscar(urlTempo(falta, 1), true).catch(function () { return null; }),
      mar.length ? buscar(urlMar(mar, 1), true).catch(function () { return null; }) : Promise.resolve(null)
    ]).then(function (r) {
      var tempo = comoArray(r[0]), marinho = comoArray(r[1]);
      if (!tempo.length) return;
      var porMar = {};
      mar.forEach(function (p, i) { porMar[F.id(p)] = marinho[i] || null; });
      falta.forEach(function (p, i) {
        if (!tempo[i]) return;
        try {
          var d = M.agregar(M.consenso(tempo[i], MODELOS), porMar[F.id(p)], p);
          if (d && d[0]) coresFav[F.id(p)] = M.classificarDia(d[0]).cor;
        } catch (e) { }
      });
      desenharFavoritos();
    });
  }

  /* -------------------------------------------------------------- conta */

  var C = window.Conta;

  function desenharConta() {
    /* As páginas de praia não vão ter a caixa da conta. Sem esta guarda, a
       primeira linha rebentava e levava atrás tudo o que corre depois. */
    if (!el('conta')) return;
    var quem = C.quem();
    el('conta-entrar').hidden = !!quem || !C.disponivel();
    /* Sem nada para mostrar, não se reserva a altura: só faz sentido guardá-la
       para o caso em que algo vai mesmo aparecer. */
    el('conta').classList.toggle('conta--vazia', !quem && !C.disponivel());
    el('conta-menu').hidden = !quem;
    if (!quem) { el('conta-menu').open = false; return; }
    var nome = quem.nome || quem.email || '';
    el('conta-inicial').textContent = (nome.trim()[0] || '?').toUpperCase();
    el('conta-nome').textContent = nome;
    el('conta-email').textContent = quem.email && quem.email !== nome ? quem.email : '';
    el('conta-menu').querySelector('summary').setAttribute('aria-label', 'A tua conta: ' + nome);
  }

  on('conta-entrar', 'click', function () {
    this.disabled = true;
    /* Antes de sair da página, guarda a lista que existe agora: é ela que
       volta se a pessoa terminar sessão neste aparelho. */
    F.guardarAntesDeEntrar();
    C.entrar().catch(function (e) {
      el('conta-entrar').disabled = false;
      estado.textContent = e && e.message === 'armazenamento-bloqueado'
        ? 'O teu browser está a bloquear o armazenamento e sem ele não é possível entrar. Experimenta fora da navegação privada.'
        : 'Não conseguimos abrir a entrada com o Google. Tenta outra vez.';
    });
  });

  /* Depois de terminar sessão, o aparelho não pode ficar com as praias da
     conta: num computador partilhado, a pessoa seguinte carregava-as para a
     conta dela sem nunca as ter marcado. */
  function fecharSessao(msg) {
    F.reporDeAntesDeEntrar();
    desenharConta();
    desenharEstrela();
    desenharFavoritos();
    coresDosFavoritos();
    estado.textContent = msg;
    var alvo = C.disponivel() ? el('conta-entrar') : el('procura');
    if (alvo) alvo.focus();
  }

  on('conta-sair', 'click', function () {
    C.sair().then(function () { fecharSessao('Sessão terminada.'); });
  });

  /* ------------------------------------------------------------- perfil */

  /* Quem abriu o painel, para lhe devolver o foco ao fechar: um `<dialog>`
     devolve-o sozinho, mas só quando é ele a fechar-se — e aqui há dois
     encadeados, e um deles termina com a sessão fechada e o avatar já
     desaparecido do ecrã. */
  var focoAntesDoPainel = null;

  function abrirPainel(id) {
    var d = el(id);
    focoAntesDoPainel = doc.activeElement;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');          /* sem <dialog>: fica inline, mas abre */
  }
  function fecharPainel(id) {
    var d = el(id);
    if (typeof d.close === 'function' && d.open) d.close();
    else d.removeAttribute('open');
  }

  function desenharPerfil() {
    var quem = C.quem();
    if (!quem) return;
    var nome = quem.nome || quem.email || '';
    el('perfil-nome').textContent = nome;
    el('perfil-email').textContent = quem.email && quem.email !== nome ? quem.email : '';
    var n = F.lista().length;
    el('perfil-quantas').textContent = n === 0 ? 'Nenhuma praia guardada'
      : (n === 1 ? '1 praia guardada' : n + ' praias guardadas');
  }

  on('conta-perfil', 'click', function () {
    el('conta-menu').open = false;
    desenharPerfil();
    abrirPainel('perfil');
  });
  on('perfil-fechar', 'click', function () { fecharPainel('perfil'); });
  /* Clicar fora, no backdrop: o clique cai no próprio <dialog>, porque o corpo
     está num filho. Sem isto só se fechava pelo X ou pelo Escape. */
  on('perfil', 'click', function (e) {
    if (e.target === this) fecharPainel('perfil');
  });
  on('perfil', 'close', function () {
    if (focoAntesDoPainel && doc.contains(focoAntesDoPainel)) focoAntesDoPainel.focus();
  });

  /* Apagar é irreversível, e o texto tem de dizer o que apaga mesmo — a versão
     anterior falava só das praias e a operação apaga a conta inteira. A
     confirmação é um painel e não o `confirm()` do browser: o nativo aparece
     desenraizado da página, no telemóvel dá-se-lhe «OK» sem ler, e em algumas
     situações o browser simplesmente não o mostra. */
  on('conta-apagar', 'click', function () {
    abrirPainel('confirmar');
  });
  on('confirmar-nao', 'click', function () { fecharPainel('confirmar'); });
  on('confirmar', 'click', function (e) {
    if (e.target === this) fecharPainel('confirmar');
  });

  on('confirmar-sim', 'click', function () {
    var b = this, nao = el('confirmar-nao'), texto = el('confirmar-texto');
    b.disabled = nao.disabled = true;
    b.textContent = 'A apagar…';
    C.apagarConta().then(function () {
      fecharPainel('confirmar');
      fecharPainel('perfil');
      fecharSessao('Conta apagada.');
    }).catch(function () {
      /* A falha fica dentro do painel: um `alert()` por cima de um diálogo é
         um empilhamento que ninguém percebe, e o painel é onde a pessoa está. */
      texto.textContent = 'Não conseguimos apagar agora. Tenta outra vez daqui a pouco.';
    }).then(function () {
      b.disabled = nao.disabled = false;
      b.textContent = 'Apagar para sempre';
    });
  });

  /* Um <details> não fecha sozinho: sem isto o menu da conta ficava aberto por
     cima da página até se voltar a carregar no avatar. */
  doc.addEventListener('click', function (e) {
    if (!e.target.closest('#conta')) el('conta-menu').open = false;
  });
  /* Idem para o menu da conta: sair dele com Tab deixava-o aberto por cima da
     página, com o foco a andar por baixo. */
  doc.addEventListener('focusout', function (e) {
    if (!e.target.closest || !e.target.closest('#conta')) return;
    var vai = e.relatedTarget;
    if (vai && vai.closest && vai.closest('#conta')) return;
    var m = el('conta-menu'); if (m) m.open = false;
  });
  doc.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var m = el('conta-menu');
    if (!m.open) return;
    m.open = false;
    m.querySelector('summary').focus();
  });

  function avisar(texto) {
    var av = el('favoritos-aviso');
    av.textContent = texto || '';
    av.hidden = !texto;
  }

  /* Entrar não substitui: junta. Quem marcou praias no telemóvel sem conta
     não as pode perder por ter entrado no computador. */
  function sincronizar() {
    if (!C.activa()) return Promise.resolve();
    /* Primeiro cumprem-se as operações que ficaram por fazer da última vez —
       sobretudo as remoções, senão a praia que a pessoa tirou reaparece. Só
       depois se lê a conta, que a esta altura já está certa. */
    return C.drenar().then(function () { return C.lerNuvem(); }).then(function (naConta) {
      naConta = naConta || [];
      /* O que ainda estiver por apagar não pode voltar a entrar pela fusão. */
      var porApagar = {};
      C.pendentes().forEach(function (o) { if (o.op === 'del') porApagar[o.id] = 1; });
      /* E o que está por apagar mas já não está na conta está cumprido: sai da
         fila, senão ficava a ser tentado em cada arranque para sempre. */
      var estaNaConta = {};
      naConta.forEach(function (x) { estaNaConta[x.praia_id] = 1; });
      C.esquecerRemocoes(Object.keys(porApagar).filter(function (id) { return !estaNaConta[id]; }));
      var nuvem = naConta.filter(function (x) { return !porApagar[x.praia_id]; });
      /* A fusão lê a lista DENTRO do then, e não antes do pedido: uma estrela
         marcada durante a ida-e-volta à rede seria escrita por cima. */
      var daConta = (nuvem || []).map(function (x) {
        return { id: x.praia_id, n: x.nome, t: Date.parse(x.criado_em) || 1 };
      });
      /* Da primeira vez nesta conta e neste aparelho, junta — é o que salva as
         praias marcadas antes de entrar. Daí para a frente manda a conta, senão
         uma praia apagada noutro aparelho era ressuscitada aqui pela união e
         voltava a subir. O que está na fila para subir é protegido: ainda não
         chegou à conta, e não é o mesmo que ter sido apagado. */
      var porSubir = C.pendentes().filter(function (o) { return o.op === 'add'; })
                                  .map(function (o) { return o.id; });
      var r;
      if (C.jaFundiu()) {
        r = F.substituir(daConta, porSubir);
      } else {
        r = F.fundir(daConta);
        C.marcarFundido();
      }
      desenharEstrela();
      desenharFavoritos();
      coresDosFavoritos();

      if (r.deixados.length) {
        avisar('Tens mais de ' + F.limite + ' praias entre este aparelho e a tua conta. '
             + 'Ficaram de fora as ' + r.deixados.length + ' mais antigas.');
      }

      /* Sobe o que só existia aqui, sem passar do limite do lado de lá. */
      var naNuvem = {};
      (nuvem || []).forEach(function (x) { naNuvem[x.praia_id] = 1; });
      var subir = F.lista().filter(function (x) { return !naNuvem[x.id]; })
                           .slice(0, Math.max(0, F.limite - (nuvem || []).length));
      if (!subir.length) return null;
      return C.juntarNuvem(subir).catch(function () {
        avisar('Guardámos as praias neste aparelho, mas não conseguimos pô-las na tua conta.');
      });
    });
  }

  /* Dois papéis diferentes, e antes estavam colados: o desenho tem de acontecer
     SEMPRE que a lista muda — também quando muda por fusão ou por outro
     separador — senão a estrela fica a mostrar o estado anterior e o clique
     seguinte apaga onde a pessoa queria guardar. Subir para a nuvem é que só
     acontece numa mudança deliberada e com sessão aberta. */
  F.aoMudar(function (itens, mudanca) {
    desenharEstrela();
    desenharFavoritos();
    if (!mudanca || !C.activa()) return;
    var p = mudanca.tipo === 'marcada'
      ? C.juntarNuvem([{ id: mudanca.id, n: mudanca.n }])
      : C.apagarNuvem(mudanca.id);
    p.then(function () {
      /* Cumprido: o que estivesse na fila para esta praia já não faz sentido.
         Sem isto, um 'add' que ficou de uma falha de rede sobrevivia a uma
         remoção bem-sucedida, e o drenar() do arranque seguinte voltava a
         inserir a praia na conta. */
      C.cumprido(mudanca.id);
    }).catch(function () {
      /* Fica na fila em vez de se perder: tenta-se outra vez no arranque
         seguinte, e até lá a fusão respeita esta intenção. */
      C.adiar({ op: mudanca.tipo === 'marcada' ? 'add' : 'del', id: mudanca.id, n: mudanca.n });
      /* Sem aviso, de propósito: para quem marca a praia, a estrela já mudou e
         a praia já está na tira — a sincronização é problema nosso, não dela.
         A fila em cima é que garante que não se perde. */
    });
  });

  /* Sem isto, uma sessão que morre a meio da visita continuava a aparecer como
     activa no cabeçalho até alguém recarregar a página. */
  C.aoMudar(function () { desenharConta(); });

  /* ------------------------------------------------------------ arranque */

  /* O nome não identifica uma praia: há quatro «Praia dos Pescadores». O link
     partilhado continua legível, mas leva a coordenada quando é preciso. */
  function endereco(p) {
    var repetido = PRAIAS.filter(function (x) { return x.n === p.n; }).length > 1;
    return encodeURIComponent(p.n) + (repetido ? '@' + F.id(p) : '');
  }
  function doEndereco(h) {
    if (!h) return null;
    var k = h.lastIndexOf('@');
    var nome = decodeURIComponent(k > 0 ? h.slice(0, k) : h);
    var coord = k > 0 ? h.slice(k + 1) : '';
    return PRAIAS.find(function (x) { return x.n === nome && (!coord || F.id(x) === coord); })
        || PRAIAS.find(function (x) { return x.n === nome; }) || null;
  }

  /* O que fica por cumprir enquanto a lista de praias não chegou. Quem carrega
     num atalho nos primeiros instantes clicava no vazio; agora a intenção
     fica guardada e cumpre-se assim que o fetch acabar. */
  var atalhoPendente = null;

  /* Os botões já vêm escritos no index.html — este ficheiro deixou de os
     montar. Eram a última coisa a aparecer e empurravam a página com ela já à
     vista. A chave passou a ser a coordenada (F.id) em vez do índice em
     PRAIAS, porque esse índice não existe antes do ficheiro ter chegado. */
  function atalhos() {
    on('atalhos', 'click', function (e) {
      var b = e.target.closest('.atalho');
      if (!b) return;
      var p = porId(b.dataset.id);
      if (p) escolher(p); else atalhoPendente = b.dataset.id;
    });
  }
  function porId(id) {
    if (!id || !PRAIAS.length) return null;
    return PRAIAS.find(function (x) { return F.id(x) === id; }) || null;
  }

  /* Ligado ANTES do fetch, e já não lá dentro: os botões estão no HTML desde o
     primeiro instante, e sem isto um clique nesses instantes não fazia nada. */
  atalhos();


  /* =========================================================== ONDE FICA ===
     Desenha o contorno dos concelhos à volta da praia, em SVG, a partir de
     /data/mapa.json. Sem tiles e sem pedidos a terceiros: um mapa de tiles
     manda o IP de quem visita para um servidor de outra pessoa a cada
     quadrado, e este site promete que não segue ninguém entre sites.

     Os polígonos da CAOP acabam na linha de costa, por isso o fundo da tela é
     o mar e as formas são a terra — o litoral desenha-se sozinho. */

  var MAPA = null, mapaPedido = null;

  function carregarMapa() {
    if (mapaPedido) return mapaPedido;
    mapaPedido = fetch('/data/mapa.json')
      .then(function (r) { return r.json(); })
      .then(function (d) { MAPA = d; return d; })
      .catch(function () { MAPA = null; return null; });
    return mapaPedido;
  }

  /* Meia-largura da vista, em graus de longitude. 0,26 dá ~44 km a 40° de
     latitude: chega para se ver a praia, a costa e os concelhos à volta. */
  var MAPA_MEIA = 0.26;
  var MAPA_W = 640, MAPA_H = 420;

  function desenharMapa(praia) {
    var caixa = el('mapa'), tela = el('mapa-tela');
    if (!caixa || !tela || !MAPA) return;

    var lat = praia.la, lon = praia.lo;
    var kx = Math.cos(lat * Math.PI / 180);          /* graus de lon são mais curtos */
    var meiaLon = MAPA_MEIA, meiaLat = meiaLon * kx * (MAPA_H / MAPA_W);
    var x0 = lon - meiaLon, x1 = lon + meiaLon;
    var y0 = lat - meiaLat, y1 = lat + meiaLat;
    var px = function (lo) { return (lo - x0) / (x1 - x0) * MAPA_W; };
    var py = function (la) { return (1 - (la - y0) / (y1 - y0)) * MAPA_H; };

    var formas = [], rotulos = [];
    MAPA.concelhos.forEach(function (c) {
      var b = c.b;
      if (b[2] < x0 || b[0] > x1 || b[3] < y0 || b[1] > y1) return;   /* fora da vista */
      c.f.forEach(function (anel) {
        var d = '';
        for (var i = 0; i < anel.length; i++) {
          d += (i ? 'L' : 'M') + px(anel[i][0]).toFixed(1) + ' ' + py(anel[i][1]).toFixed(1);
        }
        formas.push('<path class="m-terra" d="' + d + 'Z"/>');
      });
      /* O rótulo vai ao centro da caixa, limitado à parte visível: um concelho
         que entra pela borda deve escrever o nome DENTRO da tela, não fora. */
      var cx = px(Math.min(x1, Math.max(x0, (Math.max(b[0], x0) + Math.min(b[2], x1)) / 2)));
      var cy = py(Math.min(y1, Math.max(y0, (Math.max(b[1], y0) + Math.min(b[3], y1)) / 2)));
      if (cy < 20 || cy > MAPA_H - 14) return;
      /* Meia largura do nome, estimada. Sem isto a verificação olhava só para
         o CENTRO do texto, e «Oliveira de Azeméis» — 19 letras — saía pela
         borda com o centro ainda dentro da tela. */
      /* 5,4 px por letra: são MAIÚSCULAS a negrito a 15 px. Com 4,4 — a
         estimativa de minúsculas — o «AROUCA» ainda saía pela borda. */
      var meia = c.n.length * 5.4;
      if (cx - meia < 4 || cx + meia > MAPA_W - 4) {
        cx = Math.min(MAPA_W - 4 - meia, Math.max(4 + meia, cx));
        if (cx - meia < 4) return;      /* nome maior do que a tela: desiste */
      }
      rotulos.push({ n: c.n, x: cx, y: cy, meia: meia });
    });

    /* Nomes a mais numa tela pequena é ruído. Fica-se pelos que não se tocam,
       e os primeiros são os concelhos maiores — o ficheiro já vem por tamanho. */
    var postos = [];
    rotulos.forEach(function (r) {
      if (postos.length >= 6) return;
      for (var i = 0; i < postos.length; i++) {
        /* Sobreposição a sério: compara as larguras dos dois nomes, e não uma
           distância fixa que trata «Ovar» como se fosse «Vila Nova de Gaia». */
        if (Math.abs(postos[i].x - r.x) < postos[i].meia + r.meia + 12
            && Math.abs(postos[i].y - r.y) < 30) return;
      }
      postos.push(r);
    });

    var pontoX = px(lon), pontoY = py(lat);
    var svg = '<svg viewBox="0 0 ' + MAPA_W + ' ' + MAPA_H + '" role="img" aria-label="'
      + esc('Mapa: ' + praia.n + ' fica no litoral, com os concelhos à volta assinalados.') + '">'
      + '<rect class="m-mar" width="' + MAPA_W + '" height="' + MAPA_H + '"/>'
      + formas.join('')
      + postos.map(function (r) {
          return '<text class="m-nome" x="' + r.x.toFixed(0) + '" y="' + r.y.toFixed(0)
            + '" font-size="15">' + esc(r.n.toUpperCase()) + '</text>';
        }).join('')
      + '<circle class="m-halo" cx="' + pontoX.toFixed(1) + '" cy="' + pontoY.toFixed(1) + '" r="18"/>'
      + '<circle class="m-ponto" cx="' + pontoX.toFixed(1) + '" cy="' + pontoY.toFixed(1) + '" r="7"/>'
      + '</svg>';

    tela.innerHTML = svg;
    /* A atribuição da CAOP é obrigatória pela licença e vive no rodapé, ao pé
       das outras duas. Debaixo do mapa era uma linha que ninguém lê e que
       roubava espaço ao que interessa. */
    caixa.hidden = false;
  }

  function mostrarMapa(praia) {
    var caixa = el('mapa');
    if (!caixa) return;
    if (MAPA) { desenharMapa(praia); return; }
    /* Só se pede o ficheiro quando alguém escolhe uma praia: a página de
       entrada não paga os 78 KB de quem nunca chega aqui. */
    carregarMapa().then(function () {
      if (MAPA && praiaActual === praia) desenharMapa(praia);
    });
  }

  /* A troca do código do Google não depende da lista de praias para nada, e
     estava presa ao mesmo .then: se o praias.json falhasse — deploy a meio,
     cache a devolver 404 em HTML, rede fraca — o código OAuth expirava sem ser
     trocado e a entrada falhava por uma razão sem relação nenhuma. */
  var regresso = C.tratarRegresso()
    .catch(function () {
      estado.textContent = 'Não conseguimos concluir a entrada. Tenta outra vez.';
      return null;
    })
    .then(function () { desenharConta(); });

  /* Absoluto, e é a única linha do ficheiro com um pedido relativo. De uma
     página em /praia/x/ isto ia pedir /praia/x/data/praias.json e dar 404 —
     com a agravante de o GitHub Pages devolver HTML no 404, portanto o erro
     que aparecia era um SyntaxError de JSON, que não diz nada a ninguém.
     Tem de continuar igual, letra a letra, ao href do <link rel=preload>. */
  fetch('/data/praias.json')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      /* O CAMPO DE PROCURA DERIVA-SE AQUI, e não vem no ficheiro. Era
         exactamente `normalizar(n)` nos 996 registos — zero divergências,
         verificado — portanto viajava em cada visita para dizer o que esta
         linha calcula em menos de um milissegundo. Tirá-lo do ficheiro poupa
         6,1 KB comprimidos, 28 % do total, e é isso que paga acrescentar
         sítios interiores sem o ficheiro engordar.
         Tem de ser a MESMA `normalizar()` que a procura usa — é ela, está
         umas linhas acima — senão o que se escreve e o que se procura deixam
         de bater certo. E não se pode «corrigir» essa função sem regenerar
         isto: o SEO.md avisa que ela produz espaços a dobrar e que arranjá-la
         parte a procura. */
      /* E O CAMPO `a` ENTRA NA PROCURA. É a lista dos nomes oficiais da APA
         que não são o nome que o cartão mostra — «Esmoriz» na Praia Velha,
         «Rocha Baixinha» na Praia da Falésia. Sem isto, quem escreve o nome
         que está na bandeira azul e no edital não encontra nada, que foi
         exactamente o que aconteceu a quem foi procurar a Praia de Esmoriz. */
      for (var i = 0; i < d.length; i++) {
        if (d[i].b == null) d[i].b = normalizar(d[i].n + (d[i].a ? ' ' + d[i].a : ''));
        /* E O COMPRIMENTO DO NOME À PARTE. A procura desempata a favor do nome
           mais curto — quem escreve «praia» quer a «Praia» e não a «Praia
           Grande de Porto Côvo» —, e media isso pelo campo de busca inteiro.
           Com os nomes oficiais lá dentro, o campo de busca de uma praia com
           três nomes oficiais passou a ser três vezes mais comprido do que o
           nome dela, e ela caía no fim da lista por causa de palavras que nem
           sequer aparecem no ecrã. O desempate é entre NOMES. */
        if (d[i].bl == null) d[i].bl = normalizar(d[i].n).length;
      }
      PRAIAS = d;
      desenharFavoritos();
      /* A troca do código já foi feita no arranque, fora desta cadeia. Aqui só
         falta juntar as listas, que precisa das praias carregadas.
         Fica ANTES da escolha da praia e nunca depois de um `return`: é o que
         sincroniza os favoritos com a conta, e não tem nada que ver com qual é
         a praia que se vai abrir. */
      regresso
        .then(function () { return sincronizar().catch(function () { }); })
        .then(function () { coresDosFavoritos(); });

      /* Um atalho carregado antes de a lista ter chegado fica à espera aqui, e
         ganha a quem for: foi um clique de agora, contra uma praia guardada da
         última visita. */
      var p = null;
      if (atalhoPendente) { p = porId(atalhoPendente); atalhoPendente = null; }
      if (p) { escolher(p); return; }

      /* Volta à última praia: quem abre isto abre-o quase sempre para a mesma. */
      p = doEndereco((location.hash || '').slice(1));
      if (!p) {
        try {
          var g = JSON.parse(localStorage.getItem('pm:praia') || '{}');
          p = (g.id && PRAIAS.find(function (x) { return F.id(x) === g.id; }))
              || (g.n && PRAIAS.find(function (x) { return x.n === g.n; })) || null;
        } catch (e) { }
      }
      if (p) escolher(p, true);
    })
    .catch(function () {
      estado.textContent = 'Não conseguimos carregar a lista de praias.';
    });

  /* «Já passou» sem mentir num separador aberto desde o almoço. A resposta da
     API fica em cache 30 minutos, portanto sem isto o cartão continuaria a
     dizer às 18h que a manhã ainda não passou. Sem `setInterval`: só se
     redesenha quando a pessoa volta ao separador E a hora mudou desde o último
     desenho. A hora só afecta o RODAPÉ das partes — uma classe e uma palavra —
     e nunca a forma, para o desenho ser o mesmo a qualquer hora do dia. */
  doc.addEventListener('visibilitychange', function () {
    if (doc.hidden || !dias.length) return;
    if (new Date().getHours() !== horaDesenhada) desenhar();
  });
})();
