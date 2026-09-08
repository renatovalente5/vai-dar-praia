# Praiómetro

Uma pergunta, uma resposta: **vale a pena ir à praia hoje?**

Escolhe qualquer praia de Portugal e vês logo, sem saber nada de meteorologia,
se hoje e nos próximos cinco dias vale a pena ir. Verde é bom, amarelo é
assim-assim, vermelho fica para outro dia. Se quiseres perceber porquê, abres o
detalhe e vês cada número traduzido para português corrente.

**→ [praiometro.pt](https://praiometro.pt)**

## Porque é que isto não é mais um site de meteorologia

A maior parte das apps de tempo dizem-te *20 km/h de vento* e *18 °C de água*, e
deixam-te a ti o trabalho de decidir o que isso significa. Este diz-te o que
isso significa.

Duas decisões dão-lhe a diferença:

**A escala da água é portuguesa.** O Atlântico continental anda nos 17–20 °C em
Agosto, por causa do afloramento costeiro. Um índice calibrado para o
Mediterrâneo — que pede 24 °C para dar nota positiva — marcaria a costa
portuguesa inteira a vermelho todos os dias do ano. Aqui, 19 °C é o Verão
normal, não é um dia mau.

**O vento pesa a sério.** Em Portugal é a **nortada** que estraga mais dias de
praia, e o índice académico de que este parte dá ao vento apenas 10%. Aqui vale
26 pontos em 100, com o degrau grande exactamente onde a areia começa a
levantar.

## Como funciona

Não há servidor nenhum: é um site estático, e todos os pedidos são feitos pelo
browser de quem visita.

- **Previsão:** [Open-Meteo](https://open-meteo.com) — gratuita, sem chave, CORS
  aberto. Uma chamada à API de meteorologia e outra à API marinha.
- **Praias:** 1239 sítios de banho portugueses — 879 de mar e 360 de água
  interior (rios, albufeiras, lagoas, piscinas naturais). Vêm de DUAS fontes,
  e a divisão de trabalho entre elas é deliberada: o
  [OpenStreetMap](https://www.openstreetmap.org/copyright) diz **onde estão e
  como se chamam**; as [águas balneares identificadas pela
  APA](https://apambiente.pt/agua/aguas-balneares) dizem **quais existem**.
  Verificar a lista só contra o OSM era perguntar à cópia se concordava com o
  original de onde saiu — e escondeu durante meses 131 águas balneares
  oficiais, entre elas a ilha de Santa Maria inteira. 208 praias trazem também
  o nome oficial, que muitas vezes não é o do OSM: quem escreve «Esmoriz»
  encontra a que o OSM chama «Praia Velha».
  A separação entre mar e água interior é medida, não adivinhada: pergunta-se
  à API marinha quais os pontos que têm ondulação, com a categoria da APA a
  mandar quando ela diz que a água é doce.
- **Modelo:** [MODELO.md](MODELO.md) — a especificação completa, com a origem de
  cada limiar. Vale a pena ler se quiseres discordar com fundamento.

## O que isto não é

**Não diz se o mar está seguro para nadar.** As cores aqui são sobre se vale a
pena ir; as bandeiras da praia significam outra coisa — verde é banho permitido,
amarela é só pé na água, vermelha é proibido entrar. A bandeira do
nadador-salvador manda sempre.

Também não sabe da qualidade da água, nem se há sombra, nem se vai estar cheia.

## Correr localmente

```bash
python3 -m http.server 4180
```

E abrir <http://localhost:4180>. Não há passo de compilação.

Os testes do modelo correm em Node, sem browser:

```bash
node -e "global.window=global; require('./assets/js/modelo.js'); require('./_source/testar-modelo.js');"
```

## Licenças

Código sob licença MIT. Dados de previsão da Open-Meteo (CC BY 4.0), lista de
praias do OpenStreetMap (ODbL) e águas balneares identificadas pela Agência
Portuguesa do Ambiente (informação administrativa pública, reutilizável ao
abrigo do art. 19.º da Lei 26/2016) — a atribuição está no rodapé do site.
