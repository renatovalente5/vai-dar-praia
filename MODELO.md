# Como o site decide se está bom para a praia

Este documento é a especificação do modelo. Está no repositório de propósito:
um veredicto que não se consegue explicar não merece confiança.

## De onde vem o esqueleto

A base é o **HCI:Beach** (*Holiday Climate Index: Beach*), de Rutty, Scott e
Steiger — o índice revisto por pares desenhado especificamente para turismo
balnear. Fórmula original:

```
HCI:Beach = 2(TC) + 4(A) + 3(P) + W        →  0 a 100
            conforto  céu   chuva  vento
             20%      40%    30%   10%
```

Três coisas nele não servem para Portugal, e é por isso que este modelo não é
o HCI tal e qual:

1. **Não tem temperatura da água.** No Mediterrâneo e nas Caraíbas, onde foi
   validado, a água está sempre boa. Em Portugal continental é o factor que
   mais gente comenta na praia.
2. **O conforto térmico é pontuado em *humidex*, com o planalto em 28–31.** É
   uma escala diferente da temperatura aparente que este modelo usa, e não se
   compara directamente com ela.
   (A versão anterior deste documento dizia «calibrado para 30–36 °C» e que
   isso era «quente demais para o gosto português». Foi verificado contra a
   Tabela 3 de Rutty et al. 2020 e **está errado nas duas pontas**: a banda é
   28–30,9 e é humidex, não temperatura do ar. Essa frase esteve anos a
   justificar um planalto que acabava nos 31 °C aparentes.)
3. **Dá ao vento apenas 10%.** Em Portugal a **nortada** é, na prática, o que
   mais dias estraga.

## O modelo usado aqui

100 pontos, repartidos assim:

| Factor | Peso | Porquê |
|---|---:|---|
| **Vento** | **34** | É o que mais dias estraga em Portugal — e um dia sem vento nenhum nota-se |
| Sol e céu | 26 | A razão nº1 para ir à praia |
| Temperatura do ar (sensação) | 18 | O calor que se sente, não o do termómetro |
| Temperatura da água | 14 | O que decide se se entra no mar |
| Chuva | 8 | Pouco peso porque a chuva a sério está nos vetos |

O vento é o factor mais pesado do modelo, e leva **mais do triplo** do que o
HCI:Beach lhe dá. Não é um palpite: é a diferença entre um índice validado no
Mediterrâneo e nas Caraíbas e um país onde a nortada é o assunto de Agosto.

Nas praias de rio não há dados de mar: a nota passa a ser a proporção dos pontos
obtidos sobre os 86 pontos que restam, o que equivale a redistribuir os 14 da
água proporcionalmente pelos outros factores.

**Consequência que é preciso conhecer.** A escala da água é absoluta e o
Atlântico raramente chega ao topo dela: em Agosto uma praia do noroeste anda nos
18 °C, que valem 8 dos 14 pontos. Uma praia de rio não carrega esse arrasto.

### O `m` não quer dizer «mar»

Quer dizer **«a grelha marinha da Open-Meteo descreve esta água»**. Uma ria e uma
lagoa costeira têm água salgada e contam como `m=0`, porque a grelha não tem
célula lá dentro: encaixa no oceano aberto mais próximo e responde com os
números de lá, sem avisar. A Armona-Ria e a Armona-Mar, a 1,3 km uma da outra,
recebiam exactamente a mesma resposta.

Medido em Junho a Setembro de 2025, 9h-19h:

| | com `m=1` | com `m=0` |
|---|---|---|
| Foz do Arelho-Lagoa: dias com veto de mar cavado | 19 de 122 (15,6 %) | 0 |
| Foz do Arelho-Lagoa: nota média | 58,7 | 68,0 |
| Carcavelos, mar aberto: dias com veto | 4 de 122 (3,3 %) | — |

Sete registos, escolhidos à mão em `_source/actualizar-praias.js` com a razão à
frente de cada um. Não há regra automática: o nome não chega — a «Praia da
Lagoa» é no concelho de Lagoa e é mar aberto — e a API marinha responde em toda
a costa, portanto nunca diz «esta água não é minha».
Medido com tempo exactamente igual (céu 15 %, vento 12 km/h, 27 °C, sem chuva):

| | Nota |
|---|---|
| Praia de mar, água a 18,5 °C | 89 |
| Praia de mar, água a 22,5 °C (Algarve) | 95 |
| Praia de rio | **94** |

São **5 pontos** de diferença entre mar e rio no mesmo dia, e chegam para virar
um amarelo em verde perto do corte dos 70. A nota de uma praia de rio responde
bem à pergunta «este dia presta nesta praia?», mas **não é directamente
comparável** com a de uma praia de mar. Por isso as praias de rio aparecem
marcadas com «rio» na pesquisa e na tira de favoritos, que é onde as duas
apareceriam lado a lado.

### Janela horária

Tudo é calculado em **duas janelas** — 9h–13h e 15h–19h — e as 13h–15h ficam
de fora. Ver «As duas partes do dia», mais abaixo, que é onde isto está
explicado por inteiro. (Esta secção dizia «entre as 11h e as 19h» e ficou para
trás quando a janela mudou; a janela contínua já não existe.)

Dentro delas: céu pela **média**, temperatura do ar pelo **máximo**, água pela
**média**, chuva pela **probabilidade máxima** e pelo **acumulado dentro da
janela**, ondulação pelo **máximo**.

O **vento é o percentil 75**, não a média. A média das horas todas achatava
exactamente o pico da tarde, que é quando a nortada sopra. Medido no Furadouro:
média 11,2 km/h contra 15,2 no pico — o site dizia menos vento do que qualquer
outro sítio, e tinha razão quanto à média e nenhuma quanto ao que se sente.

A **direcção do vento é uma média vectorial**, não aritmética. A direcção é uma
grandeza circular: a média de 350° e 10° dá 180° — sul, o oposto de norte — e a
nortada vive em cima dessa descontinuidade. Medido com ERA5 (Jul+Ago,
2019–2025), a média aritmética perdia 15% das nortadas na Nazaré e 38% em
Peniche. Não voltar a trocar por média simples.

### As duas partes do dia

A janela do dia são DOIS blocos (`PARTES`), com um buraco no meio:

| parte | horas |
|---|---|
| Manhã | 9h–13h |
| Tarde | 15h–19h |

**As 13h–15h ficam de fora**, e é de propósito: é a hora de almoço e do sol a
pique. O dia é a UNIÃO dos dois blocos (`BLOCOS_DIA`) e não o intervalo 9h–19h —
não há uma única conta no ficheiro que olhe para as 14h. É por isso que existe
`agregarBlocos(tempo, marinho, praia, dia, blocos)`; a `agregarJanela(…, ini,
fim)` ficou como invólucro de um bloco só, que é o que as partes e os testes
usam.

`HORA_INI = 9` e `HORA_FIM = 19` são as PONTAS da janela. Servem para a
publicar e como omissão da `janela()`. **Não agregar com elas** — dá onze horas
seguidas, incluindo as 14h.

Blocos do mesmo tamanho (cinco horas cada) importam: o p75 do vento é o mesmo
estimador nos dois. Numa divisão de 4 e 5 horas não era.

Houve uma versão com três partes (Manhã / Meio-dia / Tarde, blocos de três
horas dentro de 11h–19h). Foi tirada a pedido.

#### A nota do dia é a média das duas

`classificarDia(d, notaImposta)` — o segundo argumento substitui a nota ANTES
das regras de cor, portanto há um só sítio a decidir a cor. A `avaliarDia()`
devolve `{d, v, partes, media}` e é o único ponto de entrada da interface.

Antes, a nota do dia era a soma dos seus próprios factores ao longo da janela
inteira. Como a chuva e a ondulação entram por máximo e os milímetros por soma,
uma janela longa acumulava sempre mais do que meia, e o dia saía
sistematicamente mais severo do que as suas partes. Medido em 1200 dias-praia:
a média fica **2 pontos acima** (mediana), até +12 no pior caso, e a cor muda em
7,0 % dos dias.

`min(partes) ≤ nota do dia ≤ max(partes)` passa a ser uma **identidade**.

O que NÃO mudou: vetos, factor limitante, cor, nortada, aviso de UV e a frase
saem todos do agregado da janela toda. Um veto é um máximo ou uma soma e não se
dilui numa média.

Uma parte vetada entra na média pela sua `notaPropria`; no lugar do número, o
cartão diz por palavras o que a chumbou (o ✕ saiu — lia-se como avaria).
A água e a ondulação são copiadas do dia para cada parte ANTES de a pontuar.

**O dia pode chumbar com as duas partes sãs.** Os milímetros entram por SOMA e o
dia é a união exacta das duas partes: 1,2 mm de manhã e 1,2 à tarde passam as
duas — o veto é aos 2 — e o dia chumba em 2,4. Aí o cartão fica com a barra
vermelha por cima de dois blocos verdes, e é a linha por cima dos blocos que diz
«O dia está chumbado: chuva a sério». Guardado em `verificar.py`, secção 6d.

#### A frase

**Já não aparece no cartão.** A linha «Nota do dia N em 100» e a frase da razão
saíram do ecrã a pedido, em 12 de Agosto de 2026; o cartão passou a ser o nome
da praia, o dia e os dois blocos, e mais nada. O modelo continua a calcular
`frase`, `razao`, `ressalva()` e `queixa()` — estão cobertos por testes e a porta
fica aberta — mas **nenhum deles chega hoje a um utilizador**. Duas consequências
a registar, para quem voltar aqui:

- o caso «as duas da mesma cor mas com doze pontos ou mais de diferença» deixou
  de ter voz: os dois números estão à vista e o site não aponta a melhor metade
  (a tira só diz «Melhor de manhã/tarde» quando as **cores** diferem);
- a palavra **nortada** desapareceu do produto — só a `queixa()` a escrevia, e o
  site tem uma página inteira sobre ela.

O que se segue é o registo do portão antigo, que já não existe no modelo:

Quatro portões em conjunção, mais o travão assimétrico (`ACORDO_TARDE = 3`) e o
relógio:

| portão | valor |
|---|---|
| cores diferentes | — |
| diferença de nota | `LIMIAR_METADES = 15` |
| relativo ao desacordo do dia | `SIGMAS_METADES = 2` |
| prazo | `PRAZO_METADES = 1` |

**Medido com as janelas de hoje** (`_source/medir-portao.js`, 2400 dias-praia
contra o ERA5):

| | 11h–14h / 15h–19h | **9h–13h / 15h–19h** |
|---|---|---|
| taxa-base | 28,0 % | **32,6 %** |
| dispara em | 3,0 % | **5,3 %** |
| acerta o sentido | 98,6 % | **96,1 %** |
| precisão por cor | 79,5 % | **80,5 %** |

Com as janelas novas o portão fala mais e acerta mais por cor: a manhã a
começar às 9h e o buraco do almoço tornam as duas partes mais distintas.

**Se mexeres nas horas, corre outra vez o `medir-portao.js` e republica os seis
números na /metodologia/.** Há um teste que verifica que eles lá estão, mas
nenhum teste sabe se são os certos — só a medição sabe.

**Não** se divide a água, a ondulação nem o índice UV.

### O lado quente da curva do calor, recalibrado

**Agosto de 2026.** Defeito reportado: a Praia da Rocha com 34 °C no
termómetro (36,3 aparentes), sol aberto, sem vento e sem chuva, saía
«assim-assim». O calor dava 6 pontos em 18 — 33 % — e isso chega para a regra
do factor limitante despromover o dia de verde para amarelo.

O joelho estava nos **31 °C aparentes**, abaixo da mediana das tardes de Agosto
no Algarve. Passou para **34**:

| | antes | depois |
|---|---|---|
| 18/18 até | 31,0 | **34,0** |
| 40 % (despromove verde→amarelo) | 35,4 | **37,4** |
| 20 % (o calor escreve a frase) | 38,1 | **38,8** |
| 8 % (vermelho) | 39,5 | **39,8** |
| zero | 40,5 | 40,5 |

Só se mexeram quatro pares, todos do lado quente. A subida (15,5 → 25), o veto
de frio e o zero em 40,5 ficaram byte a byte iguais, e o declive máximo
manteve-se em **3,33 pontos por °C** — meio grau entre duas corridas de
previsão não pode virar a cor de um dia.

**A âncora dos 37,4** é o único ponto de desistência medido que existe para o
Mediterrâneo: 867 inquéritos em 18 praias da Catalunha (Sardá et al., 2023),
35,6 °C reais (dp 4,2). E os 34 são o topo do intervalo ideal declarado em
quatro amostras europeias independentes. Abaixo daí não há uma única fonte que
diga que se perde qualidade de dia de praia.

**Impacto medido** (480 partes-dia, 40 praias do Minho ao Algarve): 13,5 %
sobem de cor, **zero descem**; mediana +1, média +2,9. Alentejo, Açores e
Madeira a zero; as fluviais do interior são as que mais mudam.

**Não** se acrescentou veto de calor. Com a curva nova o calor já leva o dia a
vermelho sozinho aos 39,8 aparentes; um veto não acrescentaria uma
despromoção — acrescentaria só uma frase. E a assimetria com o frio está
certa: abaixo de 16 °C não há remédio nenhum, ao passo que o calor tem a água,
que já vale 14 pontos à parte.

#### A DÍVIDA, e é para pagar sozinha

A `apparent_temperature` da Open-Meteo **inclui a radiação solar**. Num dia de
céu limpo o sol dá 26 pontos e tira pontos ao calor: é a mesma variável a puxar
nos dois sentidos.

**CORRIGIDO em 13 de Agosto de 2026: esta secção exagerava.** Dizia que era a
dupla contagem, «mais do que a calibração», que produzia o caso reportado. Foi
medida, e não é.

A dupla contagem é REAL mas é PEQUENA, e agora está medida (90 072 horas de
praia em `archive-api`, 8 praias, Junho a Setembro de 2015 a 2025). Controlando
o vento e o termómetro, o excesso da aparente sobre o termómetro cai apenas
**0,1 a 0,5 °C** do céu limpo para o céu tapado — no declive mais íngreme da
curva isso vale **1,7 pontos em 18**, e no planalto dos 25-34 °C vale **zero**.

O que é grande é outra coisa, e **não é contaminação nenhuma: é física**. Na
janela de praia a aparente mediana é 27,7 °C com céu limpo e 22,6 °C com céu
tapado — 5,1 °C —, e a maior parte dessa queda é o **termómetro** a estar mais
baixo, porque não houve sol para aquecer o ar. O modelo já converte isso em
**6,8 pontos de 18**, e vai continuar a convertê-lo depois de a dívida ser paga:
trocar a variável por uma sem radiação **não remove** este caminho.

A consequência prática, e é a que interessa a quem vier a seguir: o modelo já
encaminha «não há sol» por DOIS sítios — o factor Sol e o factor Calor —, e o
segundo é o maior dos dois em Junho e Setembro. Qualquer castigo adicional ao
céu **soma-se** a esse. Percentagem de horas tapadas com a aparente abaixo do
planalto dos 25 °C: Junho 88 %, Julho 81 %, Agosto 79 %, Setembro 83 % (com céu
limpo: 59, 43, 42 e 59 %). Uma calibração feita numa semana quente de Agosto é
feita no único momento do ano em que o planalto esconde o efeito.

Alargar o planalto **compensa** a parte pequena, deslocando o joelho. Não a
corrige. Quem for limpar a variável (ou trocar o `maximo` da janela pelo
percentil 75, que é a outra dívida) tem de **remedir esta curva**, e tem de o
fazer numa alteração separada — senão deixa de se poder atribuir o resultado a
uma das duas mudanças.

Duas ressalvas honestas sobre a medição: assenta numa só corrida de previsão de
uma semana quente de Agosto, sem verificação contra o ERA5; e não existe um
único inquérito de preferência térmica de banhistas **em Portugal** — todos os
joelhos são transplantados da Catalunha, da Grécia e de uma amostra europeia
geral.

### As escalas são curvas, não escadas

As cinco tabelas abaixo dão os pontos por onde a curva de cada factor passa.
**Entre dois valores da tabela, os pontos são interpolados** — a nota varia a
pouco e pouco em vez de cair de uma vez.

Isto não era assim até 3 de Agosto de 2026: cada linha era um patamar fixo, e
ao passar a fronteira a nota dava um salto. Media-se **8 pontos de queda entre
19 e 20 km/h de vento**, e **5 pontos entre 24,9 °C e 25,0 °C de sensação** —
este segundo invisível, porque o ecrã mostra os dois valores como «25 °C». Duas
praias com tempo praticamente igual apareciam a 77 e a 64 pontos.

Com a interpolação, o maior salto por unidade passou a:

| Factor | Antes | Agora |
|---|---:|---:|
| Vento (por km/h) | 8,0 | 1,8 |
| Sol (por ponto de %) | 8,0 | 0,4 |
| Calor (por 0,1 °C) | 6,0 | 0,3 |
| Água (por 0,1 °C) | 4,0 | 0,3 |
| Chuva (por ponto de %) | 3,0 | 0,2 |

A calibração é a mesma: em 358 dias reais de 60 praias, a nota mudou 2,35
pontos em média, e 94 % dos dias ficaram a 5 pontos ou menos da nota antiga.

### Vento (34 pontos)

| Vento médio | Pontos | O que se sente |
|---|---:|---|
| ≤ 8 km/h | 34 | Sem vento nenhum |
| 10 km/h | 31 | A toalha fica quieta |
| 14 km/h | 27 | Brisa agradável |
| 17,5 km/h | 23 | Venta um pouco |
| 22 km/h | 15 | Começa a levantar areia |
| 30 km/h | 7 | Nortada instalada |
| 36 km/h | 2 | Areia na cara |
| ≥ 42 km/h | 0 | Impraticável |

O planalto do topo existe para premiar o dia calmo: com tudo o resto igual,
6 km/h dá 94 pontos e 22 km/h dá 75. São 19 pontos de diferença só no vento.

Os cortes não são inventados. **7 m/s (25 km/h)** é o limiar da definição
operacional de nortada usada em Portugal (vento de 315°–45° com ≥ 7 m/s). E o
início do transporte de areia por saltação, para grão de praia de ~190 µm,
dá-se a uma velocidade de atrito de ~0,23 m/s, o que convertido para vento a
10 m (κ=0,4, z₀≈1 mm) dá **≈ 19 km/h**. Duas linhas independentes — a
meteorologia portuguesa e a física eólica — caem na mesma banda dos 20–25 km/h.
É aí que está o degrau grande da tabela.

### Sol e céu (26 pontos)

| Nebulosidade média | Pontos |
|---|---:|
| ≤ 20 % | 26 |
| 30 % | 23 |
| 50 % | 17 |
| 70 % | 9 |
| 90 % | 4 |
| 100 % | 2,5 |

Acima de **60 % de nuvens** o dia não pode ser verde, por regra própria: é um
dia mais tapado do que aberto. Enquanto a escala era uma escada, isto vinha de
graça do corte dos 40 % do factor limitante; com a curva contínua passou a
estar escrito à parte.

#### O fundo da curva, e a fonte que faltava

Até 13 de Agosto de 2026 este era o **único factor do modelo sem uma única
fonte**: os outros quatro citam inquéritos, física ou medições, e o céu tinha
só a frase «a razão n.º 1 para ir à praia». E o fundo da curva era **plano dos
90 aos 100 %** — 0 % de sol valia exactamente o mesmo que 10 %.

O plano era um acidente de arrastamento. No commit `d0bbc38` o peso do céu
desceu de 28 para 26, a pedido, para dar mais peso ao vento; todas as âncoras
foram reescaladas **menos o fundo**, que ficou nos 4 em vez de descer para 3,7.
O rácio do dia tapado até **subiu** nessa altura, de 0,143 para 0,154.

O que as fontes dizem, verificadas artigo a artigo:

| índice | peso do sol | o que faz ao céu totalmente tapado |
|---|---|---|
| **BCI** — Morgan et al. 2000, **1354 banhistas inquiridos** | 27 % | *«falling in linear fashion to zero for absence of sunshine»* — vai a **zero** |
| **TCI** — Mieczkowski 1985 | 20 % | **0** acima de 91,7 % de nuvens |
| **HCI:Beach** — Rutty et al. 2020, Tabela 2 e 4 | 40 % | 2 em 10; nunca chega a zero, por decisão explícita |
| **Praiómetro** | 26 % | 2,5 em 26 |

O peso **26 não se mexeu**, e a razão é o BCI: é o único índice que perguntou a
pessoas a sério, e mede 27 %. O fundo desceu para 2,5.

**O 2,5 não é uma medição, é um limite de arquitectura, e diz-se.** Abaixo de
2,08 (= 0,08 × 26) o céu passaria a pintar dias de vermelho **sozinho**, pela
regra do factor limitante. Nenhuma fonte sustenta isso, e o custo seria alto:
uma manhã em cada cinco em Agosto no noroeste é de céu tapado — Furadouro 19 %,
Moledo 25 %, Nazaré 24 %, medido em 11 Agostos de ERA5. Há um teste em
`testar-modelo.js` que guarda essa fronteira em **rácio** e não em pontos, para
sobreviver à próxima mudança de peso — foi uma mudança de peso que criou isto.

**Efeito, medido em 19 705 partes-dia** (Junho a Setembro de 2015 a 2025, 8
praias de Moledo a Monte Gordo, sem chuva): nada muda abaixo dos 90 % de nuvens
(0 em 17 383). Com 100 % de nuvens a mediana desce de 57 para 55. Mudam de cor
**36 em 19 705** — 0,18 % —, todas de amarelo para vermelho e todas já a 45-46,
um ponto acima do corte.

**O que isto NÃO resolve.** A queixa que o originou era uma manhã de 72 no
Furadouro com 10 % de sol, e essa passa a 71. A aritmética é fechada: 4 pontos
de céu mais 68 de vento, calor, água e ausência de chuva. Medido em 11 Agostos,
essa manhã está no **topo dos 4 %** dos dias tapados — tinha o mar a 19,9 °C,
percentil 89 do Furadouro em Agosto. A parte-dia tapada mediana vale **58**, e
**nenhuma** das 650 medidas é verde. E o HCI:Beach, aplicado a esse mesmo dia,
dá **exactamente 72**.

### Temperatura do ar — sensação (18 pontos)

Usa-se a **temperatura aparente**, não a do termómetro: é a que inclui o efeito
do vento e da humidade.

| Sensação máxima | Pontos |
|---|---:|
| 25–31 °C | 18 |
| 23,5 ou 32,5 °C | 13 |
| 20,5 ou 35,5 °C | 7 |
| 17,5 ou 38,5 °C | 3 |
| ≤ 15,5 ou ≥ 40,5 °C | 0 |

### Temperatura da água (14 pontos)

**É aqui que um modelo estrangeiro se enganava em Portugal inteiro.** O
Atlântico português anda entre 17 e 20 °C em Agosto por causa do afloramento
costeiro. Medido na API no dia 2 de Agosto de 2026: Carcavelos 18,1 °C,
Nazaré 18,6 °C, Lagos 17,4 °C, Monte Gordo 21,9 °C, Funchal 24,8 °C.

Um modelo mediterrânico, que pede 24 °C para dar nota positiva, marcaria a
costa continental inteira a vermelho todos os dias do ano. A escala é
portuguesa:

| Água | Pontos | O que se diz na praia |
|---|---:|---|
| ≥ 22 °C | 14 | Está boa |
| 21 °C | 11 | Dá bem |
| 18,5 °C | 8 | Fresca, entra-se aos poucos |
| 17 °C | 4 | Fria |
| 15 °C | 2 | Muito fria |
| ≤ 13 °C | 0 | Gelada |

### Chuva (8 pontos)

| Probabilidade máxima | Pontos |
|---|---:|
| ≤ 8 % | 8 |
| 17,5 % | 6 |
| 35 % | 3 |
| 57,5 % | 1 |
| ≥ 70 % | 0 |

## O factor limitante

Uma soma ponderada tem um defeito conhecido, e é a crítica que a literatura faz
aos índices aditivos como o TCI e o HCI: **um factor catastrófico é mascarado
pelos outros**. Medido durante o desenvolvimento: 38 km/h de vento dava 60
pontos, porque o sol e a ausência de chuva compensavam. Numa praia, 38 km/h
manda toda a gente embora, faça o sol que fizer.

Por isso, além da soma:

- se algum factor ficar abaixo de **8 %** do seu peso, o dia é **vermelho**;
- se ficar abaixo de **40 %**, o dia **não pode ser verde**.

A regra aplica-se ao sol, ao vento, ao calor e à chuva — o que determina se se
consegue **estar** na areia. **Não se aplica à água**: o mar gelado impede o
banho, não impede o dia de praia.

Com as escadas, este corte dos 40 % disparava em patamares inteiros: a banda dos
19–22 °C de sensação valia 7/18 = 0,389 e mandava para amarelo toda a banda, e a
dos 26–45 % de chuva valia 3/8 = 0,375 e fazia o mesmo. Com as curvas, o corte
passa a dar-se no ponto exacto — 20,5 °C no calor, 35 % na chuva — e os dias que
antes ficavam apenas do lado errado do patamar deixam de ser travados. Em 358
dias reais isso deu **36 dias de amarelo para verde** e **15 de verde para
amarelo** (estes por causa da regra dos 60 % de nuvens, agora explícita). Se o
corte dos 40 % se quiser tão apertado como antes, é este número que se afina.

## Vetos

Estas condições mandam o dia para **vermelho** sozinhas, independentemente da
pontuação. Um dia com trovoada não é um dia "médio".

- Probabilidade de chuva > 70 % ou **acumulado ≥ 2 mm dentro da janela**
  (era o acumulado do dia inteiro: 79 % dos vetos vinham de chuva de madrugada
  ou de noite, e chumbavam tardes de sol)
- Vento > 45 km/h ou rajadas > 65 km/h — **aviso de segurança**
- Sensação térmica máxima < 16 °C
- Ondulação máxima > 2,5 m (só em praias de mar) — **aviso de segurança**

### A trovoada não é veto (desde 6 ago 2026)

Era, e mediu-se antes de sair. Em **720 dias-praia reais**, 22 tinham trovoada
prevista; em 11 era o **único** veto, e esses 11 seriam **todos verdes** sem ela,
com nota média de **85** (21-44 % de nuvens, 12-20 km/h de vento). Nenhum
amarelo, nenhum vermelho.

O veto não apanhava dias maus: um dia com trovoada a sério já é chumbado pela
chuva (>70 % de probabilidade ou ≥2 mm na janela), e foi o que aconteceu nos
outros 11. O único efeito era transformar dias de 80 a 91 pontos num «Hoje não»
sem nota.

A causa é o gatilho, e são duas coisas. Basta **uma hora** da janela com código
de trovoada, e — pior — o consenso entre os quatro modelos usava o **máximo** do
código, pelo que bastava **um** modelo para os outros três serem ignorados.

Medido a 8 ago 2026, em 21 dias-praia com aviso: **1 modelo em 4 concordava em
19 deles (90 %)**, 2 em 4 num, 3 em 4 noutro, e nunca os quatro. Em Caminha
nesse dia, às 18h: UKMO via trovoada, ECMWF dizia chuvisco, ICON dizia nuvens,
GFS dizia céu limpo.

Passou a exigir **dois modelos em quatro na mesma hora** (`temTrovoada` conta
`trovoada_modelos`, que o `consenso` emite ao lado do `weather_code`). Efeito
medido: de **22 avisos para 2** em 720 dias-praia, e esses dois em dias que a
chuva já vetava. Com um só modelo disponível, um chega — senão a regra
desligava-se sozinha em vez de ficar mais exigente.

Passa a **aviso de segurança**: aparece no tom de perigo, com o que fazer («se
ouvires trovões, sai da água e da praia»), e não mexe na cor nem esconde a nota.
As cores dizem se vale a pena ir, não se é seguro estar.

Os vetos marcados como aviso de segurança são ditos noutro tom e noutra cor: um
aviso de trovoada no mesmo amarelo que «a água está fria» é um aviso que
ninguém lê. E um dia vetado **não pode mostrar a nota que teria sem o veto** —
um 94 na tira ao lado de «Hoje não» destrói a confiança em tudo o resto. Até 23
de Agosto de 2026 a nota simplesmente desaparecia; hoje o veto entra NA nota e
ela cai na banda do vermelho (ver «A nota manda na cor»).

### A maré

Entrou em 22 de Agosto de 2026. **Não pontua**: não entra nos pesos, não veta,
não é factor limitante. É um facto sobre o mar, dito ao lado do veredicto.

**Só HORAS, e a razão é dupla e medida.**

Os METROS não se podem mostrar. A fonte é a Marine API da Open-Meteo, que serve
o `sea_level_height_msl` do Copernicus (`cmems_mod_glo_phy_anfc_merged-sl`), com
a maré do atlas FES2014. O zero dela é o **geóide**, não o nível médio — a média
anual em Cascais é −0,369 m — e o **Zero Hidrográfico** das tabelas do Instituto
Hidrográfico está ~2,6 m abaixo dele (medido em Leixões +2,59, Cascais +2,67,
Sines +2,57, Lagos +2,65). O IH só publica esse afastamento para uns 16 portos e
o site tem 995 praias: escrever «1,74 m» no Furadouro seria dar precisão de
tabela náutica a um número tirado de uma constante média.

A AMPLITUDE também não, por outra razão: medida em 80 praias do continente, ela
é **99,6 % explicada pelo DIA e 0,3 % pela PRAIA**. Moledo e Monte Gordo, a
520 km, dão r = 0,9955 e 0,113 m de diferença média. Seria uma linha a escrever
o mesmo número nas 995. A HORA não é assim: a mesma preia-mar espalha-se **39
minutos** de norte a sul (máximo 42), contra os ~50 min/dia a que a maré atrasa.

**+30 minutos**, e não é um acerto a olho. A fonte é a média horária carimbada
no início do intervalo e vem adiantada. Contra o marégrafo de Cascais do IOC, o
erro quadrático médio cai de 0,187 m para **0,027 m** ao deslocar +30 min; quatro
estações, de 42,4 N a 37,1 N, dão 29,5 a 32,9 minutos.

**O pico lê-se por parábola** sobre três horas, não pela hora mais próxima:
contra o marégrafo ao minuto, o erro na hora cai de 16,1 min de média (47 no pior
caso) para 6,9 (29,7).

**Mostra-se uma CURVA, não uma frase.** Foi pedido assim, e há uma vantagem
real: uma curva mostra a FORMA sem afirmar uma altura, portanto contorna de vez
o problema do datum. O desenho é SVG escrito à mão — este projecto não tem
dependências. A escala vertical é a dos SEIS dias e não a do dia aberto:
normalizar cada dia ao seu próprio máximo faria um dia de águas mortas parecer
igual a um de águas vivas, e essa diferença é a única coisa real que a maré tem
para dizer ao longo da semana. A faixa cinzenta é o DIA DE PRAIA, das 9h às 19h, contínua. Esteve partida em
duas — 9h-13h e 15h-19h, com a fenda do almoço à vista — e voltou a ser uma a
pedido. É preciso ser exacto sobre o que ela diz: marca o intervalo de que o
cartão fala, e NÃO «as horas que o modelo pontua», que são duas e deixam as
13h-15h de fora. Essa distinção é de cálculo e vive nesta página, não num
rectângulo cinzento. Os extremos da faixa saem do `Modelo.PARTES`.

Os pontos e as horas
marcam TODOS os extremos que a curva mostra, e não só os que caem lá dentro:
um desenho com quatro picos e um só ponto marcado deixa quem olha a perguntar
porque é que os outros três não contam. São 3 ou 4 por dia civil (medido em 60
dias-praia: 4 em 50 deles, 3 nos outros, porque quatro ocupam ~24,8 h e um
transborda para o dia seguinte).
E leva por baixo, escondido à vista, o texto que a descreve: um desenho que só
existe para quem vê não entra neste cartão.

**O que a linha NÃO diz, e está escrito no cartão por baixo dela:** não diz se a
maré tira o areal naquela praia, porque o site não sabe o perfil de nenhuma das
995; e as horas são do mar aberto, portanto numa ria ou num estuário a maré
chega mais tarde (o marégrafo de Lagos, num plano restrito, mede metade da
amplitude com 2h16 de atraso).

### A nota manda na cor

Entrou em 23 de Agosto de 2026, a partir de um defeito reportado: um dia
**vermelho com 61** ao lado de um **amarelo com 52**.

A causa era estrutural. A cor decidia-se À PARTE da nota: um veto ou um factor
catastrófico pintavam o dia de vermelho e a nota ficava onde estava — ou
desaparecia. Medido em 13 648 partes-dia (8 praias, Junho a Setembro de 2023 a
2025):

- **38,9 %** não tinham nota nenhuma;
- as bandas **sobrepunham-se**: verde 70–94, amarelo 45–**83**, vermelho 22–**77**;
- **40,4 %** dos vermelhos valiam mais do que o amarelo mais baixo, e **15 %**
  mais do que a mediana dos amarelos.

Agora há uma regra só: **a penalização entra na nota, e a cor sai dos cortes da
nota**. Depois disto: nenhuma parte-dia fica sem nota, as bandas ficam verde
70–94, amarelo 45–69 e vermelho 8–44 **sem sobreposição**, e **0,0 % mudam de
cor** — nenhum veredicto muda, só o número passa a acompanhá-lo.

**Como se mapeia, e porque não é um tecto seco.** Cortar em 44 amontoava
**66,9 %** dos dias vetados no mesmo número, todos a parecer igualmente maus.
Mapeia-se, e a ordem entre eles fica de pé (espalham-se de 8 a 38, com o valor
mais repetido a levar 10,2 %):

| situação | o que acontece à nota |
|---|---|
| sem penalização | fica igual |
| veto, ou factor limitante abaixo de 0,08 | `[0,100]` → `[0,44]` |
| despromovido (limitante < 0,40, ou céu > 60 %) | tecto em **69**, logo abaixo do verde |

A despromoção só acontece a quem era verde, portanto a nota está sempre em
`[70,100]` quando ela se aplica — e o tecto é o degrau imediatamente abaixo do
verde, não o fundo do amarelo. Esteve mapeada em `[70,100]` → `[45,69]` durante
um dia e era absurdo: um dia de soma 71, à beira de ser verde, caía para 46, e
esse 46 tapava depois a média das partes por melhores que elas fossem. Foi
reportado — a tira dizia **47** numa sexta com a manhã a 69 e a tarde a 78.
A despromoção diz «isto não é verde»; não diz «isto é quase vermelho».

**E o dia continua a ser a média das suas partes** — e nunca acima do que a sua
própria penalização deixa. O `min` das duas coisas existe por um caso real: a
chuva soma-se ao longo do dia, portanto o DIA pode estar vetado com as duas
partes sãs, e aí a média delas seria alta de mais para um dia chumbado. O tecto
devolve `null` quando não há penalização nenhuma, e isso não é um detalhe: a
soma do dia é mais severa do que a média das suas partes — é o que a média veio
corrigir — e um tecto cego desfazia essa correcção.

### A penalização conta-se uma vez só

Entrou a 24 de Agosto de 2026, e veio de outro cartão reportado: **69** numa
sexta com a manhã a 69 e a tarde a 78 — a média é 74. O tecto do dia estava a
aplicar-se por cima de partes que **já** o traziam, portanto a mesma chuva era
descontada duas vezes: uma na parte, outra no dia.

Medido em 3 896 dias-praia (8 praias, Junho de 2024 a Setembro de 2025), o dia
tem penalização que NENHUMA das suas partes tem em **1,1 %** dos dias:

| | |
|---|---|
| veto só no dia, com as duas partes sãs | **0,46 %** |
| veto no dia **e** em alguma parte (as partes já o carregam) | 35,81 % |
| despromoção só no dia, partes limpas | **0,67 %** |

Ou seja: em ~99 % das vezes que disparava, o tecto do dia era redundante — e era
ele que afastava a nota da média. Agora **só se aplica quando nenhuma parte
carrega a penalização**. Sobre as 6 previsões × 8 praias: a nota do dia é a
média exacta em **97,9 %** dos dias, contra **62,5 %** antes.

**E as duas espécies não se trocam uma pela outra.** Isto esteve mal durante um
dia: `partesJaPenalizadas` era um booleano só, e desligava **qualquer** tecto do
dia. Mas as penalizações não são da mesma grandeza — a despromoção é leve
(tecto 69, «isto não é verde») e o veto é grave (tecto ≈ 44 % da soma). Uma
parte só despromovida deitava fora o tecto do veto inteiro.

Apanhado na revisão geral, na Praia dos Namorados a 26/08/2026: veto de «chuva a
sério» com 2,88 mm, as duas partes apenas despromovidas, e o dia saía **69
amarelo** em vez de **33 vermelho**. E o espelho do mesmo defeito no Furadouro a
25/08: o tecto grave do dia vinha do ramo `pior_racio < 0,08` e não de um veto,
a manhã já vinha de 56 para 25 pela mesma porta, e o dia descontava-a outra vez —
27 em vez dos 47 da média.

Agora cada objecto diz que espécie de castigo carrega (`penalizacao`: `'grave'`,
`'leve'` ou nada), e o tecto do dia só cede a uma parte que carregue a **mesma
espécie ou pior**. É raro — 0 em 300 dias-praia da previsão real — e é por isso
que a matriz vive em `testar-modelo.js`, com dados sintéticos: testada contra o
`testar-praias.js`, que corre sobre o tempo que faz hoje, a mutação **passava**.

**E a cor passou a sair só da nota, sem excepção.** Ficara um `if (vetos.length)
cor = 'vermelho'` por cima do cálculo, e ele reabria pela porta do lado a
contradição que a secção anterior fechou: um dia com a manhã a 23 e a tarde a 69
dá 46, que é amarelo, e saía pintado de vermelho. Em 198 dias-praia vetados do
arquivo, a média das partes **nunca** chega ao verde — 76,8 % já são vermelhos
por si, 23,2 % ficam amarelos, e é isso que a cor passa a dizer.

**A mesma regra vale para o triângulo.** O veto é do dia e o ecrã fá-lo descer
às partes, para que a marca apareça algures quando a chuva só existe somada. Mas
se uma parte já tem chuva que chegue para se marcar sozinha (≥ 0,5 mm), a outra
deixou de a levar também: dava um triângulo na Chuva de uma tarde **verde com
0,1 mm ao todo**, ao lado de uma manhã vetada. Quando as duas estão abaixo de
0,5 mm a marca desce às duas, que é o caso para que desceu.

## Os cortes

| Pontuação | Cor | Veredicto |
|---|---|---|
| ≥ 70 | Verde | Bom dia de praia |
| 45–69 | Amarelo | Dia assim-assim |
| < 45 | Vermelho | Fica para outro dia |

## O que este modelo NÃO sabe

Escrito aqui para não se fingir que sabe:

- **Não sabe se o mar está seguro para nadar.** As cores aqui são sobre se vale
  a pena ir; as bandeiras da praia são sobre segurança e significam outra
  coisa. A bandeira do nadador-salvador manda sempre.
- **Não sabe a qualidade da água** (análises microbiológicas). Isso é da APA.
- **Não sabe se a praia tem sombra, estacionamento, ou se vai estar cheia.**
- **Não conhece a orientação da costa de cada praia.** Um vento de leste numa
  praia virada a oeste é abrigado; o modelo pontua a velocidade, não o abrigo.
  A direcção só é usada para dizer o nome «nortada» na explicação.
- **A temperatura da água vem de um modelo global**, com uma malha que não
  resolve baías pequenas nem a diferença entre a rebentação e o largo.
- **A partir do 4.º ou 5.º dia a previsão perde fiabilidade.** O site di-lo.
- **Praias de rio** não têm dados de mar nenhuns: nem água, nem ondulação.

## Fontes dos dados

Meteorologia: [Open-Meteo](https://open-meteo.com) (CC BY 4.0), com a **média de
quatro modelos** — ECMWF, ICON, GFS e UKMO. Medido no Furadouro, mesmo ponto e
mesma janela: ECMWF 10,8 · ICON 11,2 · KNMI 12,7 · Météo-France 13,5 · UKMO 13,8
· GFS 16,0 km/h. A dispersão entre modelos é de 1,6× e o modelo por omissão
calhava no extremo baixo. Mar: Open-Meteo Marine.
Lista de praias: [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL)
e [águas balneares identificadas](https://apambiente.pt/agua/aguas-balneares) pela
Agência Portuguesa do Ambiente.
