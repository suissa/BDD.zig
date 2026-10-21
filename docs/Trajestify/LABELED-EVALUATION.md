# Avaliação rotulada do ranking de hipóteses

O avaliador em `packages/trajestify/evaluation/evaluate-hypotheses.mjs` mede a qualidade de listas de hipóteses previamente ordenadas contra rótulos confirmados por investigação. Ele não altera os pesos nem executa correções.

## Executar

Na raiz do repositório, após instalar o Node.js:

```sh
node packages/trajestify/evaluation/evaluate-hypotheses.mjs
node packages/trajestify/evaluation/evaluate-hypotheses.mjs packages/trajestify/evaluation/corpus.synthetic.jsonl --k=5
node packages/trajestify/evaluation/evaluate-hypotheses.mjs packages/trajestify/evaluation/corpus.synthetic.jsonl --k=3 --details
npm test --prefix packages/trajestify
```

Por padrão, o CLI emite apenas métricas agregadas. Com `--details`, inclui um resultado por caso: posição da primeira hipótese relevante, reciprocal rank, hipóteses relevantes recuperadas no top-k, rótulos relevantes perdidos e candidatos incorretos no top-k. Isso permite encontrar casos que a média esconde e distinguir uma hipótese relevante mal ranqueada de uma hipótese relevante ausente da lista.

O formato é JSONL, um caso por linha:
- `caseId`: identificador único do caso;
- `rankedHypothesisIds`: IDs de hipóteses na ordem produzida pelo ranking;
- `relevantHypothesisIds`: conjunto de hipóteses confirmadas/relevantes, rotuladas por revisão;
- campos adicionais, como notas e origem, são preservados no corpus, mas ignorados pelas métricas.

## Métricas

- **MRR**: média do inverso da posição da primeira hipótese relevante por caso. Casos sem acerto contribuem zero.
- **Recall@k**: hipóteses relevantes encontradas entre as primeiras k, dividido pelo total de hipóteses relevantes rotuladas no corpus.
- **Precision@k**: hipóteses relevantes encontradas nas primeiras k, dividido pelo número total de posições efetivamente avaliadas nas primeiras k.
- **FalsePositiveRate@k**: hipóteses não relevantes nas primeiras k dividido pelo número total de posições avaliadas nas primeiras k. Neste relatório, é uma taxa operacional de candidatos incorretos no top-k, não a FPR estatística baseada em todos os verdadeiros negativos possíveis.

O relatório inclui contadores para auditar cada proporção. A API `evaluateRanking` também devolve `caseResults`; o CLI omite esses detalhes, a menos que `--details` seja solicitado. O avaliador rejeita corpus vazio, IDs duplicados, listas vazias e rótulos ausentes.

## Limite dos dados atuais

`corpus.synthetic.jsonl` é **inteiramente sintético** e serve apenas para testar a ferramenta. Não representa incidentes reais, não calibra os pesos e não deve ser usado para afirmar desempenho do ranking. Para avaliação empírica, cada caso deve registrar a saída real do ranking e rótulos revisados independentemente; separar treino e avaliação por projeto ou período reduz vazamento. Versões do algoritmo devem ser comparadas no mesmo corpus rotulado, sem alterar os rótulos para favorecer um ranking.
