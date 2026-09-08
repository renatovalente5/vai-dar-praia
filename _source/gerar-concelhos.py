# -*- coding: utf-8 -*-
"""Atribui concelho e distrito às 995 praias, a partir da CAOP oficial.

   Correr:  python3 _source/gerar-concelhos.py
   Produz:  _build/dados/concelhos.json

   Corre uma vez e o resultado fica commitado. Só é preciso voltar a correr se
   o data/praias.json ganhar ou perder praias.

   PORQUÊ: o data/praias.json só traz concelho em 48 das 995, e vem do OSM como
   LOCALIDADE, não como concelho — «Sagres», «Ericeira», «Costa da Caparica».
   Sem o concelho não há forma de distinguir as cinco «Praia Fluvial» nem as
   quatro «Praia dos Pescadores», e não há hubs de concelho.

   FONTE: Carta Administrativa Oficial de Portugal (CAOP), da Direcção-Geral
   do Território, em GeoJSON. 308 municípios: 278 do continente, 19 dos Açores
   e 11 da Madeira. Descarrega-se e não se commita — são 9 MB para uma tabela
   de 40 KB. A atribuição da CAOP tem de aparecer no site quando estes dados
   forem publicados numa página.

   O ficheiro mistura duas convenções, e é preciso tratar as duas: o continente
   e a Madeira preenchem `Concelho`/`Distrito`; os Açores deixam-nos vazios e
   usam `MUNICIPIO`/`ILHA`. Ignorar isto deixa 48 praias açorianas sem concelho.
"""
import json, os, sys, urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTE = ('https://raw.githubusercontent.com/nmota/caop_GeoJSON/master/'
         'Portugal_Municipalities.geojson')
CACHE = os.path.join(RAIZ, '_source', 'caop-municipios.geojson')
DESTINO = os.path.join(RAIZ, '_build', 'dados', 'concelhos.json')

MINUSCULAS = {'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o'}


def titulo(s):
    """«VILA NOVA DE GAIA» -> «Vila Nova de Gaia». O que está entre parênteses
       fica como está: «Ilha de São Miguel (Açores)» e não «(açores)»."""
    saida = []
    for i, palavra in enumerate(s.split()):
        entre = palavra.startswith('(')
        nu = palavra.strip('()')
        if i and nu.lower() in MINUSCULAS and not entre:
            novo = nu.lower()
        else:
            novo = nu[:1].upper() + nu[1:].lower() if nu.isupper() else nu[:1].upper() + nu[1:]
        saida.append(('(' + novo + ')') if entre else novo)
    return ' '.join(saida)


def aneis(g):
    return [p[0] for p in g['coordinates']] if g['type'] == 'MultiPolygon' else [g['coordinates'][0]]


def dentro(x, y, anel):
    """Ray casting. Sem dependências — o projecto não tem nenhuma e não vai ter."""
    d, n, j = False, len(anel), len(anel) - 1
    for i in range(n):
        xi, yi = anel[i][0], anel[i][1]
        xj, yj = anel[j][0], anel[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-18) + xi):
            d = not d
        j = i
    return d


def dist2(x, y, aneis_):
    """Distância ao quadrado ao vértice mais próximo. O 0.62 é cos(40°)² — sem
       ele, um grau de longitude em Portugal pesava como um de latitude."""
    m = 1e9
    for anel in aneis_:
        for i in range(0, len(anel), 2):
            m = min(m, (anel[i][0] - x) ** 2 * 0.62 + (anel[i][1] - y) ** 2)
    return m


def main():
    if not os.path.exists(CACHE):
        print('a descarregar a CAOP (9 MB)…')
        urllib.request.urlretrieve(FONTE, CACHE)
    mun = json.load(open(CACHE, encoding='utf-8'))
    praias = json.load(open(os.path.join(RAIZ, 'data', 'praias.json'), encoding='utf-8'))

    feitos = []
    for f in mun['features']:
        p = f['properties']
        nome = p.get('Concelho') or p.get('MUNICIPIO')
        zona = p.get('Distrito') or p.get('ILHA')
        if not nome:
            print('  aviso: município sem nome, DICO', p.get('DICO')); continue
        anelos = aneis(f['geometry'])
        xs = [c[0] for r in anelos for c in r]
        ys = [c[1] for r in anelos for c in r]
        feitos.append({'concelho': titulo(nome), 'zona': titulo(zona or ''), 'dico': p['DICO'],
                       'aneis': anelos, 'caixa': (min(xs), min(ys), max(xs), max(ys))})
    print('municípios lidos: %d' % len(feitos))

    saida, vizinhos, foraDoPais = {}, 0, []
    for pr in praias:
        x, y = pr['lo'], pr['la']
        achado = None
        for f in feitos:
            c = f['caixa']
            if c[0] - .02 <= x <= c[2] + .02 and c[1] - .02 <= y <= c[3] + .02 \
               and any(dentro(x, y, r) for r in f['aneis']):
                achado = f
                break
        if not achado:
            # Praia à beira-mar: a coordenada do OSM cai muitas vezes sobre a
            # água, fora do polígono. Fica o município mais próximo.
            vizinhos += 1
            perto = [f for f in feitos
                     if f['caixa'][0] - .3 <= x <= f['caixa'][2] + .3
                     and f['caixa'][1] - .3 <= y <= f['caixa'][3] + .3] or feitos
            achado = min(perto, key=lambda f: dist2(x, y, f['aneis']))
            # MAS «O MAIS PRÓXIMO» TEM DE ESTAR PERTO.
            # =============================================================
            # Este ramo existe para a coordenada de uma praia cair sobre a
            # água, uns metros ao largo do polígono do município. A queda para
            # o vizinho mais próximo não tem limite nenhum, e por isso aceitava
            # QUALQUER ponto do planeta e dava-lhe um concelho português.
            #
            # Foi o que aconteceu à «Praia do Verde Lago»: a própria APA
            # publica-a em 37,10183 / −7,29213, que fica a 11,5 km da foz do
            # Guadiana, ao largo de Isla Canela — em Espanha. Entrou no
            # ficheiro, este ramo carimbou-lhe «Vila Real de Santo António», e
            # a seguir o gerar-regioes.js deu-lhe «Algarve». Três programas a
            # concordar sobre uma praia que não está no país.
            #
            # Um areal fica a metros da linha de costa, não a quilómetros.
            # Cinco quilómetros é largo de propósito — chega para ilhéus e para
            # pontas mal desenhadas da CAOP — e mesmo assim apanha isto.
            d = dist2(x, y, achado['aneis']) ** .5 * 111.32
            if d > 5.0:
                foraDoPais.append((pr['n'], pr['la'], pr['lo'], d, achado['concelho']))
        saida['%.4f,%.4f' % (pr['la'], pr['lo'])] = {
            'co': achado['concelho'], 'di': achado['zona'], 'dico': achado['dico']}

    if foraDoPais:
        print('ERRO: %d praia(s) a mais de 5 km de qualquer município português:'
              % len(foraDoPais))
        for n, la, lo, d, co in foraDoPais:
            print('   %-44s %.5f,%.5f — %.1f km fora (o mais perto era %s)'
                  % (n[:44], la, lo, d, co))
        print('   Uma coordenada fora do país não é uma praia deste site.')
        print('   Ver a COORDENADA_ERRADA em _source/actualizar-balneares.js.')
        return 1

    if len(saida) != len(praias):
        print('ERRO: %d praias deram %d chaves — há coordenadas repetidas'
              % (len(praias), len(saida)))
        return 1

    os.makedirs(os.path.dirname(DESTINO), exist_ok=True)
    with open(DESTINO, 'w', encoding='utf-8') as f:
        json.dump(saida, f, ensure_ascii=False, sort_keys=True, indent=0)
    concelhos = sorted(set(v['co'] for v in saida.values()))
    print('praias           : %d' % len(saida))
    print('dentro do polígono: %d | pelo mais próximo: %d' % (len(saida) - vizinhos, vizinhos))
    print('concelhos distintos: %d' % len(concelhos))
    print('%s — %.1f KB' % (DESTINO, os.path.getsize(DESTINO) / 1024.0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
