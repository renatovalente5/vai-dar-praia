# -*- coding: utf-8 -*-
"""Bateria de verificação do Praiómetro."""
import base64, json, os, re, socket, socketserver, sys, threading, http.server, time
RAIZ=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ,'_source'))
from cdp import Chrome, descodificar_png, porta_livre
def livre():
    """Uma porta livre que este processo ainda não deu a ninguém.

    O `bind(0)` sozinho reutiliza portas recém-libertadas, e este ficheiro abre
    e fecha mais de vinte Chromes: dois seguidos apanhavam a mesma porta e o
    segundo ligava-se ao alvo do primeiro, que estava a morrer. Reaproveita-se
    a mesma contabilidade do cdp.py, para os servidores HTTP daqui e os Chromes
    de lá não se atropelarem."""
    return porta_livre()
class Q(http.server.SimpleHTTPRequestHandler):
    """O servidor tem de ser DE VÁRIAS LINHAS, e isto custou quatro corridas.

    Estava um `socketserver.TCPServer`, que atende UMA ligação de cada vez. O
    Chrome faz *preconnect*: abre sockets adiantados sem mandar pedido nenhum,
    para o caso de precisar deles. O servidor aceitava um desses e ficava
    bloqueado no `readline()` à espera de uma linha de pedido que nunca vinha —
    e tudo o resto atrás dele na fila.

    O sintoma era o `Page.navigate` a esgotar os 90s do socket do DevTools,
    sempre num Chrome novo e sempre a meio da bateria, o que apontava para todo
    o lado menos para aqui: o Chrome respondia ao `Runtime.evaluate` e só
    empatava a navegar, porque o `Page.navigate` só volta quando a resposta
    começa a chegar. Nas minhas experiências locais nunca aconteceu por acaso —
    tinha lá um `ThreadingHTTPServer`.

    O `timeout` é a segunda fechadura: uma ligação muda deixa de prender uma
    linha para sempre, mesmo que apareça outra maneira de o Chrome as abrir.
    """
    timeout = 20
    protocol_version = 'HTTP/1.0'
    def log_message(self,*a): pass
PORTA=livre()
srv=http.server.ThreadingHTTPServer(('127.0.0.1',PORTA),
                                    lambda *a,**k: Q(*a,directory=RAIZ,**k))
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever,daemon=True).start()

# ---------------------------------------------------------------- contraste
#
# MEDE-SE O PÍXEL, NÃO O DOM. A versão anterior subia pelos antepassados à
# procura de `backgroundColor` e parava no <body>. Era cega a três coisas ao
# mesmo tempo:
#
#   · camadas que não são antepassadas — a `.ceu` deste site é
#     `position: fixed; inset: 0; z-index: -1`, portanto está POR TRÁS de
#     metade do texto sem nunca ser mãe de nada;
#   · gradientes e imagens — lia `backgroundColor`, que num `linear-gradient`
#     vem transparente, e a `.ceu` é um gradiente com um sol dentro;
#   · qualquer coisa sobreposta.
#
# Resultado: dava «FALHAS: 0» por cima de quatro falhas reais, a pior das quais
# 1,21:1 — o claim por cima do sol, no tema escuro, onde a norma pede 4,5:1.
#
# Como funciona agora: marca-se cada elemento com texto PRÓPRIO, pinta-se esse
# texto de transparente (só o texto — os `fill` das formas SVG ficam, senão
# media-se um rótulo contra a página em vez de contra a barra que tem por
# baixo), tira-se UMA captura, e amostra-se o fundo dentro das caixas de linha
# do texto, que se obtêm por `Range` e são muito mais apertadas do que o
# rectângulo do elemento. Fica o PIOR contraste de cada elemento: se o texto
# atravessa um gradiente, o sítio mais fraco é o que decide se se lê.

_MARCAR = r"""(function(){
  var nos = [];
  document.querySelectorAll('body *').forEach(function(n){
    var t = [...n.childNodes].filter(function(k){return k.nodeType===3;})
      .map(function(k){return k.textContent;}).join('').trim();
    if(!t) return;
    var cs = getComputedStyle(n);
    if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0) return;
    var r = n.getBoundingClientRect();
    if(!r.width||!r.height) return;
    /* Texto escondido à vista (.visually-hidden): 1px recortado, lido só por
       leitores de ecrã. Ninguém o VÊ, logo não tem contraste que medir. */
    if(r.width<=2&&r.height<=2) return;
    if(cs.clipPath&&cs.clipPath.indexOf('inset(50%')===0) return;
    /* As caixas de LINHA do texto próprio, e não o rectângulo do elemento: um
       <p> alto com uma linha de texto no topo mediria fundo onde não há letra
       nenhuma, e um <li> com um <span> dentro mediria o span duas vezes. */
    /* OS PONTOS DE AMOSTRA SAEM DAQUI JÁ VALIDADOS, e a validação é um
       `elementFromPoint`: só serve o ponto onde o browser diz que este
       elemento (ou um filho dele) é mesmo o que lá está. Sem isso amostrava-se
       o que estivesse por baixo de qualquer recorte — e a tira dos dias vive
       num `overflow-x: auto`, portanto um cartão meio fora do scroller dava a
       amostra do CÉU e um falso 3,57:1 numa palavra que se lê perfeitamente.
       O mesmo cobre elementos tapados por outros e partes fora do ecrã. */
    var pontos = [];
    [...n.childNodes].forEach(function(k){
      if(k.nodeType!==3 || !k.textContent.trim()) return;
      var rg = document.createRange(); rg.selectNodeContents(k);
      [...rg.getClientRects()].forEach(function(b){
        if(b.width<=1 || b.height<=1) return;
        var nx = Math.max(2, Math.min(5, Math.floor(b.width/12)+2));
        var ny = Math.max(2, Math.min(3, Math.floor(b.height/6)+1));
        for(var ix=0; ix<nx; ix++) for(var iy=0; iy<ny; iy++){
          var x = b.left+1 + (b.width-2)*(nx===1?0:ix/(nx-1));
          var y = b.top+1  + (b.height-2)*(ny===1?0:iy/(ny-1));
          if(x<0||y<0||x>=innerWidth||y>=innerHeight) continue;
          var alvo = document.elementFromPoint(x, y);
          if(alvo && (alvo===n || n.contains(alvo))) pontos.push([Math.round(x), Math.round(y)]);
        }
      });
    });
    if(!pontos.length) return;
    /* SVG: o que pinta o texto é o `fill`, não o `color`. */
    var svg = n.ownerSVGElement != null;
    /* O SELECTOR VAI JUNTO. Sem ele a falha diz «Não vale a pena @13px 3.57» e
       não se sabe qual dos elementos com esse texto é — há a palavra do bloco,
       a do dia na tira e a do veredicto. Custou meia hora a perseguir o
       elemento errado. */
    var quem = n.tagName.toLowerCase()
      + (n.id ? '#' + n.id : '')
      + '.' + String(n.className.baseVal !== undefined ? n.className.baseVal : n.className)
              .trim().split(/\s+/).filter(Boolean).slice(0,2).join('.');
    nos.push({ t: t.slice(0,24), quem: quem.replace(/\.$/, ''),
               cor: (svg && cs.fill && cs.fill !== 'none') ? cs.fill : cs.color,
               px: parseFloat(cs.fontSize), peso: +cs.fontWeight, pontos: pontos });
    n.setAttribute('data-medir','1');
  });
  var st = document.createElement('style'); st.id = 'medir-fundo';
  st.textContent = '[data-medir]{color:transparent!important;fill:transparent!important;'
                 + 'text-shadow:none!important;-webkit-text-stroke-color:transparent!important;}';
  document.head.appendChild(st);
  return JSON.stringify({ nos: nos, larg: innerWidth, alt: innerHeight });})()"""

_DESMARCAR = r"""(function(){
  var s = document.getElementById('medir-fundo'); if(s) s.remove();
  document.querySelectorAll('[data-medir]').forEach(function(n){ n.removeAttribute('data-medir'); });
  return 1;})()"""


def _lum(c):
    def f(v):
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2])


def _rgba(txt):
    n = [float(x) for x in re.findall(r'[\d.]+', txt or '')]
    if len(n) < 3: return None
    return (n[0], n[1], n[2], n[3] if len(n) > 3 else 1.0)


_ASSINATURA = r"""(function(){
  var d = document;
  var n = d.querySelectorAll('body *').length;
  var r = d.body.getBoundingClientRect();
  var t = d.querySelector('.dias'), v = d.querySelector('#v-partes');
  function cx(e){ if(!e) return '-'; var b=e.getBoundingClientRect();
    return Math.round(b.top)+','+Math.round(b.height); }
  /* O SCROLL DE CADA ROLO ENTRA NA CONTA. Faltava, e o `trazerDiaAVista()`
     mexe no `scrollLeft` da tira DEPOIS de a página estar montada: as
     coordenadas eram lidas com a tira numa posição e a fotografia saía com ela
     noutra, portanto amostrava-se o céu entre cartões. Dava 3,23:1 numa
     palavra que se lê bem, e só no TELEMÓVEL — que é a única largura onde a
     tira chega a rolar. A altura da página não mexia, logo o resto da
     assinatura não via nada. */
  var rolos = [...d.querySelectorAll('.dias, [style*="overflow"], .sugestoes')]
    .map(function(e){ return e.scrollLeft+','+e.scrollTop; }).join(';');
  return n+'|'+Math.round(r.height)+'|'+cx(t)+'|'+cx(v)+'|'+scrollY+'|'+rolos;})()"""


def contraste(c, tentativa=0):
    """Devolve a lista de textos abaixo do mínimo da WCAG, medidos no píxel.

    A PÁGINA TEM DE ESTAR QUIETA entre as medidas e a captura, e não estava:
    lêem-se os rectângulos, tira-se a fotografia, e amostra-se a fotografia nas
    coordenadas dos rectângulos. Se o ecrã reflui pelo meio — no runner do
    GitHub a previsão chegava tarde e a tira aparecia a meio disto — as
    coordenadas passam a apontar para outro sítio, e o que sai é uma falha
    inventada: media-se a palavra de um cartão contra o céu que ficou onde ela
    estava. Aconteceu, e deu 3,23:1 numa palavra que se lê bem.
    """
    antes = c.js(_ASSINATURA)
    d = json.loads(c.js(_MARCAR))
    png = base64.b64decode(c.cmd('Page.captureScreenshot', format='png')['data'])
    c.js(_DESMARCAR)
    if c.js(_ASSINATURA) != antes:
        if tentativa < 2:
            time.sleep(1.0)
            return contraste(c, tentativa + 1)
        # Três vezes seguidas a mexer: não se mede, e diz-se. Silêncio aqui
        # seria pior — passaria por «limpo».
        erro('a página não parou quieta o tempo suficiente para medir o contraste')
        return []
    larguraPx, alturaPx, ler = descodificar_png(png)
    escala = larguraPx / float(d['larg']) if d['larg'] else 1.0
    maus = []
    for n in d['nos']:
        f = _rgba(n['cor'])
        if not f: continue
        pior, piorFundo = None, None
        for (x, y) in n['pontos']:
            fundo = ler(int(x * escala), int(y * escala))
            if fundo is None: continue
            frente = [f[i] * f[3] + fundo[i] * (1 - f[3]) for i in range(3)]
            a, b = _lum(frente), _lum(fundo)
            r = (max(a, b) + .05) / (min(a, b) + .05)
            if pior is None or r < pior:
                pior, piorFundo = r, fundo
        if pior is None: continue
        grande = n['px'] >= 24 or (n['px'] >= 18.66 and n['peso'] >= 700)
        if pior < (3 if grande else 4.5):
            maus.append('%s <%s> @%dpx %.2f sobre rgb%s'
                        % (n['t'], n.get('quem', '?'), round(n['px']), pior,
                           tuple(int(v) for v in piorFundo)))
    # A PROVA FICA GUARDADA. Um número numa linha de registo não chega para
    # decidir se a falha é real ou do medidor — e já perdi três corridas a
    # adivinhar isso a partir de «3,23:1 sobre rgb(172,184,193)». A fotografia
    # SEM TEXTO é exactamente o que o medidor viu, e a Action guarda-a.
    if maus:
        try:
            os.makedirs('/tmp/contraste', exist_ok=True)
            nome = '/tmp/contraste/%d.png' % (len(os.listdir('/tmp/contraste')) + 1)
            with open(nome, 'wb') as f:
                f.write(png)
            maus[0] += '  [%s]' % nome
        except Exception:
            pass
    return maus[:8]

# Quantas partes tem o dia, lido do próprio modelo: um número à mão aqui
# passaria a mentir no dia em que o modelo mudasse.
import subprocess as _sp
M_PARTES = json.loads(_sp.run(['node','-e',
  "require('%s/assets/js/modelo.js');"
  "process.stdout.write(JSON.stringify(globalThis.Modelo.PARTES.map(function(p){return p.nome;})))" % RAIZ],
  capture_output=True, text=True).stdout)

# as horas das janelas, para a faixa da maré — o M_PARTES acima só traz os nomes
M_HORAS = json.loads(_sp.run(['node','-e',
  "require('%s/assets/js/modelo.js');"
  "process.stdout.write(JSON.stringify(globalThis.Modelo.PARTES.map(function(p){"
  "return [p.ini, p.fim];})))" % RAIZ],
  capture_output=True, text=True).stdout)

falhas=[]
# O QUE NÃO SE CONSEGUIU MEDIR, que é coisa diferente do que se mediu e está
# mal. Um site que não abre é uma falha; uma Open-Meteo que não responde é uma
# medição que não houve, e chamar-lhe falha é ensinar quem lê a ignorar o
# vermelho. Medido no runner do GitHub: «excepção: Failed to fetch» numas
# secções e «HTTP 200, vazios=4» noutras, na mesma corrida.
naoMedido=[]
def erro(m): falhas.append(m); print('   ✗ '+m)
def semMedida(m): naoMedido.append(m); print('   · '+m)


def _apiViva():
    """A Open-Meteo ainda responde, ou já se esgotou a quota do dia?

    Existe porque uma bateria que não sabe dizer «não consegui medir» é pior do
    que uma que falha: com a quota esgotada, meia dúzia de secções que dependem
    da previsão começam a devolver cartões vazios, e as mensagens que saem
    falam de blocos em falta e de reservas que não aparecem — tudo defeitos
    inventados. Perdeu-se uma tarde a persegui-los.

    O tecto são 10 000 pedidos por dia POR IP. Não afecta quem visita o site
    (cada browser fala com a API a partir do IP de quem lá está); afecta quem
    corre isto muitas vezes seguidas, e cada corrida completa gasta algumas
    dezenas."""
    import urllib.request, urllib.error
    u = ('https://api.open-meteo.com/v1/forecast?latitude=41.18&longitude=-8.69'
         '&hourly=temperature_2m&forecast_days=1&models=ecmwf_ifs025')
    try:
        with urllib.request.urlopen(u, timeout=12) as r:
            return r.status == 200, ''
    except urllib.error.HTTPError as e:
        corpo = ''
        try: corpo = e.read().decode('utf-8', 'replace')[:160]
        except Exception: pass
        return False, 'HTTP %s %s' % (e.code, corpo)
    except Exception as e:
        return False, str(e)


_viva, _porque = _apiViva()
if not _viva:
    print('\n' + '=' * 54)
    print('NÃO É POSSÍVEL MEDIR: a Open-Meteo não responde.')
    print('  ' + _porque)
    print('')
    print('  Isto NÃO é um defeito do site: a previsão é pedida pelo browser de')
    print('  quem visita, com o IP dele. É a quota deste computador que se')
    print('  esgotou — 10 000 pedidos por dia, e cada corrida completa gasta')
    print('  algumas dezenas. As secções que dependem da previsão dariam')
    print('  cartões vazios e mensagens de defeitos que não existem.')
    print('=' * 54)
    sys.exit(2)

def escolherPraia(c, i=0, limite=60.0, tentativas=3):
    """Carrega no atalho e ESPERA PELA TIRA, em vez de dormir um número.

    Os `time.sleep(5.0)` espalhados por este ficheiro eram medidos nesta
    máquina. Num runner do GitHub não chegaram: a secção 1 mediu «dias: 0,
    resultado: false» a 1280 px, e o que se seguiu foi uma secção inteira a
    falhar por uma razão que não existe. Uma bateria que depende da velocidade
    de quem a corre inventa defeitos nas máquinas lentas e esconde-os nas
    rápidas.

    Espera-se pelo que interessa — os seis dias no ecrã — e devolve-se o tempo
    que levou, para se ver quando está a ficar apertado.
    """
    # E TENTA-SE MAIS DE UMA VEZ. A rede de um runner até à Open-Meteo falha a
    # espaços — «Failed to fetch» num Chrome e resposta boa no seguinte, na
    # mesma máquina e no mesmo minuto —, e uma medição que morre à primeira
    # contrariedade não mede coisa nenhuma. É o que uma pessoa faria: carregar
    # outra vez. Recarrega-se a página entre tentativas para limpar o estado.
    # NÃO SE RECARREGA A PÁGINA ENTRE TENTATIVAS, e isto custou uma corrida:
    # metade das secções substitui o `window.fetch` para forçar falhas de rede,
    # e um `location.reload()` pelo meio apaga esse enxerto sem dizer nada. O
    # que se via a seguir eram acusações ao site — «a praia nova falhou e o
    # resultado continuou à vista» — quando o que tinha falhado era o teste a
    # apagar-se a si próprio. Carrega-se outra vez no atalho, e mais nada.
    for volta in range(tentativas):
        if volta:
            time.sleep(1.2)
        r = _tentarPraia(c, i, limite / tentativas + 4)
        if r is not None:
            return r
    return _semPrevisao(c, limite)


def _tentarPraia(c, i, limite):
    """Carrega no atalho e espera pela praia CERTA.

    Esperar por «seis dias na tira» não chega, e isto passou despercebido até
    hoje: ao mudar de praia a tira JÁ tem seis dias — os do anterior. A espera
    voltava logo, e o que se media a seguir era a praia antiga com o nome da
    nova. Na secção 6h, as duas praias apareciam com a mesma tira e a prova da
    resposta fora de ordem era saltada com um «sem valor hoje» que não era
    verdade.

    O sinal certo é o `pm:praia`, que o `escolher()` só escreve quando a
    previsão chega e o cartão está desenhado — e traz a coordenada, portanto
    diz QUAL das praias.
    """
    quem = c.js("var b=document.querySelectorAll('.atalho')[%d];"
                "b ? b.click() : 0; b ? b.dataset.id : ''" % i)
    t0 = time.time()
    while time.time() - t0 < limite:
        try:
            pronto = c.js(
                "(function(){ try{"
                "  var p = JSON.parse(localStorage.getItem('pm:praia')||'null');"
                "  return !!(p && p.id === %s"
                "         && document.querySelectorAll('.dia').length >= 6);"
                "}catch(e){return false;} })()" % json.dumps(quem))
        except Exception:
            pronto = False
        if pronto:
            time.sleep(.35)          # a última pintura
            return time.time() - t0
        time.sleep(.25)
    return None


def _semPrevisao(c, limite):
    n = 0
    try:
        n = int(c.js("document.querySelectorAll('.dia').length") or 0)
    except Exception:
        pass
    # E DIZ-SE O QUE O ECRÃ MOSTRAVA, não só que não chegou. «A tira ficou com
    # 0 dias» manda-nos adivinhar; a mensagem de estado e o que a rede devolveu
    # dizem se foi a API, se foi o clique, ou se foi a página que nem carregou.
    try:
        # O `PRAIAS` vive dentro do IIFE do app.js e NÃO está em `window`: lê-lo
        # de fora dava sempre 0 e mandava-me atrás da lista de praias quando o
        # problema era outro. Conta-se pelo que está no ecrã, e pergunta-se à
        # API a partir da própria página — que é quem tem o problema.
        d = json.loads(c.js(r"""(async function(){
          /* O URL EXACTO QUE O SITE PEDE, e não um simplificado: o simples
             dava 200 enquanto o site dizia «não conseguimos ir buscar a
             previsão», o que só provava que a rede estava boa. O que falha é
             este — dez variáveis horárias, quatro modelos, seis dias. */
          var url = 'https://api.open-meteo.com/v1/forecast'
            + '?latitude=41.1765&longitude=-8.6936'
            + '&hourly=temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,'
            + 'wind_direction_10m,cloud_cover,precipitation,precipitation_probability,uv_index,weather_code'
            + '&daily=weather_code,precipitation_sum&timezone=auto&forecast_days=6'
            + '&models=ecmwf_ifs025,icon_seamless,gfs_seamless,ukmo_seamless';
          var api = 'não tentado';
          try {
            var r = await fetch(url);
            var t = await r.text();
            var j = null; try { j = JSON.parse(t); } catch (e) {}
            api = 'HTTP ' + r.status
              + (j && j.hourly
                 ? ' | horas=' + (j.hourly.time || []).length
                   + ' campos=' + Object.keys(j.hourly).length
                   + ' fuso=' + j.timezone
                   + ' vazios=' + Object.keys(j.hourly).filter(function(k){
                       return k !== 'time' && (j.hourly[k]||[]).every(function(v){return v==null;});
                     }).length
                 : ' | ' + t.slice(0, 200));
          } catch (e) { api = 'excepção: ' + (e && e.message || e); }
          var lista = 'não tentado';
          try { var q = await fetch('/data/praias.json');
                lista = 'HTTP ' + q.status + ', ' + (await q.text()).length + ' bytes'; }
          catch (e) { lista = 'excepção: ' + (e && e.message || e); }
          return JSON.stringify({
            estado: (document.getElementById('procura-estado')||{}).textContent || '',
            atalhos: document.querySelectorAll('.atalho').length,
            resultado: !(document.getElementById('resultado')||{}).hidden,
            api: api, praiasJson: lista});})()"""))
    except Exception as e:
        d = {'erro ao ler o ecrã': str(e)}
    # A CULPA É DA API OU DO SITE? Pergunta-se, e a resposta decide se isto
    # conta como falha ou como «não medido».
    api = str(d.get('api', ''))
    culpaDaApi = ('excepção' in api or 'HTTP 200' not in api
                  or 'vazios=0' not in api)
    msg = ('a previsão não chegou em %.0fs (a tira ficou com %d dias): %s'
           % (limite, n, json.dumps(d, ensure_ascii=False)))
    if not culpaDaApi:
        erro(msg)
        return None
    # A API FALHOU: PÁRA-SE AQUI, limpo. Continuar sem previsão põe uma dúzia
    # de secções a ler elementos que não existem, e o que sai são erros com
    # nomes de defeitos que não há — «a tira partiu-se em 0 linhas», «só 0 dos
    # 6 dias têm palavra». Cada um desses manda alguém investigar o nada.
    # O resumo sai à mesma (vive num atexit) e o código é 2: não medido.
    semMedida('não foi possível medir — ' + msg)
    semMedida('a corrida parou aqui: sem previsão, as secções seguintes leriam '
              'um ecrã vazio e chamar-lhe-iam defeitos')
    sys.exit(2)


def novo(w,h,mob):
    c=Chrome(porta=livre())
    c.cmd('Emulation.setDeviceMetricsOverride',width=w,height=h,deviceScaleFactor=1,mobile=mob)
    if mob:
        c.cmd('Emulation.setTouchEmulationEnabled', enabled=True, maxTouchPoints=5)
    c.abrir('http://127.0.0.1:%d/'%PORTA, espera=2.6)
    return c

print('\n== 1. arranque, procura e escolha ==')
for w,h,mob,rot in [(375,812,True,'telemóvel 375'),(1280,900,False,'computador 1280')]:
    c=novo(w,h,mob)
    try:
        escolherPraia(c)
        d=json.loads(c.js("""JSON.stringify({
          resultado:!document.getElementById('resultado').hidden,
          /* a palavra do veredicto vive dentro da caixa das partes (junto) ou
             na frase da divisão (partido) — o selo saiu */
          palavra:(document.querySelector('.partes__palavra')||{}).textContent
                  || document.getElementById('v-resposta').textContent,
          dias:document.querySelectorAll('.dia').length,
          transbordo:document.documentElement.scrollWidth+'/'+innerWidth})"""))
        ok = d['resultado'] and d['dias']==6 and d['transbordo'].split('/')[0]==d['transbordo'].split('/')[1]
        print('  %-16s %s %s' % (rot, '✓' if ok else '✗', json.dumps(d, ensure_ascii=False)))
        if not ok: erro('%s: %s'%(rot,d))
        # Contraste com os painéis fechados e com um aberto. Esta segunda
        # medição abria o antigo <details id="detalhe">, que já não existe: a
        # chamada passou a falhar em silêncio e o teste media duas vezes a
        # mesma coisa. Agora abre um bloco, que é onde os números vivem.
        con=contraste(c)
        c.js("var b=document.querySelector('button.bloco__cabeca'); if(b) b.click()")
        time.sleep(.6)
        con2=contraste(c)
        print('  %-16s contraste fechado=%d aberto=%d' % ('', len(con), len(con2)))
        if con: erro('%s contraste: %s'%(rot,con))
        if con2: erro('%s contraste (com um bloco aberto): %s'%(rot,con2))
    finally: c.fechar()

print('\n== 2. teclado na procura ==')
c=novo(1280,900,False)
try:
    c.js("var i=document.getElementById('procura'); i.focus(); i.value='nazare'; i.dispatchEvent(new Event('input',{bubbles:true}))")
    time.sleep(.7)
    n=int(c.js("document.querySelectorAll('.sugestao[data-i]').length"))
    print('  sugestões para «nazare»:', n)
    if n<1: erro('procura sem acentos não encontrou a Nazaré')
    for _ in range(2):
        c.cmd('Input.dispatchKeyEvent', type='rawKeyDown', key='ArrowDown', code='ArrowDown', windowsVirtualKeyCode=40, nativeVirtualKeyCode=40)
        c.cmd('Input.dispatchKeyEvent', type='keyUp', key='ArrowDown', code='ArrowDown', windowsVirtualKeyCode=40, nativeVirtualKeyCode=40)
        time.sleep(.2)
    # A ASSERÇÃO QUE FALTAVA. Este contador era IMPRESSO e nunca verificado, e é
    # a única verificação de teclado do projecto: provado por mutação, tirando
    # os dois `setAttribute` do ramo das setas a bateria escrevia «marcado com
    # as setas: 0» e terminava com FALHAS: 0. A asserção do Enter logo abaixo
    # não tapa o buraco, porque o app.js tem um ramo de recurso que escolhe a
    # primeira sugestão haja ou não navegação por setas.
    m = json.loads(c.js(r"""JSON.stringify((function(){
      var sel = document.querySelectorAll('.sugestao[aria-selected="true"]');
      var ad = document.getElementById('procura').getAttribute('aria-activedescendant');
      if (sel.length !== 1) return {n: sel.length, ad: ad};
      var m = sel[0], cs = getComputedStyle(m);
      var irmao = m.nextElementSibling || m.previousElementSibling;
      return { n: 1, ad: ad, id: m.id,
               /* A marca TEM de se ver, e o fundo sozinho não chega: valia
                  1,058:1 contra o da lista. WCAG 1.4.11 pede 3:1 para um
                  indicador que não é texto, e num combobox não há anel de foco
                  do browser a safar isto — o foco fica na caixa. */
               contorno: cs.outlineStyle === 'none' ? null : cs.outlineColor,
               largura: parseFloat(cs.outlineWidth) || 0,
               fundo: cs.backgroundColor,
               fundoIrmao: irmao ? getComputedStyle(irmao).backgroundColor : null,
               visivel: (function(){ var r=m.getBoundingClientRect(),
                 p=m.parentNode.getBoundingClientRect();
                 return r.top >= p.top-1 && r.bottom <= p.bottom+1; })() };})())"""))
    print('  marcado com as setas:', json.dumps(m, ensure_ascii=False))
    if m['n'] != 1:
        erro('as setas marcaram %d sugestões, e tinha de ser exactamente 1' % m['n'])
    elif not m['ad'] or m['ad'] != m['id']:
        erro('o aria-activedescendant (%r) não aponta para a marcada (%r)' % (m['ad'], m['id']))
    else:
        if not m['visivel']:
            erro('a sugestão marcada com as setas ficou fora do painel')
        f = _rgba(m['contorno']) if m['contorno'] else None
        g = _rgba(m['fundoIrmao'] or m['fundo'])
        r = None
        if f and g and m['largura'] >= 1:
            la, lb = _lum(f[:3]), _lum(g[:3])
            r = (max(la, lb) + .05) / (min(la, lb) + .05)
        if r is None:
            erro('a sugestão marcada não tem contorno nenhum: só o fundo, que é '
                 'invisível (%s contra %s)' % (m['fundo'], m['fundoIrmao']))
        elif r < 3:
            erro('o contorno da sugestão marcada vale %.2f:1, e a WCAG 1.4.11 pede 3' % r)
        else:
            print('  contorno da marcada             ✓ %.2f:1, %.0fpx' % (r, m['largura']))
    # ESPERA-SE PELO NOME, não por cinco segundos. Num runner a previsão
    # demora, e o que saía era «Enter não escolheu praia nenhuma» — uma
    # acusação a uma tecla que tinha feito o seu trabalho.
    c.cmd('Input.dispatchKeyEvent', type='rawKeyDown', key='Enter', code='Enter', windowsVirtualKeyCode=13, nativeVirtualKeyCode=13)
    c.cmd('Input.dispatchKeyEvent', type='keyUp', key='Enter', code='Enter', windowsVirtualKeyCode=13, nativeVirtualKeyCode=13)
    esc, t0 = '', time.time()
    while time.time() - t0 < 40:
        esc = c.js("document.getElementById('v-praia').textContent") or ''
        if esc: break
        time.sleep(.3)
    print('  Enter escolheu:', esc or '(nada em 40s)')
    if not esc:
        estado = c.js("(document.getElementById('procura-estado')||{}).textContent") or ''
        (semMedida if 'conseguimos' in estado else erro)(
            'Enter não escolheu praia nenhuma (o ecrã diz %r)' % estado)

    # sem resultados: a mensagem tem de ir para a região live, e o aria-expanded
    # não pode dizer «expandido» sobre uma lista sem opções nenhumas
    c.js("""var i=document.getElementById('procura'); i.focus();
            i.value='zzzznaoexiste'; i.dispatchEvent(new Event('input',{bubbles:true}))""")
    time.sleep(.6)
    d=json.loads(c.js("""JSON.stringify({
      estado:document.getElementById('procura-estado').textContent,
      expandido:document.getElementById('procura').getAttribute('aria-expanded'),
      listaEscondida:document.getElementById('sugestoes').hidden,
      ad:document.getElementById('procura').getAttribute('aria-activedescendant')})"""))
    ok = 'ncontr' in d['estado'] and d['expandido']=='false' and d['listaEscondida'] and not d['ad']
    print('  sem resultados               %s  %s' % ('✓' if ok else '✗', json.dumps(d, ensure_ascii=False)))
    if not ok: erro('procura sem resultados: %s'%d)

    # E CARREGAR COM O RATO ESCOLHE A PRAIA. Isto passou pela bateria toda
    # sem ninguém dar por ele: a secção do teclado escolhe com ENTER, e o
    # caminho do rato não era exercido em lado nenhum. O defeito era este —
    # uma `<li role="option">` não é focável, portanto ao carregar nela o foco
    # sai da caixa para lado nenhum, o `focusout` que fecha a lista com Tab
    # fechava-a ENTRE o carregar e o soltar do rato, e o `click` chegava a
    # seguir e já não encontrava sugestão nenhuma. Carregar não fazia nada, e
    # sem erro. Reportado por quem usa o site.
    #
    # Tem de ser um clique de RATO A SÉRIO (Input.dispatchMouseEvent), e não um
    # `.click()` em JavaScript: o `.click()` não dispara `mousedown`, portanto
    # não move o foco, portanto não reproduz nada.
    antes = len(falhas)
    # A PRAIA QUE JÁ LÁ ESTAVA. Este Chrome vem de secções anteriores e o
    # cartão traz uma praia de antes; sem guardar o valor, um clique que não
    # faz NADA lê-se como «abriu a praia errada» — que manda procurar um
    # defeito que não existe. O que se verifica é que MUDA.
    praiaAntes = c.js("(document.getElementById('v-praia')||{}).textContent") or ''
    c.js("var i=document.getElementById('procura'); i.focus(); i.value='carcavelos';"
         "i.dispatchEvent(new Event('input',{bubbles:true}))")
    time.sleep(.9)
    onde = json.loads(c.js(r"""JSON.stringify((function(){
      var s = document.querySelector('.sugestao[data-i]'); if (!s) return null;
      var r = s.getBoundingClientRect();
      return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2),
               nome: s.textContent.replace(/\s+/g,' ').trim().slice(0,30) };})())"""))
    if not onde:
        erro('a procura por «carcavelos» não abriu sugestão nenhuma')
    else:
        for tipo in ('mousePressed', 'mouseReleased'):
            c.cmd('Input.dispatchMouseEvent', type=tipo, x=onde['x'], y=onde['y'],
                  button='left', clickCount=1)
            time.sleep(.15)
        _t0 = time.time()
        praia = praiaAntes
        while time.time() - _t0 < 40:
            praia = c.js("(document.getElementById('v-praia')||{}).textContent") or ''
            if 'arcavelos' in praia: break
            time.sleep(.3)
        if praia == praiaAntes:
            estado = c.js("(document.getElementById('procura-estado')||{}).textContent") or ''
            abertas = int(c.js("document.querySelectorAll('.sugestao[data-i]').length") or 0)
            (semMedida if 'conseguimos' in estado else erro)(
                'carregar com o RATO numa sugestão não fez nada: o cartão continua em %r '
                '(sugestão: %r, sugestões abertas depois do clique: %d, o ecrã diz %r)'
                % (praiaAntes, onde['nome'], abertas, estado))
        elif 'arcavelos' not in praia:
            erro('o rato abriu %r e a sugestão dizia %r' % (praia, onde['nome']))
        elif len(falhas) == antes:
            print('  clique do rato                  ✓ abriu %r' % praia)

    # A GAVETA FECHA QUANDO O FOCO SAI. Sair da caixa com Tab deixava a lista
    # aberta — um painel opaco com z-index 30 por cima do que vem a seguir, com
    # o foco a andar por baixo dele, e o combobox a anunciar aria-expanded=true
    # sem foco lá dentro. WCAG 2.4.11. Vai-se saindo com Tab até o foco deixar
    # a `.procura`: o alfinete está DENTRO dela, e enquanto lá se está a lista
    # continua a fazer sentido.
    antes = len(falhas)
    c.js("var i=document.getElementById('procura'); i.focus(); i.value='praia';"
         "i.dispatchEvent(new Event('input',{bubbles:true}))")
    time.sleep(.7)
    if not int(c.js("document.querySelectorAll('.sugestao[data-i]').length")):
        erro('a lista nem sequer abriu para «praia»')
    passos = []
    for _ in range(4):
        c.cmd('Input.dispatchKeyEvent', type='rawKeyDown', key='Tab', code='Tab',
              windowsVirtualKeyCode=9, nativeVirtualKeyCode=9)
        c.cmd('Input.dispatchKeyEvent', type='keyUp', key='Tab', code='Tab',
              windowsVirtualKeyCode=9, nativeVirtualKeyCode=9)
        time.sleep(.3)
        passos.append(json.loads(c.js(r"""JSON.stringify({
          dentro: !!(document.activeElement.closest && document.activeElement.closest('.procura')),
          onde: document.activeElement.id || document.activeElement.className || document.activeElement.tagName,
          abertas: document.querySelectorAll('.sugestao[data-i]').length,
          expandido: document.getElementById('procura').getAttribute('aria-expanded'),
          tapado: (function(){ var a=document.activeElement, r=a.getBoundingClientRect();
            if(!r.width||!r.height) return 0;
            var pts=[[r.left+3,r.top+3],[r.right-3,r.top+3],[r.left+r.width/2,r.top+r.height/2]];
            return pts.filter(function(p){ var e=document.elementFromPoint(p[0],p[1]);
              return e && e!==a && !a.contains(e) && !e.contains(a); }).length; })()})""")))
    fora = [x for x in passos if not x['dentro']]
    if not fora:
        erro('quatro Tabs e o foco nunca saiu da procura: %s' % passos)
    else:
        mau = [x for x in fora if x['abertas'] or x['expandido'] == 'true' or x['tapado']]
        if mau:
            erro('a lista não fechou ao sair com Tab: %s' % mau[0])
    if len(falhas) == antes:
        print('  gaveta fecha com Tab            ✓ o foco saiu para %r e a lista fechou'
              % fora[0]['onde'])
finally: c.fechar()

print('\n== 2b. os nomes oficiais encontram-se ==')
# A GUARDA QUE FALTAVA, e que custou uma pergunta de uma amiga do autor:
# «não encontro a Praia de Esmoriz».
#
# Encontrava-se, mas com outro nome. O OSM chama-lhe «Praia Velha», e o site
# só sabia procurar pelo nome do OSM. A lista de águas balneares da Agência
# Portuguesa do Ambiente — que é quem designa as praias deste país — chama-lhe
# «Esmoriz», e é esse o nome que está na bandeira azul, no edital e na boca das
# pessoas.
#
# Esta secção escreve na caixa de procura o nome OFICIAL de cada uma das 761
# águas balneares do país e exige que alguma das sugestões seja uma praia a
# menos de 4 km do ponto oficial. Não verifica que o site tem uma praia com
# aquele nome — verifica a única coisa que interessa a quem procura: escrever
# o nome leva-me àquela areia.
#
# Corre num carregamento de página só e sem tocar na rede: a procura é
# síncrona e vive toda em memória, portanto as 761 consultas custam menos de
# dois segundos. Não há desculpa para a amostragem.
_APA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    '_source', 'aguas-balneares.json')
if not os.path.exists(_APA):
    semMedida('falta o _source/aguas-balneares.json — os nomes oficiais ficam por verificar')
else:
    _aguas = json.load(open(_APA, encoding='utf8'))['aguas']
    _magro = json.dumps([{'n': a['n'], 'co': a['co'], 'la': a['la'], 'lo': a['lo']}
                         for a in _aguas], ensure_ascii=False)
    c = novo(1280, 900, False)
    try:
        d = json.loads(c.js(r"""(async function(){
          var praias = await (await fetch('/data/praias.json')).json();
          var aguas = %s;
          var caixa = document.getElementById('procura');
          var lista = document.getElementById('sugestoes');
          function km(a,b,x,y){ return Math.hypot((a-x)*111.32,(b-y)*84.5); }
          /* PRIMEIRO MEDE-SE QUANTAS SUGESTÕES A LISTA MOSTRA NO MÁXIMO.
             O app.js corta em oito, mas escrever «8» aqui era prender este
             teste a um número que vive noutro ficheiro: no dia em que lá
             mudasse, isto passava a mentir sem ninguém mexer nele. Mede-se. */
          var tecto = 0, res = [];
          for (var i = 0; i < aguas.length; i++) {
            caixa.focus(); caixa.value = aguas[i].n;
            caixa.dispatchEvent(new Event('input', {bubbles:true}));
            var its = [].slice.call(lista.querySelectorAll('.sugestao[data-i]'));
            var perto = Infinity, alias = false;
            for (var j = 0; j < its.length; j++) {
              var p = praias[+its[j].dataset.i];
              if (!p) continue;
              var d = km(aguas[i].la, aguas[i].lo, p.la, p.lo);
              if (d < perto) { perto = d; alias = !!its[j].querySelector('.sugestao__alias'); }
            }
            if (its.length > tecto) tecto = its.length;
            res.push({ n: aguas[i].n, co: aguas[i].co, quantas: its.length,
                       perto: perto, alias: alias,
                       deu: its.slice(0,3).map(function(x){ return praias[+x.dataset.i].n; }) });
          }
          /* A MEDIDA É 4 km, a mesma com que o actualizar-balneares.js decide
             que uma água balnear oficial «já está no site». Este teste tem de
             exigir exactamente o que essa ferramenta promete, nem mais nem
             menos: com uma medida mais apertada acusava praias compridas — o
             ponto oficial da Meia Praia de Lagos está a 2,8 km do ponto do
             site, e as duas areias são a mesma. */
          var maus = [], ambiguos = [], comAlias = 0;
          for (var k = 0; k < res.length; k++) {
            var r = res[k];
            if (r.perto < 4) { if (r.alias) comAlias++; continue; }
            /* LISTA CHEIA É AMBIGUIDADE, NÃO AUSÊNCIA. Seis águas balneares
               chamam-se por um nome comum e mais nada — «Praia», «Prainha»,
               «Lagoa», «Porto», «Ribeira», «Praia Grande». Há dezenas de
               praias que casam com cada um deles, e nenhuma ordenação pode
               garantir que a certa cabe nas primeiras. Quem escreve «prainha»
               tem de acrescentar uma palavra, e isso não é um defeito do site
               — é o que o nome dá. Distingue-se de uma ausência a sério pelo
               que a lista devolveu: cheia é escolha a mais, curta é falta. */
            (r.quantas >= tecto ? ambiguos : maus).push(r);
          }
          return JSON.stringify({ total: aguas.length, tecto: tecto,
                                  maus: maus.slice(0, 12), quantos: maus.length,
                                  ambiguos: ambiguos.map(function(x){ return x.n + ' (' + x.co + ')'; }),
                                  comAlias: comAlias });
        })()""" % _magro))
        if d is None:
            semMedida('a procura pelos nomes oficiais não devolveu nada')
        elif d['quantos']:
            erro('%d dos %d nomes oficiais não encontram a praia: %s'
                 % (d['quantos'], d['total'],
                    json.dumps(d['maus'], ensure_ascii=False)[:600]))
        else:
            print('  nomes oficiais  ✓ os %d encontram a praia certa (%d pelo nome oficial '
                  'que o cartão não mostra)' % (d['total'], d['comAlias']))
            if d['ambiguos']:
                print('   · %d nomes oficiais são palavras comuns e a lista enche antes '
                      'de lá chegar: %s' % (len(d['ambiguos']), ', '.join(d['ambiguos'])))

        # E O NOME QUE FEZ O ENCONTRO TEM DE APARECER. Mostrar «Praia Velha» a
        # quem escreveu «Esmoriz» sem dizer porquê é mostrar uma praia que a
        # pessoa não pediu — e ela fecha a lista a pensar que o site não tem a
        # dela. O alias explica o salto.
        alvo = json.loads(c.js(r"""(async function(){
          var praias = await (await fetch('/data/praias.json')).json();
          var p = praias.filter(function(x){ return x.a; })[0];
          if (!p) return JSON.stringify(null);
          var nome = p.a.split(' · ')[0];
          var caixa = document.getElementById('procura');
          caixa.focus(); caixa.value = nome;
          caixa.dispatchEvent(new Event('input', {bubbles:true}));
          var li = document.querySelector('#sugestoes .sugestao[data-i]');
          var al = li && li.querySelector('.sugestao__alias');
          return JSON.stringify({ escrito: nome,
            cartao: li ? li.querySelector('.sugestao__nome').textContent : null,
            alias: al ? al.textContent : null,
            visivel: !!(al && al.getClientRects().length) });
        })()"""))
        if not alvo:
            semMedida('nenhuma praia tem nome oficial alternativo — nada a verificar')
        elif not alvo['visivel'] or not alvo['alias']:
            erro('escrevi %r, o cartão diz %r e nada explica porquê — o nome oficial '
                 'que fez o encontro não aparece na sugestão'
                 % (alvo['escrito'], alvo['cartao']))
        else:
            print('  o porquê         ✓ escrever %r mostra %r com «%s» ao lado'
                  % (alvo['escrito'], alvo['cartao'], alvo['alias']))
    finally: c.fechar()

print('\n== 3. praia de rio (sem dados de mar) ==')
# A PRAIA DE RIO ESCOLHE-SE PELOS DADOS, e não pela palavra «fluvial» no nome.
# Escrevia «fluvial» e carregava na primeira sugestão. Funcionou até ao dia em
# que a primeira passou a ser a «Praia fluvial do Negrito» — que é uma zona de
# banhos DE MAR em Angra do Heroísmo, com esse nome no OpenStreetMap e `m=1`
# aqui, porque a APA lhe chama costeira e a API marinha lhe dá ondulação. A
# secção acusava então o site de mostrar o factor «Água do mar» numa praia de
# rio, num cartão que era mesmo de mar.
#
# O nome não diz se uma água é doce; o campo `m` diz, que é o que o site usa
# para decidir. Pergunta-se ao ficheiro e escolhe-se pelo índice.
_praias = json.load(open(os.path.join(RAIZ, 'data', 'praias.json'), encoding='utf8'))
_rio = next((i for i, x in enumerate(_praias)
             if x.get('m') == 0 and len(x['n']) > 14), None)
if _rio is None:
    semMedida('não há nenhuma praia de água interior no ficheiro — nada a verificar')
c=novo(1280,900,False)
try:
    c.js("""(function(){var i=document.getElementById('procura');
      i.value=%s; i.dispatchEvent(new Event('input',{bubbles:true}));})()"""
      % json.dumps(_praias[_rio]['n']))
    time.sleep(.8)
    # A praia de rio escolhe-se pela sugestão, não por um atalho — mas a espera
    # é a mesma história: quarenta segundos a olhar para o nome, e não cinco a
    # dormir. Sem isto o runner dizia que a praia de rio não abria.
    _alvo = c.js("!!document.querySelector('.sugestao[data-i=\"%d\"]')" % _rio)
    if not _alvo:
        erro('a procura por %r não devolveu a própria praia' % _praias[_rio]['n'])
    c.js("document.querySelector('.sugestao[data-i=\"%d\"]').click()" % _rio)
    _t0 = time.time()
    while time.time() - _t0 < 40:
        if c.js("document.getElementById('v-praia').textContent"): break
        time.sleep(.3)
    else:
        # E SE NÃO ABRIU, é a mesma pergunta de sempre: a culpa é do site ou da
        # API? Sem isto a secção seguia em frente e queixava-se do RODAPÉ —
        # «não explica que é praia de rio», com o rodapé vazio porque não havia
        # cartão nenhum. Acusar o rodapé de uma falha de rede é mandar alguém
        # procurar um defeito que não existe.
        _semPrevisao(c, 40)
    time.sleep(.4)
    d=json.loads(c.js("""JSON.stringify({praia:document.getElementById('v-praia').textContent,
      palavra:(document.querySelector('.partes__palavra')||{}).textContent
              || document.getElementById('v-resposta').textContent,
      nota:((document.querySelector('.dia[aria-selected="true"] .dia__nota')||{}).textContent)||''})"""))
    # Os factores vivem agora dentro do painel de cada parte, e só quando aberto.
    c.js("var b=document.querySelector('button.bloco__cabeca'); if(b) b.click()"); time.sleep(.5)
    d['factores']=json.loads(c.js("JSON.stringify([...document.querySelectorAll('.nums__nome')].map(x=>x.textContent))"))
    # A explicação da praia de rio: sem ela, a ausência do factor «Água do mar»
    # lá dentro dos números lê-se como avaria. Vivia na linha da fonte dos
    # dados; essa linha saiu a pedido e a explicação ficou, sozinha.
    rodape=c.js("(document.getElementById('v-sem-mar')||{}).textContent||''")
    print('  praia:', d['praia'], '|', d['palavra'], '|', d['nota'])
    print('  factores:', d['factores'])
    if 'Água do mar' in d['factores']: erro('praia de rio não devia ter factor água')
    if 'rio' not in rodape: erro('rodapé não explica que é praia de rio: '+rodape[:80])
    else: print('  ✓ rodapé explica:', rodape[:70])
finally: c.fechar()

print('\n== 4. favoritos ==')
c=novo(375,812,True)
try:
    # marca a praia de um atalho e confirma que aparece na tira
    escolherPraia(c)
    nome=c.js("document.getElementById('v-praia').textContent")
    c.js("document.getElementById('v-estrela').click()"); time.sleep(.4)
    d=json.loads(c.js("""JSON.stringify({
      pressed:document.getElementById('v-estrela').getAttribute('aria-pressed'),
      chips:document.querySelectorAll('.fav').length,
      guardado:localStorage.getItem('pm:favoritos'),
      seccao:!document.getElementById('favoritos').hidden})"""))
    ok = d['pressed']=='true' and d['chips']==1 and not d['seccao'] is False
    print('  marcar %-22s %s  chips=%d' % (nome[:22], '✓' if ok else '✗', d['chips']))
    if not ok: erro('marcar favorito: %s'%d)
    # a chave é a coordenada, não o nome — há 50 nomes repetidos no ficheiro
    if ',' not in (d['guardado'] or ''): erro('favorito guardado sem coordenada: %s'%d['guardado'])

    # a cor do chip TEM de ser a mesma que a praia aberta dá
    cor_chip=c.js("(document.querySelector('.fav').className.match(/fav--(\\w+)/)||[])[1]||''")
    cor_pag=c.js("document.body.getAttribute('data-cor')")
    print('  cor do chip = cor da página  %s  (%s / %s)' % ('✓' if cor_chip==cor_pag else '✗', cor_chip, cor_pag))
    if cor_chip!=cor_pag: erro('chip diz %s e a praia aberta diz %s'%(cor_chip,cor_pag))

    # sobrevive a recarregar, e a tira pinta-se com UM par de pedidos
    c.js("performance.clearResourceTimings()")
    c.abrir('http://127.0.0.1:%d/'%PORTA, espera=6.0)
    d2=json.loads(c.js("""JSON.stringify({
      chips:document.querySelectorAll('.fav').length,
      com_cor:document.querySelectorAll('.fav[class*=fav--]').length,
      com_forma:document.querySelectorAll('.fav__ponto svg').length,
      pedidos:performance.getEntriesByType('resource').filter(function(r){return r.name.indexOf('open-meteo')>0}).length})"""))
    ok2 = d2['chips']==1 and d2['com_cor']==1 and d2['com_forma']==1
    print('  depois de recarregar         %s  %s' % ('✓' if ok2 else '✗', json.dumps(d2)))
    if not ok2: erro('favoritos depois de recarregar: %s'%d2)
    # cor sozinha não chega (WCAG 1.4.1): cada chip leva também a forma
    if d2['com_cor']!=d2['com_forma']: erro('há chips com cor e sem forma')

    # desmarcar limpa tudo
    c.js("document.getElementById('v-estrela').click()"); time.sleep(.4)
    d3=json.loads(c.js("""JSON.stringify({
      pressed:document.getElementById('v-estrela').getAttribute('aria-pressed'),
      escondida:document.getElementById('favoritos').hidden,
      guardado:localStorage.getItem('pm:favoritos')})"""))
    ok3 = d3['pressed']=='false' and d3['escondida'] and d3['guardado']=='[]'
    print('  desmarcar                    %s  %s' % ('✓' if ok3 else '✗', json.dumps(d3)))
    if not ok3: erro('desmarcar favorito: %s'%d3)
finally: c.fechar()

print('\n== 5. conta ==')
c=novo(375,812,True)
try:
    d=json.loads(c.js("""JSON.stringify({
      entrar:!document.getElementById('conta-entrar').hidden,
      menu:!document.getElementById('conta-menu').hidden,
      disponivel:window.Conta.disponivel(),
      sessao:window.Conta.activa(),
      pedidos:performance.getEntriesByType('resource').filter(function(r){return r.name.indexOf('supabase')>0}).length})"""))
    # sem sessão o site não pode falar com o Supabase: quem só vê a praia fica anónimo
    ok = d['pedidos']==0 and not d['sessao'] and not d['menu'] and d['entrar']==d['disponivel']
    print('  sem sessão                   %s  %s' % ('✓' if ok else '✗', json.dumps(d)))
    if d['pedidos']: erro('sem sessão houve %d pedidos ao Supabase'%d['pedidos'])
    if d['entrar']!=d['disponivel']: erro('botão Entrar visível=%s mas Google pronto=%s'%(d['entrar'],d['disponivel']))
    # AS DUAS QUE FALTAVAM. Entravam no `ok` que decide o ✓/✗ impresso e não
    # tinham `erro()` nenhum: o ecrã mostrava ✗ e o processo devolvia 0. À mão
    # ainda se vê; num script — ou numa Action — passa a verde por cima de uma
    # sessão fantasma. É o mesmo defeito do código de saída deste ficheiro.
    if d['sessao']: erro('sem ninguém ter entrado, já há sessão: %r' % d['sessao'])
    if d['menu']: erro('sem sessão, o menu da conta está à vista')

    # com sessão falsa: a interface tem de trocar por completo
    c.js("""localStorage.setItem('pm:sessao', JSON.stringify({
      access_token:'x', refresh_token:'y', expira: 4102444800000,
      id:'00000000-0000-0000-0000-000000000009', email:'a@b.pt', nome:'Zé Teste', foto:''}))""")
    c.abrir('http://127.0.0.1:%d/'%PORTA, espera=3.0)
    d2=json.loads(c.js("""JSON.stringify({
      entrar:getComputedStyle(document.getElementById('conta-entrar')).display!=='none',
      menu:getComputedStyle(document.getElementById('conta-menu')).display!=='none',
      inicial:document.getElementById('conta-inicial').textContent,
      nome:document.getElementById('conta-nome').textContent})"""))
    ok2 = (not d2['entrar']) and d2['menu'] and d2['inicial']=='Z'
    print('  com sessão                   %s  %s' % ('✓' if ok2 else '✗', json.dumps(d2, ensure_ascii=False)))
    if d2['entrar']: erro('«Entrar» continua visível com sessão aberta (regra [hidden] em falta?)')
    if not ok2: erro('interface da conta com sessão: %s'%d2)
    # carregar mesmo em «Entrar» e ver onde se aterra. É o mais longe que se vai
    # sem escrever a palavra-passe de alguém: se o client_id ou o redirect_uri
    # estiverem errados, o Google devolve um erro em vez do ecrã de entrada.
    if c.js("window.Conta.disponivel()") in (True, 'true'):
        try:
            c.js("localStorage.clear(); sessionStorage.clear()")
            c.abrir('http://127.0.0.1:%d/'%PORTA, espera=2.0)
            # O verificador é gravado de forma SÍNCRONA, antes da promessa e antes
            # da navegação: lê-se aqui, na nossa origem. Depois do salto para o
            # accounts.google.com o sessionStorage já é o deles, não o nosso.
            verif = c.js("(function(){ window.Conta.entrar(); return sessionStorage.getItem('pm:pkce') || ''; })()")
            if len(verif or '') < 40:
                erro('verificador PKCE não ficou em sessionStorage (%d caracteres)'%len(verif or ''))
            else:
                print('  verificador PKCE guardado    ✓  %d caracteres' % len(verif))
            time.sleep(6.0)
            destino = c.js("location.origin + location.pathname")
            ok5 = 'accounts.google.com' in (destino or '')
            print('  «Entrar» chega ao Google     %s  %s' % ('✓' if ok5 else '✗', destino))
            if not ok5:
                erro('«Entrar» não chegou ao Google: %s'%destino)
        except Exception as e:
            print('  ⚠ não foi possível testar a ida ao Google (rede?):', e)
        c.abrir('http://127.0.0.1:%d/'%PORTA, espera=2.0)
        c.js("""localStorage.setItem('pm:sessao', JSON.stringify({
          access_token:'x', refresh_token:'y', expira: 4102444800000,
          id:'00000000-0000-0000-0000-000000000009', email:'a@b.pt', nome:'Zé Teste', foto:''}))""")
        c.abrir('http://127.0.0.1:%d/'%PORTA, espera=2.5)

    # fila das operações que a rede não deixou cumprir
    d4=json.loads(c.js("""(function(){
      localStorage.removeItem('pm:pendentes');
      window.Conta.adiar({op:'del', id:'40.1000,-8.1000', n:'A'});
      window.Conta.adiar({op:'add', id:'41.2000,-8.2000', n:'B'});
      var antes = window.Conta.pendentes().length;
      // a última acção sobre a MESMA praia manda: marcar e desmarcar sem rede
      window.Conta.adiar({op:'add', id:'40.1000,-8.1000', n:'A'});
      var v = window.Conta.pendentes();
      var so = v.filter(function(x){return x.id==='40.1000,-8.1000'});
      return JSON.stringify({antes:antes, depois:v.length, duplicadas:so.length, opFinal:so[0]&&so[0].op});
    })()"""))
    ok4 = d4['antes']==2 and d4['depois']==2 and d4['duplicadas']==1 and d4['opFinal']=='add'
    print('  fila de operações por cumprir %s  %s' % ('✓' if ok4 else '✗', json.dumps(d4)))
    if not ok4: erro('fila de pendentes: %s'%d4)
    c.js("localStorage.removeItem('pm:pendentes')")

    # o menu é um <details>: tem de fechar ao carregar fora e com Escape
    c.js("document.getElementById('conta-menu').open = true"); time.sleep(.3)
    c.js("document.body.click()"); time.sleep(.3)
    fora = c.js("document.getElementById('conta-menu').open")
    c.js("document.getElementById('conta-menu').open = true"); time.sleep(.3)
    c.cmd('Input.dispatchKeyEvent', type='rawKeyDown', key='Escape', code='Escape', windowsVirtualKeyCode=27, nativeVirtualKeyCode=27)
    c.cmd('Input.dispatchKeyEvent', type='keyUp', key='Escape', code='Escape', windowsVirtualKeyCode=27, nativeVirtualKeyCode=27)
    time.sleep(.3)
    esc = c.js("document.getElementById('conta-menu').open")
    foco = c.js("document.activeElement.tagName")
    print('  menu fecha fora/Escape       %s  (fora=%s escape=%s foco=%s)'
          % ('✓' if (fora in (False,'false') and esc in (False,'false')) else '✗', fora, esc, foco))
    if fora not in (False,'false'): erro('o menu da conta não fecha ao carregar fora')
    if esc not in (False,'false'): erro('o menu da conta não fecha com Escape')
    if foco != 'SUMMARY': erro('Escape fechou o menu mas o foco ficou em %s'%foco)
    c.js("localStorage.clear()")
finally: c.fechar()

print('\n== 5b. armazenamento bloqueado (modo privado) ==')
c=novo(375,812,True)
try:
    # o Safari em navegação privada atira em setItem; aqui atira em tudo
    c.js("""(function(){
      var mau = { getItem:function(){throw new DOMException('x')},
                  setItem:function(){throw new DOMException('QuotaExceededError')},
                  removeItem:function(){throw new DOMException('x')},
                  clear:function(){throw new DOMException('x')} };
      Object.defineProperty(window,'localStorage',{configurable:true,value:mau});
      Object.defineProperty(window,'sessionStorage',{configurable:true,value:mau});
      window.__erros = [];
      addEventListener('error', function(e){ window.__erros.push(String(e.message)) });
      addEventListener('unhandledrejection', function(e){ window.__erros.push('promessa: '+e.reason) });
    })()""")
    for f in ['assets/js/favoritos.js', 'assets/js/conta.js']:
        c.js("var s=document.createElement('script');s.src='%s?t='+performance.now();document.head.appendChild(s)"%f)
        time.sleep(.5)
    d=json.loads(c.js("""JSON.stringify({
      favoritos: typeof window.Favoritos === 'object',
      conta: typeof window.Conta === 'object',
      lista: (function(){try{return window.Favoritos.lista().length}catch(e){return 'EXCEPCAO'}})(),
      marcar: (function(){try{return window.Favoritos.alternar({n:'X',la:40,lo:-8})}catch(e){return 'EXCEPCAO'}})(),
      sessao: (function(){try{return String(window.Conta.activa())}catch(e){return 'EXCEPCAO'}})(),
      erros: window.__erros})"""))
    ok = d['favoritos'] and d['conta'] and d['lista']==0 and d['marcar']=='marcada' and not d['erros']
    print('  tudo a atirar excepções       %s  %s' % ('✓' if ok else '✗', json.dumps(d)))
    if not ok: erro('armazenamento bloqueado: %s'%d)
finally: c.fechar()

print('\n== 6. página de privacidade ==')
for w,h,mob,rot in [(375,812,True,'telemóvel'),(1280,900,False,'computador')]:
    c=Chrome(porta=livre())
    try:
        c.cmd('Emulation.setDeviceMetricsOverride',width=w,height=h,deviceScaleFactor=1,mobile=mob)
        c.abrir('http://127.0.0.1:%d/privacidade.html'%PORTA, espera=1.6)
        con=contraste(c)
        d=json.loads(c.js("""JSON.stringify({
          transbordo:document.documentElement.scrollWidth+'/'+innerWidth,
          h2:document.querySelectorAll('h2').length,
          pendentes:document.querySelectorAll('.texto__pendente').length,
          volta:!!document.querySelector('.texto__voltar a')})"""))
        ok = d['transbordo'].split('/')[0]==d['transbordo'].split('/')[1] and d['volta'] and not con
        print('  %-11s %s contraste=%d %s' % (rot, '✓' if ok else '✗', len(con), json.dumps(d)))
        if con: erro('privacidade %s contraste: %s'%(rot,con))
        if not ok: erro('privacidade %s: %s'%(rot,d))
        if d['pendentes']: erro('privacidade: %d bloco(s) ainda por preencher'%d['pendentes'])
    finally: c.fechar()

print('\n== 6b. o mapa «Onde fica» ==')
c=novo(375,812,True)
try:
    escolherPraia(c)
    d=json.loads(c.js('''JSON.stringify({
      visivel: !document.getElementById('mapa').hidden,
      formas: document.querySelectorAll('.m-terra').length,
      rotulos: [...document.querySelectorAll('.m-nome')].map(t=>t.textContent),
      ponto: !!document.querySelector('.m-ponto'),
      fora: [...document.querySelectorAll('.m-nome')].filter(t=>{
        const b=t.getBBox(); return b.x<0 || b.x+b.width>640; }).map(t=>t.textContent),
      transbordo: document.documentElement.scrollWidth+'/'+innerWidth})'''))
    print('  desenhado    %s  %d formas, %d rótulos' % ('✓' if d['visivel'] else '✗', d['formas'], len(d['rotulos'])))
    if not d['visivel']: erro('o mapa não apareceu')
    if d['formas'] < 3: erro('o mapa tem só %d formas — a vista está vazia' % d['formas'])
    if not d['ponto']: erro('o mapa não marca a praia')
    # ZERO RÓTULOS PASSAVA. O `fora` é um filtro sobre `rotulos`, e um filtro
    # sobre lista vazia dá lista vazia — logo «todos dentro da tela» era ✓ com
    # o mapa sem um único nome de concelho. Provado por mutação, trocando o
    # `postos.map` por `[].map`: «12 formas, 0 rótulos / rótulos ✓ todos dentro
    # da tela / FALHAS: 0». A ausência tem de ser um erro, não um vazio.
    if len(d['rotulos']) < 3:
        erro('o mapa desenhou %d rótulos de concelho — sem nomes ninguém sabe onde '
             'fica a praia' % len(d['rotulos']))
    elif d['fora']: erro('rótulos fora da tela: %s' % d['fora'])
    else: print('  rótulos      ✓ %d, todos dentro da tela' % len(d['rotulos']))
    if d['transbordo'].split('/')[0] != d['transbordo'].split('/')[1]:
        erro('o mapa faz a página transbordar: %s' % d['transbordo'])

    # O MAPA ALINHA COM OS IRMÃOS. Teve um gutter próprio por cima do gutter do
    # <section class="resultado"> que o contém, e ficava 16 px para dentro de
    # cada lado — 311 px onde o aviso das bandeiras media 343. Compara-se com o
    # aviso porque é o vizinho de baixo, que é onde a diferença se via.
    torto=False
    for larg in (375, 700, 1000):
        c.cmd('Emulation.setDeviceMetricsOverride', width=larg, height=900,
              deviceScaleFactor=1, mobile=larg < 620)
        time.sleep(.45)
        cx=json.loads(c.js('''JSON.stringify(['.mapa__tela', '.aviso-bandeiras'].map(function (k) {
          var r = document.querySelector(k).getBoundingClientRect();
          return [Math.round(r.left), Math.round(r.width)]; }))'''))
        if cx[0] != cx[1]:
            torto=True
            erro('a %d px o mapa não alinha com o aviso: tela %s, aviso %s' % (larg, cx[0], cx[1]))
    if not torto: print('  alinhado     ✓ a mesma largura do aviso a 375, 700 e 1000 px')
    c.cmd('Emulation.setDeviceMetricsOverride', width=375, height=812, deviceScaleFactor=1, mobile=True)

    # A PROMESSA: o mapa existe para não haver pedidos a terceiros. Se um dia
    # alguém trocar isto por tiles, o site passa a mandar o IP de quem visita
    # para outro servidor — e a página do Perfil promete o contrário.
    hosts=json.loads(c.js('''JSON.stringify([...new Set(
      performance.getEntriesByType('resource')
        .map(r=>new URL(r.name).host).filter(h=>h!==location.host))])'''))
    permitidos={'api.open-meteo.com','marine-api.open-meteo.com'}
    intrusos=[h for h in hosts if h not in permitidos]
    if intrusos: erro('o site contactou servidores que não devia: %s' % intrusos)
    else: print('  sem terceiros ✓ só %s' % ', '.join(sorted(hosts)))
finally: c.fechar()

print('\n== 6c. as duas partes do dia ==')
c=novo(375,812,True)
try:
    escolherPraia(c)
    modos={'junto':0,'partido':0,'sem':0}
    for dia in range(6):
        c.js("document.getElementById('dia-%d').click()" % dia); time.sleep(.4)
        d=json.loads(c.js(r"""JSON.stringify({
          classe: document.getElementById('v-partes').className,
          resposta: document.getElementById('v-resposta').textContent,
          fatias: [...document.querySelectorAll('.fatia')].map(x => ({
            nome: (x.querySelector('.fatia__nome')||{}).textContent,
            nota: (x.querySelector('.fatia__nota')||{}).textContent,
            lido: (x.querySelector('.visually-hidden')||{}).textContent})),
          blocos: [...document.querySelectorAll('.bloco')].map(x => ({
            nome: (x.querySelector('.bloco__nome')||{}).textContent,
            palavra: (x.querySelector('.bloco__palavra')||{}).textContent,
            nota: ((x.querySelector('.bloco__nota')||{}).textContent) || '',
            cor: [...x.classList].filter(k => k.indexOf('parte--') === 0 && k !== 'parte--passou')[0] || '',
            temIcone: !!x.querySelector('.bloco__icone svg'),
            lido: (x.querySelector('.visually-hidden')||{}).textContent})),
          palavraJunto: (document.querySelector('.partes__palavra')||{}).textContent || '',
          iconeJunto: !!document.querySelector('.partes__icone svg'),
          notaDoDia: ((document.querySelector('.dia[aria-selected="true"] .dia__nota')||{}).textContent) || '',
          transbordo: document.documentElement.scrollWidth+'/'+innerWidth})"""))
        # A MANHÃ E A TARDE SÃO SEMPRE DOIS BLOCOS. Houve uma versão em que os
        # dias iguais vinham num bloco só, e o cartão mudava de feitio
        # consoante o dia. Se voltar, isto apanha.
        if not d['blocos']:
            print('  dia %d        · sem previsão para as duas partes' % dia)
            modos['sem'] += 1; continue
        if len(d['blocos']) != 2:
            erro('dia %d: %d blocos, deviam ser sempre 2' % (dia, len(d['blocos']))); continue
        if d['fatias']:
            erro('dia %d: voltou o estado de bloco único (%d fatias)' % (dia, len(d['fatias'])))
        for b in d['blocos']:
            if not b['palavra']: erro('dia %d: bloco sem palavra' % dia)
            if b['nota'] and not b['temIcone']: erro('dia %d: bloco com nota e sem ícone' % dia)
        notas = [b['nota'] for b in d['blocos'] if b['nota']]
        nomes = [b['nome'] for b in d['blocos']]
        cores = [b['cor'] for b in d['blocos']]
        difere = cores[0] != cores[1]
        modos['partido' if difere else 'junto'] += 1
        # A frase por cima só quando uma das partes NÃO TEM número: aí não há
        # nada no bloco que explique porquê. Quando as duas têm nota, os dois
        # blocos já dizem qual é a melhor, e repeti-lo por extenso («A manhã
        # está melhor») era dizer duas vezes a mesma coisa — saiu a pedido.
        semNumero = any(not b['nota'] for b in d['blocos'])
        diaSemNota = not d['notaDoDia']
        # A LINHA POR CIMA DOS BLOCOS SAIU, a pedido. Ela existia para explicar
        # uma parte sem número — e desde que a penalização entra na nota, não
        # há partes sem número. Fica a asserção do contrário: nunca há texto.
        if d['resposta'].strip():
            erro('dia %d: voltou a haver texto por cima dos blocos: %r' % (dia, d['resposta']))
        if semNumero:
            erro('dia %d: uma parte ficou sem número — todas têm de ter nota' % dia)
        if diaSemNota:
            erro('dia %d: a tira ficou sem nota — todos os dias têm de ter uma' % dia)

        if [n.split(' ·')[0] for n in nomes] != ['Manhã','Tarde']:
            erro('dia %d: nomes das partes: %s' % (dia, nomes))

        # A ARITMÉTICA FECHA À VISTA. É a queixa que originou este desenho, e
        # esta é a asserção que impede que volte. A linha «Nota do dia 74 em
        # 100» saiu do cartão a pedido — mas a nota do dia NÃO saiu do ecrã:
        # está na célula deste dia, na tira, e é essa que tem de ser a média das
        # duas que estão nos blocos. floor(x+0.5) e não round(): o Python
        # arredonda 80,5 para 80 e o Math.round do JS para 81.
        # Um dia sem número é legítimo (veto) e é tratado acima: aqui só se
        # verifica que, QUANDO há número, ele é mesmo a média das duas.
        if len(notas) == 2 and not diaSemNota:
            media = int(sum(int(n) for n in notas)/2 + 0.5)
            # A nota do dia é a MÉDIA das duas — e nunca acima do que a
            # penalização do próprio dia deixa. O tecto existe por um caso
            # real: a chuva soma-se ao longo do dia, portanto o DIA pode estar
            # vetado com as duas partes sãs, e aí a média delas seria alta de
            # mais para um dia chumbado. O que NÃO pode acontecer nunca é o
            # dia valer MAIS do que as suas partes — era essa a queixa.
            if int(d['notaDoDia']) > media:
                erro('dia %d: a tira diz %s e a média das duas é %d — o dia não pode valer MAIS: %s'
                     % (dia, d['notaDoDia'], media, notas))
        if d['transbordo'].split('/')[0] != d['transbordo'].split('/')[1]:
            erro('dia %d: o cartão faz transbordar (%s)' % (dia, d['transbordo']))
    print('  6 dias        ✓ sempre dois blocos — %d com cores iguais, %d diferentes, %d sem dados'
          % (modos['junto'], modos['partido'], modos['sem']))

    # A LEI: NENHUM NÚMERO SEM A SUA PALAVRA AO LADO. É o que cura o 76 amarelo
    # encostado ao 73 verde — deixa de ser contradição e passa a classificação.
    orfaos=json.loads(c.js(r"""(function(){
      var maus = [];
      document.querySelectorAll('.fatia').forEach(function (x) {
        if (x.querySelector('.fatia__nota') && !x.querySelector('.fatia__nome')) maus.push('fatia');
      });
      document.querySelectorAll('.bloco').forEach(function (x) {
        if (x.querySelector('.bloco__nota') && !x.querySelector('.bloco__palavra')) maus.push('bloco');
      });
      document.querySelectorAll('.dia').forEach(function (x) {
        if (x.querySelector('.dia__nota') && !x.querySelector('.dia__palavra')) maus.push('dia');
      });
      return JSON.stringify(maus);})()"""))
    if orfaos: erro('há números sem palavra ao lado: %s' % orfaos)
    else: print('  a lei          ✓ nenhum número aparece sem a sua palavra')

    # As partes dizem-se por nome, nunca por hora de relógio.
    horas=json.loads(c.js(r"""JSON.stringify(
      (document.getElementById('veredicto').innerText.match(/\d+\s*h\b(?!\/)/g) || []))"""))
    if horas: erro('o cartão mostra horas de relógio: %s' % horas)
    else: print('  sem relógio   ✓ diz «Manhã» e «Tarde», e mais nada')

    # O «✕» saiu: lê-se como avaria ou como «fechado», nunca como «não vale a pena».
    if '✕' in c.js("document.getElementById('resultado').innerText"):
        erro('o ✕ voltou ao ecrã')
    else: print('  sem ✕          ✓ onde não há nota, há palavras')

    con=contraste(c)
    if con: erro('contraste no cartão: %s' % con)
    else: print('  contraste     ✓ limpo')

    d=json.loads(c.js(r"""JSON.stringify({
      dias: document.querySelectorAll('.dia').length,
      /* UMA fila: todas as células com o mesmo topo. Contar colunas deixou de
         servir — com grid-auto-flow: column as faixas são implícitas e o
         gridTemplateColumns computa para «none». */
      linhas: [...new Set([...document.querySelectorAll('.dia')].map(
        x => Math.round(x.getBoundingClientRect().top)))].length,
      largura: Math.round((document.querySelector('.dia')||{getBoundingClientRect:()=>({width:0})}).getBoundingClientRect().width),
      rolo: document.getElementById('dias').scrollWidth > document.getElementById('dias').clientWidth + 1,
      roloPagina: document.documentElement.scrollWidth > innerWidth + 1,
      palavras: [...document.querySelectorAll('.dia__palavra')].map(x => x.textContent).filter(Boolean).length})"""))
    antes = len(falhas)
    if d['dias'] != 6: erro('a tira deixou de ter 6 dias: %d' % d['dias'])
    if d['linhas'] != 1: erro('a tira partiu-se em %d linhas — devia ser uma fila' % d['linhas'])
    # A célula tem de manter o tamanho que tem no computador. Houve uma versão
    # a apertar os seis para dentro dos 375 px: davam 53 px cada, obrigavam a
    # abreviar «Amanhã» e a palavra partia-se em três linhas. Saiu a pedido.
    if d['largura'] < 88: erro('a célula encolheu para %d px — devia ficar nos ~90' % d['largura'])
    # A tira ROLA no telemóvel, e é assim de propósito: os seis ao tamanho do
    # computador não cabem em 343 px de cartão. O que NÃO pode rolar é a página.
    if not d['rolo']: erro('a tira devia rolar a 375 px e não rola')
    if d['roloPagina']: erro('é a PÁGINA que rola na horizontal, e não só a tira')
    if d['palavras'] != 6: erro('só %d dos 6 dias têm palavra' % d['palavras'])
    # Só a seguir a nenhum ✗: um ✓ por baixo de um erro lê-se como aprovação
    # daquilo que acabou de falhar.
    if len(falhas) == antes:
        print('  tira          ✓ 6 dias numa fila de %d px, a tira rola e a página não' % d['largura'])

    # O que rebenta primeiro numa tira apertada é o TEXTO a passar por cima do
    # contorno — aconteceu duas vezes seguidas («Amanhã» a medir 47,5 px numa
    # célula com 46 úteis, e a terceira linha da palavra cortada) e nenhuma das
    # contas anteriores dava por isso, porque contam colunas e não pixéis.
    fora=json.loads(c.js(r"""JSON.stringify(
      [...document.querySelectorAll('.dia')].flatMap(function (cel) {
        var r = cel.getBoundingClientRect(), cs = getComputedStyle(cel);
        var e = parseFloat(cs.paddingLeft), d = parseFloat(cs.paddingRight);
        return [...cel.children].filter(function (k) {
          var q = k.getBoundingClientRect();
          return q.width > r.width - 4 - e - d + .5 || q.bottom > r.bottom - 1;
        }).map(function (k) { return k.className + ' "' + k.innerText.replace(/\s+/g, ' ') + '"'; });
      }))"""))
    if fora: erro('texto a sair da célula do dia: %s' % fora)
    else: print('  cabe na fila  ✓ nome, nota e palavra dentro da célula')

    alturas=json.loads(c.js(r"""JSON.stringify([...new Set(
      [...document.querySelectorAll('.dia')].map(function (x) {
        return Math.round(x.getBoundingClientRect().height); }))])"""))
    if len(alturas) != 1: erro('as seis células ficaram com alturas diferentes: %s' % alturas)
    else: print('  fila direita  ✓ as seis células com a mesma altura (%d px)' % alturas[0])

    # O ANEL DO DIA ESCOLHIDO, e o dia escolhido À VISTA. Os dois já se
    # partiram nesta tira: o `overflow-x` cortava os 2 px do anel do lado
    # esquerdo (contorno reto à esquerda e redondo à direita, commit b7cd579),
    # e o innerHTML novo do `desenharDias` punha o `scrollLeft` a zero — quem
    # rolasse até «Segunda» e lhe tocasse via-a sair do ecrã.
    def tira():
        return json.loads(c.js(r"""JSON.stringify((function () {
          var t = document.getElementById('dias');
          var sel = t.querySelector('.dia[aria-selected="true"]');
          var tr = t.getBoundingClientRect(), sr = sel.getBoundingClientRect();
          return { qual: sel.querySelector('.dia__nome').innerText.trim(),
                   esq: Math.round(sr.left - tr.left), dir: Math.round(tr.right - sr.right),
                   dentro: sr.left >= tr.left - .5 && sr.right <= tr.right + .5 };})())"""))
    c.js("document.getElementById('dia-0').click()"); time.sleep(.6)
    d0 = tira()
    if d0['esq'] < 3: erro('o anel do dia escolhido fica cortado à esquerda (folga %d px)' % d0['esq'])
    c.js("document.getElementById('dia-5').click()"); time.sleep(.6)
    d5 = tira()
    if not d5['dentro']: erro('escolher o último dia deixa-o fora de vista: %s' % d5)
    elif d5['dir'] < 3: erro('o anel do último dia fica cortado à direita (folga %d px)' % d5['dir'])
    else: print('  anel e rolo   ✓ folga de 3 px nos dois topos, e o dia escolhido vem à vista')

    # E EM CIMA. `overflow-x: auto` obriga o `overflow-y` a passar de `visible`
    # a `auto`: uma tira que rola aos lados corta TAMBÉM em cima e em baixo. Já
    # aconteceu duas vezes — nos favoritos e agora nos dias — e a segunda foi
    # pior, porque ao anel de 3 px do escolhido soma-se o `:hover` que levanta o
    # cartão 2. Mede-se em repouso E com o cartão levantado, que é o estado em
    # que um telemóvel fica depois do toque.
    def folgas():
        return json.loads(c.js(r"""JSON.stringify(
          ['#dias', '.favoritos__lista'].flatMap(function (k) {
            var t = document.querySelector(k);
            if (!t || getComputedStyle(t).overflowX === 'visible') return [];
            var tr = t.getBoundingClientRect();
            return [...t.children].flatMap(function (x) {
              var r = x.getBoundingClientRect();
              var n = (getComputedStyle(x).boxShadow.match(/-?\d+(?:\.\d+)?px/g) || []).map(parseFloat);
              var esp = n.length >= 4 ? n[3] + n[2] : 0;          /* espalhamento + desfoque */
              var cima = (r.top - esp) - tr.top, baixo = tr.bottom - (r.bottom + esp);
              return (cima < -.5 || baixo < -.5)
                ? [k + ' «' + x.innerText.replace(/\s+/g, ' ').slice(0, 12) + '»: cima ' +
                   cima.toFixed(1) + ', baixo ' + baixo.toFixed(1)] : [];
            });
          }))"""))
    r = folgas()
    if r: erro('contorno cortado na vertical: %s' % r)
    # O :hover colado depois do toque — o estado real de um telemóvel.
    c.js(r"""(function(){
      /* O levantar LÊ-SE da folha de estilo, não se escreve aqui à mão: senão,
         quem aumentasse o translateY do :hover passava por esta guarda sem ela
         dar por nada, e o corte voltava. */
      var alto = 0;
      [...document.styleSheets].forEach(function (ss) {
        /* `if (r.cssRules) return anda(...)` NÃO serve: desde o CSS Nesting,
           no Chrome TODA a regra de estilo tem um `cssRules` vazio — que é
           verdadeiro — e a regra era tratada como contentor sem nunca se lhe
           olhar para o selector. Custou-me duas mutações a passar em falso:
           `alto` ficava a 0, não se levantava nada, e a guarda dizia ✓ com o
           contorno cortado. Por isso: primeiro o selector, e só se desce onde
           há mesmo filhos. */
        try { (function anda(rs) { [...rs].forEach(function (r) {
          if (r.selectorText === '.dia:hover' && r.style && r.style.transform) {
            var m = r.style.transform.match(/translateY\((-?[\d.]+)px\)/);
            if (m) alto = Math.max(alto, Math.abs(parseFloat(m[1])));
          }
          if (r.cssRules && r.cssRules.length) anda(r.cssRules);
        });})(ss.cssRules); } catch (e) {}
      });
      if (!alto) throw new Error('não encontrei o translateY do .dia:hover');
      var s = document.createElement('style'); s.id = 'forcar-hover';
      s.textContent = '.dia[aria-selected="true"]{transform:translateY(-' + alto + 'px)}';
      document.head.appendChild(s);
      return alto;})()"""); time.sleep(.4)
    rh = folgas()
    c.js("document.getElementById('forcar-hover').remove()")
    if rh: erro('com o cartão levantado, o contorno é cortado: %s' % rh)
    if not r and not rh: print('  anel inteiro  ✓ nada cortado em cima nem em baixo, levantado ou não')
    c.js("document.getElementById('dia-0').click()"); time.sleep(.4)
finally: c.fechar()

print('\n== 6d. o dia que chumba com as duas partes sãs ==')
# NÃO é um caso teórico e NÃO acontece na previsão de hoje, por isso tem de ser
# forçado: o veto da chuva conta os milímetros por SOMA e o dia é a união exacta
# das duas partes, logo 1,2 mm de manhã e 1,2 à tarde passam as duas — o veto é
# aos 2 — e o dia chumba em 2,4. Enquanto o cartão teve a linha «Nota do dia»,
# era ela que dizia «Hoje não tem nota: chuva a sério». Essa linha saiu a pedido,
# e sem esta guarda o ecrã volta a ficar com barra vermelha por cima de dois
# blocos verdes de 94 sem nada a explicar porquê.
ENXERTO = r"""
(function () {
  var t = setInterval(function () {
    if (!window.Modelo || !window.Modelo.avaliarDia) return;
    clearInterval(t);
    var orig = window.Modelo.avaliarDia, n = 0;
    window.Modelo.avaliarDia = function () {
      var r = orig.apply(this, arguments);
      if (n++ === 0 && r && r.v && r.partes[0] && r.partes[0].v && r.partes[1] && r.partes[1].v) {
        /* o DIA chumbado com as duas partes sãs: a nota do dia cai na banda do
           vermelho, que é o que substituiu a frase que explicava isto. */
        r.v.nota = 41; r.v.cor = 'vermelho'; r.v.vetos = ['chuva a sério'];
        r.partes[0].v.nota = 94; r.partes[0].v.cor = 'verde'; r.partes[0].v.vetos = [];
        r.partes[1].v.nota = 94; r.partes[1].v.cor = 'verde'; r.partes[1].v.vetos = [];
      }
      return r;
    };
  }, 5);
})();
"""
c=Chrome(porta=livre())
try:
    c.cmd('Emulation.setDeviceMetricsOverride',width=375,height=812,deviceScaleFactor=1,mobile=True)
    c.cmd('Page.addScriptToEvaluateOnNewDocument', source=ENXERTO)
    c.abrir('http://127.0.0.1:%d/'%PORTA, espera=2.6)
    escolherPraia(c)
    d=json.loads(c.js(r"""JSON.stringify({
      resposta: document.getElementById('v-resposta').textContent,
      notas: [...document.querySelectorAll('.bloco__nota')].map(x => x.textContent),
      notaTira: ((document.querySelector('.dia[aria-selected="true"] .dia__nota')||{}).textContent)||'',
      cor: document.body.getAttribute('data-cor')})"""))
    if d['notas'] != ['94','94'] or d['cor'] != 'vermelho':
        print('  · o enxerto não pegou (%s / %s) — secção sem valor nesta corrida' % (d['notas'], d['cor']))
    elif not d['notaTira']:
        erro('o dia chumbado ficou sem nota na tira — todos os dias têm de ter uma')
    elif int(d['notaTira']) >= 45:
        # A frase que explicava isto saiu a pedido. Quem carrega a informação
        # agora é a NOTA: o veto entra nela e ela cai na banda do vermelho.
        # Sem isto ficavam dois blocos verdes de 94 debaixo de um cartão
        # vermelho com uma nota alta, que era a contradição de origem.
        erro('o dia está chumbado e a tira mostra %s, fora da banda do vermelho' % d['notaTira'])
    elif d['resposta'].strip():
        erro('voltou a haver texto por cima dos blocos: %r' % d['resposta'])
    else:
        print('  dia chumbado  ✓ a tira mostra %s, dentro do vermelho, com as partes a 94'
              % d['notaTira'])
finally: c.fechar()

print('\n== 6c-ter. o tema escuro ==')
# O medidor corria só em tema claro, e por isso nunca soube que o atalho
# «Saltar para o resultado» estava a 2,14:1 no escuro. Um site que se pinta
# sozinho conforme o telemóvel tem de ser medido nos dois.
c=Chrome(porta=livre())
try:
    c.cmd('Emulation.setDeviceMetricsOverride', width=375, height=812, deviceScaleFactor=1, mobile=True)
    c.cmd('Emulation.setEmulatedMedia', features=[{'name':'prefers-color-scheme','value':'dark'}])
    c.abrir('http://127.0.0.1:%d/'%PORTA, espera=2.6)
    escolherPraia(c)
    mau=[]
    for dia in range(6):
        c.js("document.getElementById('dia-%d').click()" % dia); time.sleep(.3)
        mau += contraste(c)
    # Com um bloco ABERTO: é onde os números vivem, e é a zona mais apertada do
    # ficheiro — texto pequeno sobre o fundo pastel. Esta medição já apanhou o
    # «já passou» a 3,96:1, que só existia no escuro e só depois das 13h.
    c.js("var b=document.querySelector('button.bloco__cabeca'); if(b) b.click()")
    time.sleep(.6)
    mau += contraste(c)
    # e com o atalho em foco, que é a única altura em que se vê
    c.js("document.querySelector('.salta').focus()"); time.sleep(.3)
    mau += contraste(c)
    if mau: erro('contraste no tema escuro: %s' % sorted(set(mau))[:6])
    else: print('  contraste     ✓ limpo no escuro, 6 dias, painel aberto e atalho em foco')
finally: c.fechar()

print('\n== 6c-bis. os números, dentro de cada parte ==')
c=novo(375,812,True)
try:
    escolherPraia(c)
    d=json.loads(c.js(r"""JSON.stringify({
      cabs: [...document.querySelectorAll('.bloco__cabeca')].map(function(x){return {
        tag: x.tagName.toLowerCase(), exp: x.getAttribute('aria-expanded'),
        controla: x.getAttribute('aria-controls'), parte: x.parentNode.getAttribute('data-parte'),
        alto: Math.round(x.getBoundingClientRect().height)};}),
      abertos: document.querySelectorAll('.bloco__numeros:not([hidden])').length,
      pista: document.getElementById('v-pista') ? !document.getElementById('v-pista').hidden : null,
      fonte: (document.querySelector('.rodape__fontes')||{}).textContent || '',
      detalheMorreu: !document.getElementById('detalhe')})"""))
    if d['cabs'] and any(x['tag'] != 'button' for x in d['cabs']):
        print('  · há partes sem números — a cabeça não é botão, como deve')
    if not all(x['exp'] == 'false' for x in d['cabs'] if x['tag'] == 'button'):
        erro('ao chegar, os blocos deviam estar todos fechados: %s' % d['cabs'])
    if d['abertos']: erro('ao chegar há %d painéis abertos' % d['abertos'])
    if not d['pista']: erro('sem o convite escrito, a descoberta fica só na seta')
    if not d['detalheMorreu']: erro('o «Ver os números» ainda existe — dois sítios com os mesmos números')
    # A área de toque: 44px é o mínimo, e a cabeça é o maior botão da página.
    baixos = [x for x in d['cabs'] if x['tag'] == 'button' and x['alto'] < 44]
    if baixos: erro('cabeças com menos de 44px de altura: %s' % baixos)
    # A atribuição vivia no fim do cartão e saiu a pedido. A licença NÃO deixa
    # de existir por isso: mudou-se para o rodapé da página, e o DWD — que a
    # documentação marinha exige e que só vivia naquela linha — foi com ela.
    faltam = [n for n in ('Open-Meteo', 'DWD') if n not in d['fonte']]
    if faltam: erro('a atribuição a %s desapareceu do rodapé — é obrigação de licença' % ', '.join(faltam))
    else: print('  atribuição    ✓ Open-Meteo e DWD no rodapé, sem carregar em nada')
    print('  ao chegar     ✓ %d cabeças, todas fechadas, com o convite à vista' % len(d['cabs']))

    # --- ABRIR
    c.js("var b=document.querySelector('button.bloco__cabeca'); if(b) b.click()"); time.sleep(.45)
    d=json.loads(c.js(r"""JSON.stringify({
      exp: [...document.querySelectorAll('button.bloco__cabeca')].map(function(x){return x.getAttribute('aria-expanded');}),
      abertos: [...document.querySelectorAll('.bloco__numeros:not([hidden])')].map(function(x){return {
        id: x.id, papel: x.getAttribute('role'), rotulo: x.getAttribute('aria-label'),
        live: x.getAttribute('aria-live'),
        linhas: [...x.querySelectorAll('.nums__linha')].map(function(l){return {
          nome: (l.querySelector('.nums__nome')||{}).textContent || '',
          valor: (l.querySelector('.nums__valor')||{}).textContent || '',
          palavra: (l.querySelector('.nums__palavra')||{}).textContent || '',
          icone: !!l.querySelector('.nums__icone svg')};})};}),
      pista: !document.getElementById('v-pista').hidden,
      transbordo: document.documentElement.scrollWidth+'/'+innerWidth})"""))
    if len(d['abertos']) != 1: erro('depois de carregar há %d painéis abertos' % len(d['abertos']))
    else:
        a = d['abertos'][0]
        # role="group" e NÃO role="region": um region com nome é um LANDMARK, e
        # ficavam dois marcos a entrar e a sair do rotor a cada toque.
        if a['papel'] != 'group': erro('o painel tem role=%r — devia ser group' % a['papel'])
        if not a['rotulo']: erro('o painel não tem aria-label')
        # o #veredicto é aria-live="polite": sem isto, abrir despeja os cinco
        # factores em voz alta por cima do «expandido».
        if a['live'] != 'off': erro('o painel não tem aria-live="off" dentro da região live')
        if len(a['linhas']) < 3: erro('só %d factores no painel' % len(a['linhas']))
        # A LEI: nenhum número sem a sua palavra, e nenhuma linha sem ícone.
        maus = [l for l in a['linhas'] if not l['valor'] or not l['palavra'] or not l['icone']]
        if maus: erro('linhas sem valor, sem palavra ou sem ícone: %s' % maus[:2])
        # Nenhum travessão: uma linha sem valor não chega a ser escrita.
        if any('—' in l['valor'] for l in a['linhas']):
            erro('há travessões no painel — a linha devia não ser escrita')
        # A ordem é FIXA e é a ordem por que se pensa num dia de praia — não a
        # do peso na nota. Se alguém a trocar por outra, isto apanha; e se
        # renomear um factor, a linha vai para o fim em vez de desaparecer,
        # o que faz esta asserção falhar em vez de o ecrã ficar mudo.
        # A ÁGUA PODE FALTAR, e faltar é legítimo: numa praia de rio não existe,
        # e quando a API marinha não responde o modelo reparte os pontos dela
        # pelos outros de propósito. O que NÃO pode mudar é a ORDEM dos que
        # estão lá. Isto exigia os cinco e chumbava no runner num dia em que a
        # marinha falhou — «a ordem dos factores mudou», com a ordem intacta.
        nomes = [l['nome'] for l in a['linhas']]
        ESPERADA = ['Sol', 'Calor', 'Vento', 'Água do mar', 'Chuva']
        if nomes != [x for x in ESPERADA if x in nomes]:
            erro('a ordem dos factores mudou: %s (esperada %s)' % (nomes, ESPERADA))
        elif 'Água do mar' not in nomes:
            print('  · sem dados de mar hoje — a água não entra no painel, e a ordem'
                  ' dos outros quatro está certa')
        # E o painel não pode voltar a afirmar que a ordem é a do peso.
        if 'mais pesa' in c.js("document.querySelector('.nums__ordem').textContent"):
            erro('o painel diz que a ordem é a do peso, e já não é')
        # A água é a mesma nas duas partes — é o número que a conta usou, e o
        # avaliarDia copia-a do dia para dentro de cada parte antes de a
        # pontuar. Aqui confirma-se que o ecrã não a reparte por engano.
        agua = [l for l in a['linhas'] if l['nome'].startswith('Água')]
        if agua:
            valores = json.loads(c.js(r"""(function(){
              var out = [];
              document.querySelectorAll('.bloco__numeros').forEach(function (p) {
                p.querySelectorAll('.nums__linha').forEach(function (l) {
                  var n = l.querySelector('.nums__nome');
                  if (n && n.textContent.indexOf('Água') === 0) {
                    out.push(l.querySelector('.nums__valor').textContent);
                  }});});
              return JSON.stringify(out);})()"""))
            if len(set(valores)) > 1:
                erro('a água aparece diferente nas duas partes: %s' % valores)
        print('  aberto        ✓ %d factores na ordem certa, todos com valor, palavra e ícone'
              % len(a['linhas']))
    if d['pista']: erro('o convite continua visível com um painel aberto')
    if d['transbordo'].split('/')[0] != d['transbordo'].split('/')[1]:
        erro('o painel aberto faz transbordar: %s' % d['transbordo'])
    con=contraste(c)
    if con: erro('contraste com o painel aberto: %s' % con)
    else: print('  contraste     ✓ limpo com o painel aberto')

    # --- SÓ UM DE CADA VEZ, e o segundo toque fecha
    c.js("""var bs=document.querySelectorAll('button.bloco__cabeca');
            if (bs[1]) bs[1].click();"""); time.sleep(.45)
    n=int(c.js("document.querySelectorAll('.bloco__numeros:not([hidden])').length"))
    if n != 1: erro('ao abrir o segundo, ficaram %d painéis abertos' % n)
    else: print('  só um         ✓ abrir a tarde fecha a manhã')
    c.js("""var bs=document.querySelectorAll('button.bloco__cabeca');
            if (bs[1]) bs[1].click();"""); time.sleep(.45)
    d=json.loads(c.js(r"""JSON.stringify({
      abertos: document.querySelectorAll('.bloco__numeros:not([hidden])').length,
      pista: !document.getElementById('v-pista').hidden})"""))
    if d['abertos']: erro('o segundo toque não fechou')
    elif not d['pista']: erro('fechou mas o convite não voltou')
    else: print('  segundo toque ✓ fecha, e o convite volta')

    # --- MUDAR DE DIA mantém aberto (quem abriu a manhã está a comparar manhãs)
    c.js("var b=document.querySelector('button.bloco__cabeca'); if(b) b.click()"); time.sleep(.4)
    c.js("document.getElementById('dia-2').click()"); time.sleep(.5)
    d=json.loads(c.js(r"""JSON.stringify({
      abertos: [...document.querySelectorAll('.bloco__numeros:not([hidden])')].map(function(x){return x.id;})})"""))
    if d['abertos'] != ['nums-manha']:
        erro('mudar de dia devia manter a manhã aberta, e ficou %s' % d['abertos'])
    else: print('  mudar de dia  ✓ mantém a parte aberta')

    # CARREGAR NUMA CABEÇA NÃO MEXE O ECRÃ. Houve aqui um window.scrollBy a
    # compensar a diferença de altura, para o bloco tocado ficar no mesmo
    # píxel: com a manhã aberta, tocar na tarde dava scrollY −248 no telemóvel
    # e −291 no computador, e o nome da praia saltava esses mesmos pixéis. E
    # nem chegava ao alvo — pedia 374 px de compensação com 248 de scroll
    # acima, ficava cortado no limite e a cabeça ainda fugia 126.
    # Só se mede com a cabeça À VISTA: ninguém carrega no que não vê, e com ela
    # acima do topo é a ancoragem do próprio Chrome que decide, não este código.
    antes = len(falhas)
    for aberto in (None, 'manha', 'tarde'):
        for qual in ('manha', 'tarde'):
            c.js("""(function(){var b=document.querySelector('.bloco__cabeca[aria-expanded="true"]');
                 if(b) b.click();})()"""); time.sleep(.35)
            if aberto:
                c.js("document.getElementById('cab-%s').click()" % aberto); time.sleep(.45)
            c.js("document.getElementById('cab-%s').scrollIntoView({block:'center'})" % qual)
            time.sleep(.45)
            m=json.loads(c.js("""JSON.stringify({y:Math.round(scrollY),
              cab:Math.round(document.getElementById('cab-%s').getBoundingClientRect().top)})""" % qual))
            if m['cab'] < 0: continue          # fora do ecrã: não é uma acção possível
            c.js("document.getElementById('cab-%s').click()" % qual); time.sleep(.7)
            n=json.loads(c.js("""JSON.stringify({y:Math.round(scrollY),
              cab:Math.round(document.getElementById('cab-%s').getBoundingClientRect().top)})""" % qual))
            if n['y'] != m['y']:
                erro('carregar na %s (com %s aberta) mexeu o ecrã: scrollY %+d'
                     % (qual, aberto or 'nenhuma', n['y']-m['y']))
            elif aberto in (None, qual) and n['cab'] != m['cab']:
                erro('carregar na %s fez a própria cabeça fugir %+d px'
                     % (qual, n['cab']-m['cab']))
    if len(falhas) == antes:
        print('  sem salto     ✓ carregar numa cabeça não mexe o ecrã')

    # QUAL DAS MÉTRICAS NÃO ESTÁ BOA. Um triângulo ao lado do nome, nas linhas
    # cujo valor é mau — e mais nada: não há frase, foi tirada a pedido.
    # O corte é o MESMO 0,40 com que o modelo despromove um dia de verde para
    # amarelo, e daí sai a garantia de que num bloco VERDE não há marca nenhuma.
    # A ÁGUA entra aqui, ao contrário do factor limitante do modelo: a marca é
    # sobre o número daquela linha, não sobre o dia.
    antes = len(falhas)
    vistos = {'verde': 0, 'amarelo': 0, 'vermelho': 0}
    marcados = {'verde': 0, 'amarelo': 0, 'vermelho': 0}
    for dia in range(6):
        c.js("document.getElementById('dia-%d').click()" % dia); time.sleep(.35)
        doDia = {}
        for parte in ('manha', 'tarde'):
            c.js("""(function(){var b=document.getElementById('cab-%s');
                 if(b && b.getAttribute('aria-expanded')!=='true') b.click();})()""" % parte)
            time.sleep(.3)
            d=json.loads(c.js(r"""JSON.stringify((function(){
              var pn = document.querySelector('.bloco__numeros:not([hidden])');
              if (!pn) return null;
              var cor = [...pn.parentNode.classList]
                .map(function(k){return (k.match(/^parte--(verde|amarelo|vermelho)$/)||[])[1];})
                .filter(Boolean)[0] || '';
              return { cor: cor,
                /* OS MILÍMETROS QUE A LINHA MOSTRA. Aqui estava a ler-se a
                   prosa do veto («O dia está chumbado: chuva a sério») de
                   #v-resposta e de .bloco__razao — e as duas desapareceram do
                   ecrã: a frase foi removida a pedido, e a .bloco__razao só se
                   escreve quando a parte fica SEM nota, o que já não acontece
                   a nenhuma. A excepção passou a ler string vazia, ou seja
                   deixou de perdoar seja o que for, e este teste falhou a
                   apontar para o sítio errado. Lê-se o número, não a frase. */
                chuva: (function(){
                  var l = [...pn.querySelectorAll('.nums__linha')].filter(function(x){
                    var n = x.querySelector('.nums__nome');
                    return n && [...n.childNodes].filter(function(k){return k.nodeType===3;})
                      .map(function(k){return k.textContent;}).join('').trim() === 'Chuva';})[0];
                  if (!l) return null;
                  var t = l.textContent || '';
                  var mm = t.match(/([\d,.]+)\s*mm/);
                  var pc = ((l.querySelector('.nums__valor')||{}).textContent||'').match(/([\d,.]+)\s*%/);
                  var prob = pc ? parseFloat(pc[1].replace(',', '.')) : null;
                  /* A PERGUNTA AO PRÓPRIO MODELO, em vez de repetir aqui a
                     tabela dele. A chuva pontua-se pela PROBABILIDADE, e uma
                     tarde com 0,1 mm e 35 % tem rácio 0,375 — abaixo do corte
                     de 0,40, portanto marca-se sozinha e a marca é legítima.
                     Adivinhar isso pelos milímetros deu falso positivo. */
                  var racio = (prob != null && window.Modelo)
                    ? Modelo._pontos.chuva(prob) / Modelo.PESOS.chuva : null;
                  return { mm: mm ? parseFloat(mm[1].replace(',', '.')) : 0,
                           prob: prob, racio: racio,
                           propria: (mm && parseFloat(mm[1].replace(',', '.')) >= 0.5)
                                    || (racio != null && racio < 0.40) };})(),
                marcas: pn.querySelectorAll('.nums__mau').length,
                quais: [...pn.querySelectorAll('.nums__linha')].filter(function(l){
                  return l.querySelector('.nums__mau');})
                  /* só o texto PRÓPRIO do nome: o `.visually-hidden` da marca
                     vive lá dentro e vinha colado («Água do mar, ponto fraco»). */
                  .map(function(l){var n=l.querySelector('.nums__nome');
                    return [...n.childNodes].filter(function(k){return k.nodeType===3;})
                      .map(function(k){return k.textContent;}).join('').trim();}),
                semSvg: [...pn.querySelectorAll('.nums__mau')].filter(function(x){return !x.querySelector('svg');}).length,
                semTexto: [...pn.querySelectorAll('.nums__linha')].filter(function(l){
                  return l.querySelector('.nums__mau') && !l.querySelector('.visually-hidden');}).length,
                foraDaLinha: pn.querySelectorAll('.nums__mau').length
                  - pn.querySelectorAll('.nums__linha .nums__mau').length };})())"""))
            if not d or not d['cor']: continue
            doDia[parte] = d
            vistos[d['cor']] += 1
            if d['marcas']:
                marcados[d['cor']] += 1
                # NUM DIA VERDE só a ÁGUA pode ser marcada. Os outros quatro
                # factores são os mesmos com que o modelo despromove um dia de
                # verde para amarelo: se um deles estivesse abaixo de 0,40, o
                # dia não era verde. A água está de fora desse cálculo de
                # propósito — «o mar gelado impede o banho, não impede o dia de
                # praia» — e por isso PODE aparecer fria num dia bom. É a única
                # excepção, e tem de continuar a ser a única.
                if d['cor'] == 'verde':
                    # Duas excepções, e só duas. A ÁGUA, porque está fora do
                    # cálculo que decide o verde. E a CHUVA COM MILÍMETROS: as
                    # duas vias que a marcam num bloco verde exigem ambas água
                    # a cair — a regra dos 0,5 mm (app.js: `mm >= FRACO_MM`) e
                    # o veto do dia herdado pela parte, que app.js:1113 só deixa
                    # passar se `p.d.mm > 0`. Logo `mm > 0` é a condição mais
                    # apertada que se mede SÓ pelo ecrã, e cobre as duas.
                    #
                    # O que isto apanha: um triângulo na chuva sem chuva
                    # nenhuma. O que NÃO apanha: 0,1 mm sem veto — para separar
                    # esse caso era preciso pôr os vetos no DOM, e não vale um
                    # atributo novo em produção só para o teste ler.
                    #
                    # Tudo o resto continua impossível: se um dos outros
                    # factores estivesse abaixo de 0,40, o bloco não era verde.
                    perm = {'Água do mar'}
                    ch = d.get('chuva') or {}
                    if (ch.get('mm') or 0) > 0 or ch.get('propria'): perm.add('Chuva')
                    fora = [x for x in d['quais'] if x not in perm]
                    if fora:
                        erro('bloco VERDE com triângulo em %s — só a água, ou a chuva com '
                             'milímetros ou rácio mau (a linha mostra %s)' % (fora, ch))
                # A LEI DO CARTÃO vale para a marca: um símbolo sozinho não diz
                # nada a quem ouve. E um triângulo sem SVG é um espaço vazio.
                if d['semSvg']: erro('%d marcas sem desenho nenhum lá dentro' % d['semSvg'])
                if d['semTexto']: erro('%d linhas com triângulo e sem texto para quem ouve' % d['semTexto'])
                if d['foraDaLinha']: erro('%d marcas fora de uma linha de factor' % d['foraDaLinha'])

        # A MESMA CHUVA NÃO SE ACUSA DUAS VEZES. O veto de chuva é do DIA, e o
        # ecrã fá-lo descer às partes — mas se UMA delas já tem chuva que
        # chegue para se marcar sozinha (>= 0,5 mm), a outra não tem de o levar
        # também. Foi assim que uma tarde VERDE, com 0,1 mm ao todo, apareceu
        # com triângulo na Chuva ao lado de uma manhã vetada: a penalização do
        # dia contada a dobrar, a mesma que estragava a nota.
        #
        # Nos dois blocos abaixo de 0,5 mm a marca desce e fica bem: aí a chuva
        # só existe somada ao longo do dia, e tem de aparecer algures.
        if len(doDia) == 2:
            for q, outro in (('manha', 'tarde'), ('tarde', 'manha')):
                eu, ele = doDia[q], doDia[outro]
                if 'Chuva' not in eu['quais']: continue
                meu, dele = eu.get('chuva') or {}, ele.get('chuva') or {}
                # Marca por MÉRITO PRÓPRIO — milímetros que cheguem, ou rácio
                # abaixo do corte — não é herança e não se questiona. Esta
                # linha faltava e a guarda acusou uma tarde com 35 % de
                # probabilidade, cujo rácio é 0,375 e se marca sozinha.
                if meu.get('propria'): continue
                if dele.get('propria'):
                    erro('dia %d: %s tem triângulo na Chuva sem o merecer (%s), e %s já '
                         'carrega a marca (%s) — o veto do dia está a ser acusado nas duas partes'
                         % (dia, q, meu, outro, dele))
    if len(falhas) == antes:
        print('  valor mau     ✓ %d blocos: %d de %d verdes (só água), %d de %d amarelos, %d de %d vermelhos'
              % (sum(vistos.values()), marcados['verde'], vistos['verde'],
                 marcados['amarelo'], vistos['amarelo'], marcados['vermelho'], vistos['vermelho']))
    c.js("""(function(){var b=document.querySelector('.bloco__cabeca[aria-expanded="true"]');
         if(b) b.click();})()"""); time.sleep(.3)
    c.js("""(function(){var b=document.querySelector('.bloco__cabeca[aria-expanded="true"]');
         if(b) b.click();})()"""); time.sleep(.3)
finally: c.fechar()

print('\n== 6d-bis. o veto marca a sua própria linha ==')
# O DEFEITO REPORTADO: o cartão dizia «O dia está chumbado: chuva a sério» e a
# linha da Chuva ficava LIMPA. A chuva pontua-se pela PROBABILIDADE e o veto
# dispara pelos MILÍMETROS — 17 % de hipótese dá rácio 0,76, muito acima do
# corte de 0,40, enquanto 2 mm acumulados chumbam o dia. Os milímetros nunca
# entram na nota, portanto o rácio nunca os podia ver.
# E o contrário também tem de valer: se a chuva toda cair de manhã, uma tarde
# com 0 mm não pode levar triângulo por cima de «Sem chuva à vista».
def _chuva(mm):
    E = """
    (function(){var t=setInterval(function(){ if(!window.Modelo||!window.Modelo.avaliarDia) return;
      clearInterval(t); var o=window.Modelo.avaliarDia, primeiro=null;
      /* PELO DIA, e não pela primeira chamada de sempre. Estava `n++===0`, e
         a bateria passou a tentar outra vez quando a previsão falha: a
         primeira tentativa gastava o enxerto numa renderização que nunca
         chegou ao ecrã, e a segunda vinha limpa. O runner dizia «o enxerto do
         veto não pegou (nota='46' cor='amarelo')» — uma secção inteira sem
         medir, por causa de um contador. O dia é estável entre tentativas. */
      window.Modelo.avaliarDia=function(){var r=o.apply(this,arguments);
        if(primeiro===null) primeiro=arguments[3];
        if(arguments[3]===primeiro&&r&&r.v){ r.v.nota=20; r.v.cor='vermelho'; r.v.vetos=['chuva a sério'];
          if(r.partes&&r.partes[0]&&r.partes[0].d){
            r.partes[0].d.mm = %s;
            /* a PROBABILIDADE baixa: num dia de chuva o rácio do factor já é
               mau por si e marcava a linha pelo caminho certo, sem o ensaio
               dos milímetros chegar a dizer nada. */
            r.partes[0].d.chuva = 5;
            if(r.partes[0].v&&r.partes[0].v.factores)
              r.partes[0].v.factores.forEach(function(f){
                if(f.id==='chuva'){ f.valor=5; f.pontos=f.peso; }});
            r.partes.forEach(function(x){ if(x.v){ x.v.vetos=[];
              if(x.v.nota==null) x.v.nota=70; } });
          } }
        return r;};},5);})();
    """ % mm
    c=Chrome(porta=livre())
    try:
        c.cmd('Emulation.setDeviceMetricsOverride',width=375,height=812,deviceScaleFactor=1,mobile=True)
        c.cmd('Page.addScriptToEvaluateOnNewDocument', source=E)
        c.abrir('http://127.0.0.1:%d/'%PORTA, espera=2.6)
        escolherPraia(c)
        c.js("""(function(){var b=document.getElementById('cab-manha');
             if(b && b.getAttribute('aria-expanded')!=='true') b.click();})()"""); time.sleep(.5)
        return json.loads(c.js(r"""JSON.stringify((function(){
          var pn=document.querySelector('.bloco__numeros:not([hidden])');
          if(!pn) return null;
          var l=[...pn.querySelectorAll('.nums__linha')].find(function(x){
            var n=x.querySelector('.nums__nome');
            return [...n.childNodes].filter(function(k){return k.nodeType===3;})
                    .map(function(k){return k.textContent;}).join('').trim()==='Chuva';});
          /* O SINAL DE QUE O ENXERTO PEGOU sai do que o enxerto ESCREVE, e não
             de uma frase do ecrã. Estava a ler-se `#v-resposta`, que o app.js
             esvazia sempre desde que a linha por cima dos blocos saiu a pedido:
             `'chumbado' in ''` é sempre falso, portanto o portão lá em baixo
             nunca abria e as três asserções desta secção — escritas para um
             defeito concreto que foi reportado — NUNCA correram. A corrida
             imprimia «o enxerto não pegou», e ninguém reparou.
             O enxerto põe a nota do primeiro dia a 20 e a cor a vermelho: é
             isso que se confirma. */
          var d0 = document.querySelector('.dia');
          return { nota: d0 ? (d0.querySelector('.dia__nota')||{}).textContent : '',
                   cor: d0 ? ([...d0.classList].map(function(k){
                          return (k.match(/^dia--(\w+)$/)||[])[1];}).filter(Boolean)[0]||'') : '',
                   marcada: !!(l && l.querySelector('.nums__mau')),
                   palavra: l ? (l.querySelector('.nums__palavra')||{}).innerText : '' };})())"""))
    finally: c.fechar()

antes = len(falhas)
com = _chuva('1.8')
sem = _chuva('0')
if not com or com.get('nota') != '20' or com.get('cor') != 'vermelho':
    # Sem cartão nenhum no ecrã não houve enxerto para pegar: isso é a previsão
    # que não chegou, e já foi contado como «não medido» pelo escolherPraia.
    (semMedida if not com or not com.get('cor') else erro)(
        'o enxerto do veto não pegou (nota=%r cor=%r) — as três asserções desta '
        'secção não chegaram a correr, e é isso que ela existe para medir'
        % (com and com.get('nota'), com and com.get('cor')))
else:
    if not com['marcada']:
        erro('o dia está chumbado por chuva, a manhã tem 1,8 mm e a linha da Chuva não leva marca')
    if 'Sem chuva à vista' in (com['palavra'] or ''):
        erro('a linha diz «Sem chuva à vista» com milímetros previstos: %r' % com['palavra'])
    if sem and sem['marcada']:
        erro('a manhã não deu chuva nenhuma e leva marca à mesma')
    if len(falhas) == antes:
        print('  com chuva     ✓ %r' % (com['palavra'] or '').replace('\n', ' ')[:52])
        print('  sem chuva     ✓ a parte seca não leva marca por chuva que caiu noutra')

# E SEM VETO NENHUM, só milímetros. A chuva pontua-se pela probabilidade, e 12%
# de hipótese dá rácio alto — mas «0,8 mm ao todo» é água a cair em cima de
# quem lá está. O limiar de 0,5 mm é medido, não é gosto: em 16 128 partes-dia
# (previsão arquivada contra o ERA5), abaixo de 0,3 mm previstos só 24% acabam
# com chuva a sério, e a partir de 0,5 são 75%.
def _mm(mm):
    E = """
    (function(){var t=setInterval(function(){ if(!window.Modelo||!window.Modelo.avaliarDia) return;
      clearInterval(t); var o=window.Modelo.avaliarDia,n=0;
      window.Modelo.avaliarDia=function(){var r=o.apply(this,arguments);
        if(n++===0&&r&&r.partes&&r.partes[0]&&r.partes[0].d){
          window.__mmEnxertado=true;
          r.partes[0].d.mm=%s;
          /* e a PROBABILIDADE baixa: num dia de chuva o rácio do factor já é
             mau por si e marcava a linha pelo caminho certo, sem o ensaio dos
             milímetros chegar a dizer nada. */
          r.partes[0].d.chuva=5;
          if(r.partes[0].v&&r.partes[0].v.factores)
            r.partes[0].v.factores.forEach(function(f){
              if(f.id==='chuva'){ f.valor=5; f.pontos=f.peso; }});
          /* LIMPAM-SE os vetos verdadeiros: o que está em ensaio são os
             MILÍMETROS sozinhos. Num dia de chuva a sério o veto do dia marca
             a linha por si, e a guarda chumbava sem haver defeito nenhum. */
          r.v.vetos=[]; r.v.perigos=[]; r.v.perigo=false;
          if(r.v.nota==null) r.v.nota=70;
          r.partes.forEach(function(x){ if(x.v){ x.v.vetos=[];
            if(x.v.nota==null) x.v.nota=70; } });
        }
        return r;};},5);})();
    """ % mm
    c=Chrome(porta=livre())
    try:
        c.cmd('Emulation.setDeviceMetricsOverride',width=375,height=812,deviceScaleFactor=1,mobile=True)
        c.cmd('Page.addScriptToEvaluateOnNewDocument', source=E)
        c.abrir('http://127.0.0.1:%d/'%PORTA, espera=2.6)
        escolherPraia(c)
        c.js("""(function(){var b=document.getElementById('cab-manha');
             if(b && b.getAttribute('aria-expanded')!=='true') b.click();})()"""); time.sleep(.5)
        return json.loads(c.js(r"""JSON.stringify((function(){
          var pn=document.querySelector('.bloco__numeros:not([hidden])');
          if(!pn) return null;
          var l=[...pn.querySelectorAll('.nums__linha')].find(function(x){
            var n=x.querySelector('.nums__nome');
            return [...n.childNodes].filter(function(k){return k.nodeType===3;})
                    .map(function(k){return k.textContent;}).join('').trim()==='Chuva';});
          /* A PROBABILIDADE E O RÁCIO, para se saber POR QUE VIA a linha foi
             marcada. O enxerto baixa a probabilidade e põe os pontos no
             máximo, mas se a parte vier sem `factores` — acontece quando o
             modelo não pontuou aquela metade do dia — a baixa não pega e a
             linha marca-se pelo rácio verdadeiro. O teste chumbava a acusar
             o limiar dos milímetros de um defeito que não era dele: aqui
             passa, no runner (que apanhou um dia de mais chuva) não.
             Pergunta-se ao próprio modelo, como nas outras guardas. */
          var pc = ((l&&l.querySelector('.nums__valor')||{}).textContent||'').match(/([\d,.]+)\s*%/);
          var prob = pc ? parseFloat(pc[1].replace(',', '.')) : null;
          return { marcada: !!(l&&l.querySelector('.nums__mau')),
                   /* O ENXERTO PEGOU? Sem isto esta guarda é cega: quando o
                      primeiro `avaliarDia` vem sem `partes[0].d` — acontece
                      quando o modelo não pontuou aquela metade do dia — os
                      milímetros nunca chegam a ser postos, a linha da chuva
                      não se marca (e bem: não há chuva nenhuma) e a guarda
                      lia isso como «o limiar de 0,5 mm está partido».
                      Chumbou assim três noites seguidas (2, 3 e 4 de Setembro
                      de 2026) sem haver defeito nenhum no site. */
                   enxertado: !!window.__mmEnxertado,
                   prob: prob,
                   racio: (prob != null && window.Modelo)
                     ? Modelo._pontos.chuva(prob) / Modelo.PESOS.chuva : null,
                   vetado: (document.getElementById('v-resposta').textContent||'').indexOf('chumbado')>=0 };})())"""))
    finally: c.fechar()

antes = len(falhas)
baixo, alto = _mm('0.3'), _mm('0.8')
if baixo is None or alto is None or baixo.get('vetado') or alto.get('vetado'):
    print('  · o enxerto não pegou — o limiar dos milímetros fica por medir')
elif not baixo.get('enxertado') or not alto.get('enxertado'):
    semMedida('os milímetros de chuva não chegaram a ser enxertados '
              '(a parte da manhã veio sem dados) — o limiar fica por medir hoje')
else:
    if baixo['marcada'] and (baixo.get('racio') is None or baixo['racio'] < 0.40):
        semMedida('a 0,3 mm a linha da chuva marca-se pelo RÁCIO (%s %% de '
                  'probabilidade, rácio %.2f) — o limiar dos milímetros fica por '
                  'medir hoje' % (baixo.get('prob'), baixo.get('racio') or 0))
    elif baixo['marcada']:
        erro('0,3 mm previstos e a chuva já leva marca — o limiar medido é 0,5 '
             '(probabilidade %s %%, rácio %.2f, portanto não foi por aí)'
             % (baixo.get('prob'), baixo.get('racio') or 0))
    if not alto['marcada']:
        erro('0,8 mm previstos e a chuva não leva marca — chove mesmo em 64%% dos '
             'casos (probabilidade %s %%, rácio %.2f)'
             % (alto.get('prob'), alto.get('racio') or 0))
    if len(falhas) == antes:
        print('  0,5 mm        ✓ 0,3 mm não marca, 0,8 mm marca, sem veto nenhum')

print('\n== 6g. a maré ==')
# SÓ HORAS, e é uma decisão medida: os metros desta fonte não se podem mostrar
# (o zero dela é o geóide, e o Zero Hidrográfico das tabelas portuguesas está
# ~2,6 m abaixo — o IH só o publica para uns 16 portos e o site tem 995
# praias), e a amplitude é 99,6 % do DIA e 0,3 % da PRAIA: seria o mesmo número
# em todas. A hora não — espalha-se 39 min de norte a sul.
c=novo(390,900,True)
try:
    escolherPraia(c)
    antes=len(falhas)
    vistos, comMare = 0, 0
    for dia in range(6):
        c.js("document.getElementById('dia-%d').click()" % dia); time.sleep(.4)
        d=json.loads(c.js(r"""JSON.stringify({
          visivel: !document.getElementById('v-mare').hidden,
          texto: document.getElementById('v-mare-txt').textContent,
          nota: (document.querySelector('.mare__nota')||{}).innerText || '',
          pontos: document.querySelectorAll('#v-mare-svg .mare__ponto').length,
          horas: document.querySelectorAll('#v-mare-svg .mare__hora').length,
          curva: ((document.querySelector('#v-mare-svg .mare__linha')||{}).getAttribute
                  ? document.querySelector('#v-mare-svg .mare__linha').getAttribute('d') : ''),
          rotulo: document.getElementById('v-mare-svg').getAttribute('aria-labelledby'),
          svgL: (function(){var v=document.getElementById('v-mare-svg').getAttribute('viewBox');
                 return +v.split(' ')[2] - 28;})(),
          janelas: [...document.querySelectorAll('#v-mare-svg .mare__janela')].map(function(r){
            return [+r.getAttribute('x'), +r.getAttribute('x') + +r.getAttribute('width')];})})"""))
        vistos += 1
        if not d['visivel']:
            if d['texto'].strip(): erro('a maré está escondida mas tem texto: %r' % d['texto'])
            continue
        comMare += 1
        t = d['texto']
        # NUNCA metros: o datum desta fonte não os paga.
        if re.search(r'\d+[,.]\d+\s*m\b', t) or re.search(r'\d+\s*m\b', t):
            erro('a maré mostra METROS, e o datum desta fonte não os paga: %r' % t)
        # As palavras do Instituto Hidrográfico, não «maré alta»/«maré baixa».
        if 'maré alta' in t.lower() or 'maré baixa' in t.lower():
            erro('a maré usa «maré alta/baixa» em vez de «preia-mar/baixa-mar»: %r' % t)
        if not re.search(r'(preia|baixa)-mar às \d\dh\d\d', t):
            erro('a maré não diz uma hora no formato esperado: %r' % t)
        # TODOS os extremos da curva são marcados. Houve uma versão que só
        # mostrava os das 9h-19h, e o desenho ficava com três picos e um só
        # ponto — quem olha pergunta porque é que os outros não contam.
        # Alternam: duas preia-mares seguidas seriam um pico contado a dobrar,
        # que é o defeito que os patamares da grelha horária provocam.
        tipos = re.findall(r'(preia|baixa)-mar', t)
        for i in range(1, len(tipos)):
            if tipos[i] == tipos[i-1]:
                erro('duas «%s-mar» seguidas — um pico contado a dobrar: %r' % (tipos[i], t))
        # A nota visível saiu a pedido. O que NÃO pode sair é o texto escondido:
        # é o nome acessível do desenho, e sem ele o gráfico passa a existir só
        # para quem vê.
        if not d['texto'].strip():
            erro('o SVG da maré ficou sem o texto que o descreve — mudo para leitores de ecrã')
        # O DESENHO. A curva tem de existir e ter forma — um `d` curto seria uma
        # linha recta, ou seja, dados em falta a passar por maré.
        if len(d['curva']) < 200:
            erro('a curva da maré está vazia ou é uma recta: %d caracteres' % len(d['curva']))
        # TODOS OS EXTREMOS DA CURVA ESTÃO MARCADOS. Comparar os pontos com o
        # texto não chega: se alguém voltar a filtrar, os dois encolhem juntos
        # e a asserção não dá por nada — medido, a mutação passou.
        # Um dia civil tem 3 ou 4 extremos (medido em 60 dias-praia: 4 em 50
        # deles, 3 nos outros, porque quatro ocupam ~24,8 h e um transborda).
        # Filtrar pela janela de praia deixaria 1 ou 2. Daí o corte em 3.
        if d['pontos'] < 3:
            erro('só %d extremos marcados — um dia tem 3 ou 4, alguém está a filtrar' % d['pontos'])
        # Um ponto e um rótulo por extremo, e nem mais nem menos.
        if d['pontos'] != len(re.findall(r'-mar às', d['texto'])):
            erro('%d pontos no desenho para %d extremos no texto'
                 % (d['pontos'], len(re.findall(r'-mar às', d['texto']))))
        if d['horas'] != d['pontos']:
            erro('%d rótulos de hora para %d pontos' % (d['horas'], d['pontos']))
        # UM DESENHO QUE SÓ EXISTE PARA QUEM VÊ NÃO ENTRA NESTE CARTÃO.
        if d['rotulo'] != 'v-mare-txt':
            erro('o SVG da maré não aponta para o texto que o descreve: %r' % d['rotulo'])
        # OS RÓTULOS NÃO SE PISAM NEM SAEM DA TELA. Com quatro extremos num dia
        # e o cartão a 375 px, as horas ficam a poucos pixéis umas das outras;
        # as altas vão por cima da curva e as baixas por baixo do bloco de água,
        # e é isso que as separa. Se alguém mexer nessa altura, isto apanha.
        z=json.loads(c.js(r"""JSON.stringify((function(){
          var ts=[...document.querySelectorAll('#v-mare-svg .mare__hora')];
          var svg=document.getElementById('v-mare-svg').getBoundingClientRect();
          var r=ts.map(function(x){var b=x.getBoundingClientRect();
            return {t:x.textContent, e:b.left, d:b.right, c:b.top};});
          var ch=[];
          for(var i=0;i<r.length;i++) for(var j=i+1;j<r.length;j++)
            if (r[i].d>r[j].e && r[j].d>r[i].e && Math.abs(r[i].c-r[j].c)<12)
              ch.push(r[i].t+' x '+r[j].t);
          return {choques: ch,
                  fora: r.filter(function(x){return x.e<svg.left-1||x.d>svg.right+1;})
                         .map(function(x){return x.t;})};})())"""))
        # A ESCALA DO SVG TEM DE SER 1. O viewBox era fixo em 300 unidades e o
        # `preserveAspectRatio="none"` esticava o desenho até à largura do
        # cartão — e esticava TAMBÉM as letras. Medido: 1,06x no telemóvel, onde
        # não se nota, e 1,8x no computador, onde as horas saem deformadas. Foi
        # assim que o defeito chegou ao ar. Agora o viewBox é escrito em pixéis.
        e=json.loads(c.js(r"""JSON.stringify((function(){
          var s=document.getElementById('v-mare-svg');
          var r=s.getBoundingClientRect(), vb=s.getAttribute('viewBox').split(' ').map(Number);
          return {x: r.width/vb[2], y: r.height/vb[3], vb: s.getAttribute('viewBox')};})())"""))
        # E A LARGURA É A DOS BLOCOS. Foi reportado que o gráfico saía estreito
        # e centrado: o `app.js` velho servido de cache escrevia um viewBox de
        # 300 unidades num HTML que já não tinha o `preserveAspectRatio="none"`
        # que o esticava, e o `meet` por omissão encaixava-o ao meio. Os URLs
        # passaram a levar a versão para as duas metades nunca se misturarem —
        # isto é a rede por baixo disso.
        lb=json.loads(c.js(r"""JSON.stringify((function(){
          var b=document.querySelector('.bloco'), m=document.getElementById('v-mare-svg');
          if(!b||!m) return null;
          return {bloco: b.getBoundingClientRect().width,
                  mare: m.getBoundingClientRect().width};})())"""))
        if lb and abs(lb['mare'] - lb['bloco']) > 1:
            erro('o gráfico da maré mede %.0f px e os blocos %.0f — devia ocupar a mesma largura'
                 % (lb['mare'], lb['bloco']))
        if abs(e['x'] - 1) > 0.02 or abs(e['y'] - 1) > 0.02:
            erro('o SVG da maré está esticado x%.2f y%.2f (viewBox %s) — as letras deformam'
                 % (e['x'], e['y'], e['vb']))
        if z['choques']: erro('horas da maré sobrepostas: %s' % z['choques'])
        if z['fora']: erro('horas da maré fora da tela: %s' % z['fora'])
        # A FAIXA É UMA E CONTÍNUA, do princípio da manhã ao fim da tarde —
        # pedido assim. Esteve partida em duas, com a fenda do almoço à vista.
        # O que ela marca é o DIA DE PRAIA, e não «as horas que pontuam»: essa
        # distinção é de cálculo e vive na /metodologia/.
        # Mas os EXTREMOS têm de continuar a sair do modelo: se alguém mudar as
        # janelas e a faixa ficar com as horas antigas, isto apanha.
        js = d['janelas']
        if len(js) != 1:
            erro('a maré tem %d faixas e devia ter uma contínua' % len(js))
        else:
            largura = js[0][1] - js[0][0]
            horas = M_HORAS[-1][1] - M_HORAS[0][0]
            esperado = d['svgL'] * horas / 23.0
            if abs(largura - esperado) > 4:
                erro('a faixa mede %.0f px e as %dh do dia de praia dão %.0f'
                     % (largura, horas, esperado))
    # E A MESMA COISA NUM ECRÃ LARGO, que é onde o esticão aparecia: a 390 px
    # a escala era 1,06 e passava despercebida; a 1280 era 1,8.
    c.cmd('Emulation.setDeviceMetricsOverride', width=1280, height=900,
          deviceScaleFactor=1, mobile=False)
    time.sleep(.6)
    c.js("document.getElementById('dia-0').click()"); time.sleep(.5)
    w=json.loads(c.js(r"""JSON.stringify((function(){
      var s=document.getElementById('v-mare-svg');
      if(!s || s.closest('#v-mare').hidden) return null;
      var r=s.getBoundingClientRect(), vb=s.getAttribute('viewBox').split(' ').map(Number);
      return {x: r.width/vb[2], larg: Math.round(r.width)};})())"""))
    if w and abs(w['x'] - 1) > 0.02:
        erro('a 1280 px o SVG da maré está esticado x%.2f (largura %d)' % (w['x'], w['larg']))
    if len(falhas) == antes:
        print('  maré          ✓ %d dos %d dias, todos os extremos marcados, só horas, a alternar'
              % (comMare, vistos))
        print('  sem esticão   ✓ escala 1:1 a 390 e a 1280 px — as letras não deformam')
finally: c.fechar()

print('\n== 6e. o aviso de segurança ==')
# ESTEVE MORTO. O `.veredicto__aviso--perigo` existia no CSS desde que o aviso
# de segurança foi separado do de conforto — com um comentário a dizer que um
# veto de trovoada «não pode ser dito no mesmo tom amarelo que a água está
# fria» — e o app.js NUNCA lhe punha a classe. A única coisa no ecrã que pode
# impedir alguém de se magoar era pintada com a cor do desconforto.
# Não acontece na previsão de hoje, por isso força-se.
ENXERTO_PERIGO = r"""
(function () {
  var t = setInterval(function () {
    if (!window.Modelo || !window.Modelo.avaliarDia) return;
    clearInterval(t);
    var orig = window.Modelo.avaliarDia, primeiro = null;
    window.Modelo.avaliarDia = function () {
      var r = orig.apply(this, arguments);
      /* Trovoada (perigo) E chuva a sério (conforto) ao mesmo tempo, com a
         chuva PRIMEIRO na lista dos vetos — que é a ordem real do modelo. É
         este o caso em que a caixa vermelha nomeava a chuva.
         Marca-se pelo DIA e não pela primeira chamada: com o retry da bateria,
         um contador gasta-se numa renderização que nunca chega ao ecrã. */
      if (primeiro === null) primeiro = arguments[3];
      if (arguments[3] === primeiro && r && r.v) {
        r.v.perigo = true;
        r.v.vetos = ['chuva quase certa', 'chuva a sério'];
        r.v.avisos = ['pode haver trovoada'];
        r.v.perigos = ['pode haver trovoada'];
      }
      return r;
    };
  }, 5);
})();
"""
c=Chrome(porta=livre())
try:
    c.cmd('Emulation.setDeviceMetricsOverride',width=375,height=812,deviceScaleFactor=1,mobile=True)
    c.cmd('Page.addScriptToEvaluateOnNewDocument', source=ENXERTO_PERIGO)
    c.abrir('http://127.0.0.1:%d/'%PORTA, espera=2.6)
    escolherPraia(c)
    d=json.loads(c.js(r"""JSON.stringify((function(){
      var a = document.getElementById('v-aviso');
      return { escondido: a.hidden, classes: a.className,
               texto: a.innerText.replace(/\s+/g,' ').trim(),
               temTriangulo: !!a.querySelector('svg'),
               fundo: getComputedStyle(a).backgroundColor,
               cor: getComputedStyle(a).color };})())"""))
    if d['escondido']:
        # SILÊNCIO NÃO É APROVAÇÃO. Isto imprimia uma nota e seguia em frente,
        # portanto uma secção inteira podia deixar de medir sem ninguém saber —
        # foi assim que a 6d-bis esteve morta meses. Se o enxerto não pega, o
        # que se sabe é que NÃO se mediu, e isso é uma falha da bateria.
        (semMedida if not int(c.js("document.querySelectorAll('.dia').length") or 0)
         else erro)('o enxerto do perigo não pegou: a caixa do aviso ficou '
                    'escondida, e as seis asserções desta secção não correram')
    else:
        antes=len(falhas)
        if 'veredicto__aviso--perigo' not in d['classes']:
            erro('o aviso de trovoada saiu com as classes %r — sem a de perigo, fica no amarelo do conforto' % d['classes'])
        if not d['temTriangulo']:
            erro('o aviso de segurança não traz o triângulo')
        if 'trovoada' not in d['texto']:
            erro('o aviso não nomeia o perigo: %r' % d['texto'])
        # E NÃO NOMEIA O QUE NÃO É PERIGO. Lia-se `vetos[0]`, que é o primeiro
        # veto e não o primeiro PERIGO: como a chuva é empilhada antes do mar,
        # um dia de chuva a sério com o mar a 3,2 m escrevia, na caixa
        # vermelha, «Aviso de segurança: chuva quase certa» e escondia o mar.
        for conforto in ('chuva quase certa', 'chuva a sério', 'frio a mais'):
            if conforto in d['texto']:
                erro('a caixa de SEGURANÇA nomeia «%s», que é conforto e não perigo: %r'
                     % (conforto, d['texto']))
        if 'sai da água' not in d['texto']:
            erro('o aviso de trovoada não diz o que fazer: %r' % d['texto'])
        if d['fundo'] == d['cor']:
            erro('o aviso está da mesma cor que o fundo')
        if len(falhas)==antes:
            print('  perigo        ✓ %r' % d['texto'][:64])
            print('  com triângulo ✓ e com a caixa vermelha, não a amarela do conforto')
    # E O CONTRÁRIO: num dia sem perigo a classe NÃO pode ficar colada. O
    # comentário prometia isto e o que estava escrito a seguir era um clique e
    # mais nada — nem uma leitura, nem uma asserção. O enxerto só mexe na
    # PRIMEIRA chamada ao avaliarDia (`n++ === 0`), portanto os outros cinco
    # dias vêm limpos e servem de contraprova.
    antes = len(falhas)
    limpo = None
    for i in (5, 4, 3, 2, 1):
        c.js("var b=document.getElementById('dia-%d'); if(b) b.click()" % i)
        time.sleep(.5)
        x = json.loads(c.js(r"""JSON.stringify((function(){
          var a = document.getElementById('v-aviso');
          return { dia: %d, escondido: a.hidden, classes: a.className,
                   texto: a.innerText.replace(/\s+/g,' ').trim() };})())""" % i))
        if x['escondido'] or not x['texto']:
            limpo = x; break
    if limpo is None:
        print('  · os seis dias trazem aviso — sem dia limpo para a contraprova hoje')
    elif 'veredicto__aviso--perigo' in limpo['classes']:
        erro('a classe de PERIGO ficou colada num dia sem aviso nenhum (dia %d): %r'
             % (limpo['dia'], limpo['classes']))
    elif len(falhas) == antes:
        print('  não fica colada ✓ o dia %d não traz perigo e a classe saiu com ele'
              % limpo['dia'])
finally: c.fechar()

# --------------------------------------------------------------------- 6i
print('\n== 6i. contraste da PÁGINA INTEIRA, a rolar ==')
# As outras medições de contraste são em sítios fixos — o topo, um painel
# aberto, o tema escuro — e por isso nunca chegavam ao mapa nem ao rodapé.
# Provado por mutação: devolver o `.mapa__titulo` a `--tinta-3` deixava-o a
# 2,89:1 e a bateria dava FALHAS: 0. O céu é `position: fixed`, portanto o que
# está por trás de um texto MUDA com a rolagem: o mesmo rótulo que passa a meio
# da página chumba quando sobe até à parte escura do gradiente. Só se sabe
# rolando.
for tema in ('light', 'dark'):
    for larg, alt, rot in ((390, 844, 'telemóvel'), (1280, 900, 'computador')):
        c = Chrome(porta=livre())
        try:
            antes = len(falhas)
            c.cmd('Emulation.setDeviceMetricsOverride', width=larg, height=alt,
                  deviceScaleFactor=1, mobile=larg < 768)
            c.cmd('Emulation.setEmulatedMedia',
                  features=[{'name': 'prefers-color-scheme', 'value': tema}])
            c.abrir('http://127.0.0.1:%d/' % PORTA, espera=2.6)
            escolherPraia(c)
            # E OS QUATRO CÉUS, FORÇADOS. O fundo muda com o veredicto, portanto
            # o que está por trás de cada texto depende do TEMPO QUE FAZ no dia
            # em que isto corre. Medi «limpo» num dia de céu cinzento e o mesmo
            # ficheiro deu oito falhas num runner do GitHub, onde o céu estava
            # azul: 4,13 a 4,29:1 nos links do rodapé. Uma guarda que só apanha
            # o defeito quando o tempo colabora não é uma guarda — é a mesma
            # lição das outras cegas, aplicada ao contraste.
            passos = 0
            for cor in ('', 'verde', 'amarelo', 'vermelho'):
                c.js("document.body.%s" % (("setAttribute('data-cor','%s')" % cor)
                                           if cor else "removeAttribute('data-cor')"))
                time.sleep(1.3)          # a transição do céu é de 1s
                vistos, y = {}, 0
                total = int(c.js("document.body.scrollHeight"))
                for _ in range(8):
                    if y >= total: break
                    c.js("scrollTo(0,%d)" % y); time.sleep(.35)
                    for m in contraste(c):
                        k = m.split(' @')[0]
                        if k not in vistos: vistos[k] = m
                    y += int(alt * .85); passos += 1
                if vistos:
                    erro('contraste (%s, %s, céu %s): %s'
                         % (tema, rot, cor or 'inicial', list(vistos.values())[:4]))
            c.js("document.body.removeAttribute('data-cor'); scrollTo(0,0)")
            if len(falhas) == antes:
                print('  %-6s %-11s ✓ limpo nos 4 céus, em %d ecrãs' % (tema, rot, passos))
        finally:
            c.fechar()

# --------------------------------------------------------------------- 6h
# --------------------------------------------------------------------- 6j
print('\n== 6j. «perto de mim» no interior ==')
# O botão do alfinete tinha um `.filter(function (p) { return p.m; })` que
# deitava fora as 236 praias de rio. O resultado, medido: quem carrega nele em
# Bragança recebia praias de mar a 152 km, com uma praia fluvial a 13. Em Vila
# Real, 69 km com uma a 3. «Mais perto de ti» a mostrar o que está longe é a
# única coisa que este botão não pode fazer.
c = novo(390, 844, True)
try:
    antes = len(falhas)
    # Bragança, que é o ponto de Portugal continental mais longe do mar.
    c.cmd('Browser.grantPermissions', origin='http://127.0.0.1:%d' % PORTA,
          permissions=['geolocation'])
    c.cmd('Emulation.setGeolocationOverride', latitude=41.8061, longitude=-6.7567,
          accuracy=20)
    c.js("document.getElementById('perto').click()")
    time.sleep(3.0)
    d = json.loads(c.js(r"""JSON.stringify((function(){
      var s = [...document.querySelectorAll('.sugestao[data-i]')];
      return { quantas: s.length,
               textos: s.slice(0,3).map(function(x){return x.textContent.replace(/\s+/g,' ').trim();}),
               kms: s.map(function(x){ var m=(x.textContent||'').match(/(\d+)\s*km/); return m?+m[1]:null; })
                     .filter(function(v){return v!=null;}) };})())"""))
    if not d['quantas']:
        erro('o alfinete em Bragança não devolveu praia nenhuma')
    elif not d['kms']:
        erro('as sugestões do alfinete não dizem a distância: %s' % d['textos'])
    elif d['kms'][0] > 60:
        erro('o alfinete em Bragança devolve a praia mais perto a %d km — há uma '
             'fluvial a 13. Voltou o filtro de praias de mar? (%s)'
             % (d['kms'][0], d['textos'][0][:60]))
    if len(falhas) == antes:
        print('  interior      ✓ a mais perto de Bragança está a %d km' % d['kms'][0])
finally:
    c.fechar()

print('\n== 6h. escolher duas praias seguidas ==')
# QUEM CHEGA ATRASADO NÃO ESCREVE. Escolher a praia A e, antes de ela chegar,
# escolher a B: a resposta de A chega por último e escrevia por cima — título
# de uma praia, números de outra, e o history.replaceState a gravar o endereço
# errado, que a visita seguinte abre. O mostrarMapa() já tinha a guarda; o
# escolher() não tinha nenhuma.
#
# Atrasa-se o fetch da PRIMEIRA praia com um embrulho ao window.fetch, e não
# com condições de rede: é preciso atrasar UM pedido e deixar passar o outro,
# e a emulação do CDP não distingue pedidos.
c = novo(1280, 900, False)
try:
    antes = len(falhas)
    escolherPraia(c)
    nomes = json.loads(c.js("JSON.stringify([...document.querySelectorAll('.atalho')]"
                            ".map(function(b){return b.textContent.trim();}))"))
    if len(nomes) < 2:
        erro('só há %d atalhos — o teste precisa de dois' % len(nomes))
    else:
        c.js("""(function(){
          var of = window.fetch;
          window.__atrasar = true;
          window.fetch = function (u, o) {
            if (window.__atrasar && String(u).indexOf('open-meteo') >= 0) {
              return new Promise(function (res, rej) {
                setTimeout(function () { of(u, o).then(res, rej); }, 4000); });
            }
            return of(u, o);
          };})()""")
        # PELOS NÚMEROS, e não pelo título: o `#v-praia` é escrito a partir de
        # `praiaActual`, portanto mostra sempre a praia mais recente MESMO
        # quando os números que estão por baixo são da outra. Um teste ao
        # título passava com o defeito lá dentro. Guardam-se primeiro as notas
        # verdadeiras de cada praia, uma de cada vez e sem corrida.
        tiras = []
        for i in (0, 1):
            escolherPraia(c, i)
            tiras.append(c.js("[...document.querySelectorAll('.dia__nota')]"
                              ".map(function(x){return x.textContent.trim();}).join('/')"))
        if tiras[0] == tiras[1]:
            print('  fora de ordem — as duas praias dão a mesma tira (%s), sem valor hoje' % tiras[0])
        else:
            # A CACHE DE SESSÃO TEM DE SAIR, senão não há corrida nenhuma: o
            # `buscar()` devolve do sessionStorage sem chegar ao fetch, e o
            # atraso que embrulhámos nunca corre. Custou uma mutação que
            # passou: gravar as duas tiras acima meteu as duas praias em cache.
            c.js("""Object.keys(sessionStorage).filter(function(k){
                   return k.indexOf('pm:c:')===0;}).forEach(function(k){
                   sessionStorage.removeItem(k);})""")
            # E agora a corrida: a primeira fica pendurada, a segunda passa logo.
            c.js("window.__atrasar = true")
            c.js("document.querySelectorAll('.atalho')[0].click()")
            time.sleep(.4)
            c.js("window.__atrasar = false")
            c.js("document.querySelectorAll('.atalho')[1].click()")
            time.sleep(9.0)
            d = json.loads(c.js(r"""JSON.stringify({
              titulo: (document.getElementById('v-praia')||{}).textContent || '',
              notas: [...document.querySelectorAll('.dia__nota')].map(function(x){return x.textContent.trim();}).join('/'),
              hash: decodeURIComponent(location.hash || ''),
              guardada: (function(){try{return JSON.parse(localStorage.getItem('pm:praia')||'{}').n||'';}catch(e){return '';}})()})"""))
            esperada = nomes[1]
            if d['notas'] == tiras[0]:
                erro('o cartão diz %r e mostra os NÚMEROS de %r: a resposta atrasada '
                     'escreveu por cima (tira %s)' % (d['titulo'], nomes[0], d['notas']))
            elif d['notas'] != tiras[1]:
                erro('a tira não é de nenhuma das duas praias: %s (esperava %s)'
                     % (d['notas'], tiras[1]))
            elif esperada not in (d['hash'] or ''):
                erro('o endereço ficou na praia errada: %r, com o cartão em %r'
                     % (d['hash'], d['titulo']))
            elif esperada not in (d['guardada'] or ''):
                erro('a praia GRAVADA é a errada (%r) — a próxima visita abre nela'
                     % d['guardada'])

        # E A OUTRA METADE: a praia NOVA falha. O `catch` limpava as avaliações
        # mas deixava lá os `dias` e os `veredictos` da anterior, e não voltava
        # a esconder o resultado — ficava o nome da praia nova por cima dos
        # números, da maré e do mapa da antiga, sem nada no ecrã a dizê-lo. E a
        # linha da previsão guardada não serve de aviso aqui: isto não é uma
        # previsão velha DESTA praia, é a previsão de outra.
        antes2 = len(falhas)
        escolherPraia(c, 0)
        antiga = c.js("[...document.querySelectorAll('.dia__nota')]"
                      ".map(function(x){return x.textContent.trim();}).join('/')")
        c.js("""(function(){
          Object.keys(sessionStorage).filter(function(k){return k.indexOf('pm:c:')===0;})
            .forEach(function(k){sessionStorage.removeItem(k);});
          Object.keys(localStorage).filter(function(k){return k.indexOf('pm:g:')===0;})
            .forEach(function(k){localStorage.removeItem(k);});
          var of = window.fetch;
          window.fetch = function (u, o) {
            if (String(u).indexOf('open-meteo') >= 0) return Promise.reject(new Error('teste'));
            return of(u, o);
          };})()""")
        c.js("document.querySelectorAll('.atalho')[1].click()"); time.sleep(4.0)
        f = json.loads(c.js(r"""JSON.stringify({
          escondido: !!document.getElementById('resultado').hidden,
          dias: document.querySelectorAll('.dia').length,
          notas: [...document.querySelectorAll('.dia__nota')].map(function(x){return x.textContent.trim();}).join('/'),
          titulo: (document.getElementById('v-praia')||{}).textContent || '',
          /* a mensagem vive no #procura-estado, que é o `estado` do app.js */
          aviso: (document.getElementById('procura-estado')||{}).textContent || '',
          vazio: !document.getElementById('vazio').hidden})"""))
        if not f['escondido'] and f['notas'] == antiga:
            erro('a praia nova falhou e ficou no ecrã o cartão da ANTIGA: diz %r com a '
                 'tira %s' % (f['titulo'], f['notas']))
        elif not f['escondido'] and f['dias']:
            erro('a praia nova falhou e o resultado continuou à vista: %s' % f)
        elif not f['aviso'] and not f['vazio']:
            erro('a praia nova falhou sem dizer nada a quem está a olhar: %s' % f)
        if len(falhas) == antes2:
            print('  falha na nova ✓ o cartão sai do ecrã e diz %r'
                  % ((f['aviso'] or '(o painel «vazio» à vista)')[:46]))

        # E O TERCEIRO CASO: a praia ANTIGA falha TARDE, com a nova já no ecrã.
        # Sem guarda de dono no `catch`, esse erro atrasado apagava o cartão de
        # quem já lá estava — a pessoa escolhe a praia B, vê a resposta, e
        # segundos depois o ecrã esvazia-se com uma mensagem de erro sobre um
        # pedido que ela já abandonou.
        antes3 = len(falhas)
        c.abrir('http://127.0.0.1:%d/' % PORTA, espera=2.6)
        # A CACHE E AS RESERVAS TÊM DE SAIR. O `buscar()` só rejeita se não
        # houver reserva: com uma, cai para ela e o `catch` do escolher() nunca
        # corre — o pedido «falhado» resolve-se com números guardados. Custou
        # uma mutação que passou com a guarda fora.
        c.js("""(function(){
          Object.keys(sessionStorage).filter(function(k){return k.indexOf('pm:')===0;})
            .forEach(function(k){sessionStorage.removeItem(k);});
          Object.keys(localStorage).filter(function(k){return k.indexOf('pm:g:')===0;})
            .forEach(function(k){localStorage.removeItem(k);});
          var of = window.fetch;
          window.__falharAtrasado = false;
          window.fetch = function (u, o) {
            if (window.__falharAtrasado && String(u).indexOf('open-meteo') >= 0) {
              return new Promise(function (res, rej) {
                setTimeout(function () { rej(new Error('teste')); }, 4500); });
            }
            return of(u, o);
          };})()""")
        c.js("window.__falharAtrasado = true")
        c.js("document.querySelectorAll('.atalho')[0].click()")
        time.sleep(.4)
        c.js("window.__falharAtrasado = false")
        c.js("document.querySelectorAll('.atalho')[1].click()")
        time.sleep(9.0)
        g = json.loads(c.js(r"""JSON.stringify({
          escondido: !!document.getElementById('resultado').hidden,
          dias: document.querySelectorAll('.dia').length,
          titulo: (document.getElementById('v-praia')||{}).textContent || '',
          aviso: (document.getElementById('procura-estado')||{}).textContent || ''})"""))
        if g['escondido'] or not g['dias']:
            erro('a falha ATRASADA da praia abandonada apagou o cartão da que estava '
                 'no ecrã: %s' % g)
        elif g['aviso']:
            erro('a falha atrasada de um pedido abandonado escreveu um erro por cima '
                 'de um cartão bom: %r' % g['aviso'])
        if len(falhas) == antes3:
            print('  falha atrasada ✓ o erro do pedido abandonado não toca no cartão de %r'
                  % g['titulo'])
        # O `esperada` só existe se a corrida chegou a fazer a prova, e há dias
        # em que as duas praias dão a mesma tira e ela não se faz. Sem esta
        # guarda a secção rebentava com um NameError e levava consigo o 6f, o
        # 7 e o 8 — e o resumo, que é o que se lê no fim.
        if nomes and len(nomes) > 1 and len(falhas) == antes and 'esperada' in dir():
            print('  fora de ordem ✓ ficou em %r, com o endereço e a memória a condizer'
                  % esperada)
finally:
    c.fechar()

print('\n== 6f. abre sem rede, e não guarda previsão ==')
# Duas propriedades, e a segunda é mais importante do que a primeira: um site
# de praia que serve o sol de ontem por baixo de chuva é pior do que um site
# que não abre. O service worker guarda o ESQUELETO e recusa-se a guardar
# qualquer coisa que não seja deste domínio.
# NOTA: corre contra o _site/, e não contra a raiz, porque é lá que o
# `__VERSAO__` está preenchido pelo gerador.
import socketserver as _ss, http.server as _hs, threading as _th
class _Q(_hs.SimpleHTTPRequestHandler):
    timeout = 20
    protocol_version = 'HTTP/1.0'
    def log_message(self, *a): pass
_P = livre()
_srv = _hs.ThreadingHTTPServer(('127.0.0.1', _P),
                               lambda *a, **k: _Q(*a, directory=RAIZ + '/_site', **k))
_srv.daemon_threads = True
_th.Thread(target=_srv.serve_forever, daemon=True).start()
_vivo = True
c=Chrome(porta=livre())
try:
    c.cmd('Emulation.setDeviceMetricsOverride', width=375, height=812, deviceScaleFactor=1, mobile=True)
    c.abrir('http://127.0.0.1:%d/'%_P, espera=2.6)
    escolherPraia(c)
    time.sleep(2.0)
    d=json.loads(c.js("""(async function(){
      var r = await navigator.serviceWorker.getRegistration();
      var ns = await caches.keys(), urls = [];
      for (const n of ns) { var ca = await caches.open(n);
        for (const q of await ca.keys()) urls.push(q.url); }
      return JSON.stringify({activo: !!(r && r.active), caches: ns, urls: urls});})()"""))
    antes = len(falhas)
    if not d['activo']: erro('o service worker não ficou activo')
    if len(d['caches']) != 1:
        erro('deviam ficar exactamente %d caches e ficaram %s' % (1, d['caches']))
    intrusos = [u for u in d['urls'] if 'open-meteo' in u or 'supabase' in u]
    if intrusos: erro('o service worker guardou PREVISÃO ou CONTA: %s' % intrusos[:3])
    if len(d['urls']) < 10: erro('só %d ficheiros no esqueleto — falta lá coisa' % len(d['urls']))
    # E agora sem rede. O `setCacheDisabled` NÃO é decoração: sem ele, a cache
    # HTTP do próprio Chrome serve a página e o teste passa mesmo com o service
    # worker partido — medido. Desligada, o que responde é só este código.
    c.cmd('Network.enable')
    c.cmd('Network.setCacheDisabled', cacheDisabled=True)
    c.cmd('Network.emulateNetworkConditions', offline=True, latency=0,
          downloadThroughput=0, uploadThroughput=0)
    time.sleep(.5)
    c.abrir('http://127.0.0.1:%d/'%_P, espera=4.0)
    e=json.loads(c.js(r"""JSON.stringify({
      atalhos: document.querySelectorAll('.atalho').length,
      procura: !!document.getElementById('procura'),
      fundo: getComputedStyle(document.body).backgroundColor,
      erro: document.body.innerText.indexOf('ERR_') >= 0})"""))
    if e['erro'] or not e['procura'] or not e['atalhos']:
        erro('sem rede o site não abriu: %s' % e)
    if e['fundo'] in ('rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)'):
        erro('sem rede o site abriu SEM ESTILO (fundo %s) — o CSS não veio da cache' % e['fundo'])
    if len(falhas) == antes:
        print('  offline       ✓ abre sem rede, com estilo, %d atalhos e a procura' % e['atalhos'])
        print('  sem previsão  ✓ %d ficheiros no esqueleto, zero da Open-Meteo ou do Supabase' % len(d['urls']))

    # NA AREIA, HORAS DEPOIS. O sessionStorage é por separador e sobrevive a um
    # recarregar; horas depois, num telemóvel, já não existe. É esse o caso que
    # interessa: a previsão vem da reserva no localStorage, e AÍ tem de dizer
    # de que horas é. Um número velho servido como novo é a pior coisa que este
    # site pode fazer, pior do que não abrir.
    antes = len(falhas)
    c.cmd('Network.emulateNetworkConditions', offline=False, latency=0,
          downloadThroughput=-1, uploadThroughput=-1)
    c.cmd('Network.setCacheDisabled', cacheDisabled=False)
    time.sleep(.4)
    # COM FAVORITOS, que é como a maior parte das pessoas anda. Esta secção
    # corria num perfil VAZIO, e era por isso que passava: o desenho das cores
    # dos favoritos usa o mesmo `buscar()` e arranca DEPOIS, portanto a poda da
    # reserva — que ficava com as duas entradas mais recentes do relógio —
    # deitava sempre fora a previsão da praia que se está a ver. Medido: com
    # dois favoritos, offline dava ecrã vazio; sem favoritos, funcionava. O
    # cenário da reserva é justamente quem anda com o site na praia.
    c.abrir('http://127.0.0.1:%d/'%_P, espera=3.0)
    escolherPraia(c)
    def marcarFavorito():
        """Carrega na estrela e CONFIRMA que ficou marcada.

        O clique cego dava «só marcou 1»: num runner a estrela pode ainda não
        estar desenhada quando se lhe toca, e o teste acusava a reserva de um
        defeito que era dele."""
        for _ in range(12):
            try:
                if c.js("document.getElementById('v-estrela').getAttribute('aria-pressed')") == 'true':
                    return True
                c.js("var e=document.getElementById('v-estrela'); if(e) e.click()")
            except Exception:
                pass
            time.sleep(.4)
        return False

    marcarFavorito()
    escolherPraia(c, 1)          # e não um clique com uma espera fixa
    marcarFavorito()
    favs = c.js("JSON.parse(localStorage.getItem('pm:favoritos')||'[]').length")
    if int(favs or 0) < 2:
        erro('o teste da reserva precisa de 2 favoritos e só marcou %s' % favs)
    c.abrir('http://127.0.0.1:%d/'%_P, espera=3.0)
    escolherPraia(c)
    guardadas = int(c.js("Object.keys(localStorage).filter(function(k){"
                         "return k.indexOf('pm:g:')===0;}).length"))
    # E TÊM DE SER DA PRAIA QUE SE ESTÁ A VER, não das dos favoritos.
    coords = json.loads(c.js(r"""JSON.stringify((function(){
      var c = {}; Object.keys(localStorage).forEach(function(k){
        if (k.indexOf('pm:g:') !== 0) return;
        var m = /latitude=([-\d.]+)/.exec(k); if (m) c[m[1]] = 1; });
      return Object.keys(c);})())"""))
    if len(coords) > 1:
        erro('a reserva tem previsão de %d praias diferentes (%s) — devia ter só a '
             'que está no ecrã' % (len(coords), coords))
    visivelComRede = c.js("document.getElementById('v-antiga').hidden ? 0 : 1")
    if not guardadas: erro('a previsão não ficou guardada na reserva')
    if visivelComRede: erro('COM rede o cartão diz que a previsão é guardada — só pode dizer sem rede')
    c.js("sessionStorage.clear()")
    c.cmd('Network.setCacheDisabled', cacheDisabled=True)
    c.cmd('Network.emulateNetworkConditions', offline=True, latency=0,
          downloadThroughput=0, uploadThroughput=0)
    time.sleep(.4)
    c.abrir('http://127.0.0.1:%d/'%_P, espera=5.0); time.sleep(3.5)
    a2=json.loads(c.js(r"""JSON.stringify({
      blocos: document.querySelectorAll('.bloco').length,
      /* num dia VETADO não há nota nenhuma — a previsão mostra-se por
         palavras. Pedir a nota fazia esta guarda depender do tempo que
         estivesse a fazer no dia em que ela corresse, e num dia de chuva a
         sério chumbava sem haver defeito nenhum. */
      palavras: [...document.querySelectorAll('.bloco__palavra')]
                  .map(function(x){return x.textContent.trim();}).filter(Boolean).length,
      nota: (document.querySelector('.bloco__nota')||{}).textContent || '',
      antiga: document.getElementById('v-antiga').hidden ? ''
              : document.getElementById('v-antiga').textContent})"""))
    if a2['blocos'] != 2 or a2['palavras'] != 2:
        erro('sem rede e com reserva, o cartão não mostrou a previsão: %s' % a2)
    elif not a2['antiga']:
        erro('MOSTROU A PREVISÃO SEM DIZER QUE É VELHA — %s de nota, sem aviso nenhum' % a2['nota'])
    elif not re.search(r'\d+h\d\d', a2['antiga']):
        erro('o aviso não diz a HORA a que a previsão foi buscada: %r' % a2['antiga'])
    if len(falhas) == antes:
        print('  na areia      ✓ %r' % a2['antiga'])

    # A ENTRADA NÃO SE ENVENENA. Esta secção só navegava para `/`, e por isso
    # nunca podia ver o defeito: o ramo da navegação do sw.js gravava QUALQUER
    # página debaixo da chave `/`, e sem olhar ao `r.ok`. Visitar um hub pelo
    # rodapé passava a ser a página de entrada da aplicação instalada, que
    # arranca em `start_url: "/"`.
    #
    # E o servidor tem de morrer A SÉRIO. Com `emulateNetworkConditions` o
    # fetch do PRÓPRIO service worker continua a chegar ao localhost — ele
    # corre noutro alvo, que este comando não apanha — e a cache repara-se
    # sozinha a meio do teste. Já mediu offline com o servidor vivo e passou.
    antes = len(falhas)
    c.cmd('Network.emulateNetworkConditions', offline=False, latency=0,
          downloadThroughput=-1, uploadThroughput=-1)
    c.cmd('Network.setCacheDisabled', cacheDisabled=False)
    time.sleep(.4)
    c.abrir('http://127.0.0.1:%d/praias/norte/' % _P, espera=3.0)
    hub = c.js("document.title")
    c.abrir('http://127.0.0.1:%d/nao-existe-de-todo' % _P, espera=2.0)
    # `shutdown()` pára de servir mas NÃO fecha o socket: a porta continua
    # aberta, o SO aceita a ligação e ninguém responde — o pedido fica
    # pendurado em vez de falhar, e a navegação nunca volta. Tem de fechar.
    _srv.shutdown(); _srv.server_close(); _vivo = False
    time.sleep(.8)
    c.cmd('Network.setCacheDisabled', cacheDisabled=True)
    c.abrir('http://127.0.0.1:%d/' % _P, espera=4.0)
    ent = json.loads(c.js(r"""JSON.stringify({
      titulo: document.title,
      procura: !!document.getElementById('procura'),
      atalhos: document.querySelectorAll('.atalho').length,
      h1: (document.querySelector('h1')||{}).textContent || ''})"""))
    if not ent['procura'] or not ent['atalhos']:
        erro('a entrada offline foi envenenada: `/` abriu %r (procura=%s, %s atalhos) '
             'depois de se visitar %r' % (ent['titulo'], ent['procura'], ent['atalhos'], hub))
    elif ent['titulo'] == hub:
        erro('a entrada offline é a página do hub: %r' % ent['titulo'])
    if len(falhas) == antes:
        print('  entrada       ✓ `/` continua a entrada depois de visitar %r e um 404'
              % (hub[:34] + ('…' if len(hub) > 34 else '')))
finally:
    c.fechar()
    if _vivo: _srv.shutdown(); _srv.server_close()

print('\n== 7. sem JavaScript ==')
c=Chrome(porta=livre())
try:
    c.cmd('Emulation.setScriptExecutionDisabled', value=True)
    c.cmd('Emulation.setDeviceMetricsOverride',width=375,height=812,deviceScaleFactor=1,mobile=True)
    c.abrir('http://127.0.0.1:%d/'%PORTA, espera=2.4)
    doc=c.cmd('DOM.getDocument', depth=-1)
    html=c.cmd('DOM.getOuterHTML', nodeId=doc['root']['nodeId'])['outerHTML']
    tem_aviso = 'bandeira' in html.lower()
    # A explicação do modelo saiu da entrada a 6 de Agosto de 2026 e vive em
    # /metodologia/. O que a entrada tem de ter, sem JavaScript, é o CAMINHO
    # para lá — senão quem não corre JS fica sem forma de lá chegar.
    tem_caminho = '/metodologia/' in html
    print('  aviso das bandeiras presente :', tem_aviso)
    print('  caminho para /metodologia/   :', tem_caminho)
    if not tem_aviso: erro('sem JS: falta o aviso das bandeiras')
    if not tem_caminho: erro('sem JS: a entrada não tem ligação para /metodologia/')

    # e a própria /metodologia/ tem de abrir sem JavaScript nenhum
    c.abrir('http://127.0.0.1:%d/metodologia/'%PORTA, espera=1.6)
    doc2=c.cmd('DOM.getDocument', depth=-1)
    m=c.cmd('DOM.getOuterHTML', nodeId=doc2['root']['nodeId'])['outerHTML']
    tem_pesos = '34' in m and 'Vento' in m
    print('  /metodologia/ sem JS         :', tem_pesos)
    if not tem_pesos: erro('sem JS: a /metodologia/ não mostra os pesos')
finally: c.fechar()

print('\n== 8. SEO: o que não pode desfazer-se sozinho ==')
# Isto não testa o site: testa os ficheiros. São correcções de higiene que uma
# refactorização distraída desfaz sem partir nada de visível — e que só se
# dariam por elas meses depois, no Search Console.
#
# NOTA: três verificações não cabem aqui e vivem em `verificar_producao()`, mais
# abaixo. O `python3 -m http.server` serve TUDO; é o Jekyll do GitHub Pages que
# esconde o /MODELO.md e a pasta _source, e o Jekyll só corre lá.
import re as _re
_ler = lambda n: open(os.path.join(RAIZ, n), encoding='utf-8').read()
# Os comentários deste projecto explicam o que ficou para trás e por isso citam
# o domínio antigo e nomes de etiquetas. Uma asserção que tropeça na prosa que
# a explica não vale nada — o que conta é o que o browser recebe.
_sem_comentarios = lambda n: _re.sub(r'<!--.*?-->', '', _ler(n), flags=_re.S)

for nome in ('robots.txt', 'sitemap.xml', '404.html', '_config.yml'):
    if not os.path.exists(os.path.join(RAIZ, nome)):
        erro('falta o ficheiro %s' % nome)
    else:
        print('  %-18s ✓ existe' % nome)

for pagina, esperado in (('index.html', 'https://praiometro.pt/'),
                         ('privacidade.html', 'https://praiometro.pt/privacidade.html'),
                         ('metodologia/index.html', 'https://praiometro.pt/metodologia/'),
                         ('nortada/index.html', 'https://praiometro.pt/nortada/'),
                         ('praias/index.html', 'https://praiometro.pt/praias/'),
                         ('praias/centro/index.html', 'https://praiometro.pt/praias/centro/')):
    h = _sem_comentarios(pagina)
    m = _re.search(r'<link rel="canonical" href="([^"]+)"', h)
    if not m:
        erro('%s sem canonical' % pagina)
    elif m.group(1) != esperado:
        erro('%s: canonical é %s, esperado %s' % (pagina, m.group(1), esperado))
    else:
        print('  %-18s ✓ canonical %s' % (pagina, m.group(1)))
    # A imagem de partilha tem de estar no domínio novo: os robôs do WhatsApp e
    # do LinkedIn não seguem o 301 do renatovalente5.github.io para a ir buscar.
    for og in _re.findall(r'<meta property="og:image" content="([^"]+)"', h):
        if not og.startswith('https://praiometro.pt/'):
            erro('%s: og:image fora do domínio — %s' % (pagina, og))
    if 'renatovalente5.github.io' in h:
        erro('%s ainda aponta para o domínio antigo' % pagina)

# Caminhos relativos numa página que vai ser servida a partir de /praia/x/
# apontam para o sítio errado. Já não pode haver nenhum.
for pagina in ('index.html', 'privacidade.html', '404.html',
               'metodologia/index.html', 'nortada/index.html',
               'praias/index.html', 'praias/centro/index.html'):
    maus = _re.findall(r'(?:href|src)="(?!https?:|/|#|mailto:|data:)([^"]+)"', _sem_comentarios(pagina))
    if maus:
        erro('%s com caminhos relativos: %s' % (pagina, maus))
    else:
        print('  %-18s ✓ sem caminhos relativos' % pagina)

# O href do preload e o argumento do fetch têm de ser iguais LETRA A LETRA.
# Se divergirem, o preload é descartado e o ficheiro é descarregado duas vezes.
pre = _re.search(r'<link rel="preload" href="([^"]+)"[^>]*as="fetch"([^>]*)>', _sem_comentarios('index.html'))
fet = _re.search(r"fetch\('([^']+praias\.json)'\)", _ler('assets/js/app.js'))
if not pre or not fet:
    erro('não encontrei o par preload/fetch do praias.json')
elif pre.group(1) != fet.group(1):
    erro('preload (%s) != fetch (%s)' % (pre.group(1), fet.group(1)))
elif 'crossorigin' not in pre.group(2):
    erro('o preload do praias.json não tem crossorigin — vem duas vezes')
else:
    print('  preload/fetch      ✓ %s, com crossorigin' % pre.group(1))

# Todas as URLs do sitemap têm de responder.
mapa = _ler('sitemap.xml')
for loc in _re.findall(r'<loc>([^<]+)</loc>', mapa):
    caminho = loc.replace('https://praiometro.pt', '') or '/'
    alvo = 'index.html' if caminho == '/' else caminho.lstrip('/')
    if alvo.endswith('/'): alvo += 'index.html'
    if not os.path.exists(os.path.join(RAIZ, alvo)):
        erro('sitemap aponta para %s, que não existe' % loc)
    else:
        print('  sitemap            ✓ %s' % loc)
if 'https://praiometro.pt/sitemap.xml' not in _ler('robots.txt'):
    erro('o robots.txt não indica o sitemap')

# A privacidade está fora do Google de propósito. As duas metades desta decisão
# têm de andar sempre juntas: `noindex` na página E fora do sitemap. Só uma
# delas é um sinal contraditório, e o Search Console acusa-o como erro.
_priv = _sem_comentarios('privacidade.html')
_m = _re.search(r'<meta name="robots" content="([^"]*)"', _priv)
_robots = _m.group(1) if _m else ''
# Por directiva, e não por substring: «nofollow» contém «follow», e um
# `in` ingénuo dava o teste por passado com o sinal exactamente ao contrário.
_directivas = [d.strip().lower() for d in _robots.split(',')]
_tem_noindex = 'noindex' in _directivas
# Os <loc>, e não o texto do ficheiro: o comentário deste sitemap explica
# porque é que a privacidade saiu de lá, e a palavra aparece nele.
_no_mapa = any('privacidade' in loc for loc in _re.findall(r'<loc>([^<]+)</loc>', mapa))

if _tem_noindex and _no_mapa:
    erro('privacidade.html tem noindex E está no sitemap — sinais ao contrário')
elif not _tem_noindex and not _no_mapa:
    erro('privacidade.html perdeu o noindex mas continua fora do sitemap — falta uma das metades')
elif _tem_noindex:
    if 'follow' not in _directivas:
        erro('o noindex da privacidade não diz `follow` — deixa de passar as ligações para a app')
    else:
        print('  privacidade.html   ✓ noindex, follow, e fora do sitemap')
else:
    print('  privacidade.html   ✓ indexável e no sitemap')

# Um <h1> e um só, e nada de <h2>/<h3> antes dele. Os diálogos da conta
# estavam dentro do <header>, e punham lá cinco.
h = _sem_comentarios('index.html')
if h.count('<h1') != 1:
    erro('index.html tem %d <h1>' % h.count('<h1'))
elif _re.search(r'<h[23]', h[:h.index('<h1')]):
    erro('index.html tem um <h2> ou <h3> antes do <h1>')
else:
    print('  index.html         ✓ um <h1>, e nada de <h2>/<h3> antes dele')

# E NENHUMA PÁGINA SALTA UM NÍVEL DE CABEÇALHO. Os sete hubs de região iam de
# <h1> para <h3> sem <h2> pelo meio — 188 <h3> órfãos, e a única <h3> do
# gerador era essa. Todas as outras páginas do site estavam certas, portanto
# era excepção de um gerador e não convenção: exactamente o tipo de coisa que
# ninguém vê a olho e que um leitor de ecrã anuncia como estrutura partida.
# Vale para o site inteiro, e não só para a entrada.
antes = len(falhas)
_vistas = 0
for _dir, _subs, _fich in os.walk(RAIZ):
    if any(x in _dir for x in ('/_site', '/_source', '/_build', '/.git', '/node_modules')):
        continue
    for _f in sorted(_fich):
        if not _f.endswith('.html'):
            continue
        _rel = os.path.relpath(os.path.join(_dir, _f), RAIZ)
        _h = _sem_comentarios(_rel)
        _niveis = [int(m.group(1)) for m in _re.finditer(r'<h([1-6])[\s>]', _h)]
        if not _niveis:
            continue
        _vistas += 1
        _saltos = [(a_, b_) for a_, b_ in zip(_niveis, _niveis[1:]) if b_ > a_ + 1]
        if _saltos:
            erro('%s salta de <h%d> para <h%d> — sem o nível do meio, a estrutura '
                 'que um leitor de ecrã anuncia fica partida' % (_rel, _saltos[0][0], _saltos[0][1]))
        elif _niveis[0] != 1:
            erro('%s começa em <h%d> e não em <h1>' % (_rel, _niveis[0]))
if len(falhas) == antes:
    print('  cabeçalhos         ✓ %d páginas sem saltar níveis' % _vistas)

# E TODAS AS PÁGINAS LIGAM PARA A PRIVACIDADE. Dez das treze não ligavam, e
# eram justamente as que existem para receber tráfego directo do Google — ou
# seja, aquelas em que alguém chega sem nunca ter passado pela entrada. Uma
# política que só se alcança a partir da página inicial é uma política que
# metade das visitas nunca vê.
antes = len(falhas)
_sem, _com = [], 0
for _dir, _subs, _fich in os.walk(RAIZ):
    if any(x in _dir for x in ('/_site', '/_source', '/_build', '/.git', '/node_modules')):
        continue
    for _f in sorted(_fich):
        if not _f.endswith('.html'):
            continue
        _rel = os.path.relpath(os.path.join(_dir, _f), RAIZ)
        if _rel == 'privacidade.html':
            continue          # não tem de ligar para si própria
        if 'href="/privacidade.html"' in _sem_comentarios(_rel):
            _com += 1
        else:
            _sem.append(_rel)
if _sem:
    erro('%d páginas não ligam para a política de privacidade: %s' % (len(_sem), _sem[:4]))
if len(falhas) == antes:
    print('  privacidade        ✓ alcançável das %d páginas' % _com)

# O CARTÃO DE PARTILHA É O MESMO EM TODAS. Só a entrada tinha `twitter:card`;
# sem ele o X e o LinkedIn caem para um cartão pequeno, com a imagem ao lado em
# vez da imagem inteira — e as páginas de região existem justamente para serem
# partilhadas. Verifica-se junto porque `og:image` sem `twitter:card` é meio
# trabalho, e `twitter:card` sem imagem é pior do que nada.
antes = len(falhas)
_ok = 0
for _dir, _subs, _fich in os.walk(RAIZ):
    if any(x in _dir for x in ('/_site', '/_source', '/_build', '/.git', '/node_modules')):
        continue
    for _f in sorted(_fich):
        if not _f.endswith('.html'):
            continue
        _rel = os.path.relpath(os.path.join(_dir, _f), RAIZ)
        _h = _sem_comentarios(_rel)
        _img = 'property="og:image"' in _h
        _cartao = 'name="twitter:card"' in _h
        if _img and not _cartao:
            erro('%s tem og:image e não tem twitter:card — parte pequeno no X e no '
                 'LinkedIn' % _rel)
        elif _cartao and not _img:
            erro('%s promete um cartão grande e não tem imagem nenhuma' % _rel)
        elif _img:
            _ok += 1
if len(falhas) == antes:
    print('  partilha           ✓ %d páginas com imagem e cartão grande' % _ok)


def verificar_producao():
    """As três que só se podem medir em https://praiometro.pt.

       Correr DEPOIS de publicar: `python3 -c "import sys; sys.path.insert(0,'_source');
       import verificar; verificar.verificar_producao()"` — ou à mão com curl."""
    import urllib.request, urllib.error
    def codigo(caminho):
        pedido = urllib.request.Request('https://praiometro.pt' + caminho, method='HEAD')
        try:
            return urllib.request.urlopen(pedido, timeout=15).status
        except urllib.error.HTTPError as e:
            return e.code
    for caminho in ('/MODELO.md', '/MONETIZACAO.md', '/README.md', '/LICENSE',
                    '/_source/verificar.py'):
        c = codigo(caminho)
        print('  %-24s %s %s' % (caminho, c, '✓' if c == 404 else '✗ TEM DE DAR 404'))
    for caminho in ('/robots.txt', '/sitemap.xml', '/'):
        c = codigo(caminho)
        print('  %-24s %s %s' % (caminho, c, '✓' if c == 200 else '✗ TEM DE DAR 200'))
    print('  %-24s %s %s' % ('/nao-existe-xpto', codigo('/nao-existe-xpto'),
                             '✓' if codigo('/nao-existe-xpto') == 404 else '✗'))


srv.shutdown()
_resumido = []


def _resumo():
    """O resumo sai SEMPRE, mesmo quando a corrida pára a meio.

    Vive num `atexit` porque a bateria pode terminar por três caminhos: até ao
    fim, por `sys.exit(2)` quando a API falha, ou por uma excepção. Nos dois
    últimos o resumo ficava por escrever, e o que se via no registo era uma
    pilha de chamadas sem contas nenhumas.
    """
    if _resumido:
        return
    _resumido.append(1)
    print('\n'+'='*54)
    print('FALHAS: %d' % len(falhas))
    for f in falhas: print('  - '+f)
    if naoMedido:
        print('NÃO MEDIDO: %d' % len(naoMedido))
        for f in naoMedido: print('  · '+f[:200])
    print('='*54)


import atexit
atexit.register(_resumo)
_resumo()

# E O CÓDIGO DE SAÍDA DIZ O MESMO QUE O ECRÃ. Faltava, e não era detalhe: este
# ficheiro terminava SEMPRE em 0, com falhas ou sem elas. Quem o corre à mão lê
# a linha de cima e não dá por nada; quem o correr num script — ou numa Action,
# que é para onde isto há-de ir — vê verde por cima de defeitos. Apanhou-se ao
# testar por mutação a guarda da entrada envenenada: o defeito era mesmo
# apanhado, o ✗ aparecia no ecrã, e o arnês declarava a guarda cega porque
# perguntava ao `$?`. Uma bateria que não sabe dizer que falhou é uma bateria
# que ninguém pode automatizar.
# 1 = mediu e encontrou defeitos · 2 = não conseguiu medir · 0 = está tudo bem.
# O 2 é o que impede um alarme que dispara pela rede de outra pessoa de ensinar
# quem lê a ignorar o vermelho.
sys.exit(1 if falhas else (2 if naoMedido else 0))
