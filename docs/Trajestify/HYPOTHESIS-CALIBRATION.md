# Calibração sintética do ranking de hipóteses

Este documento descreve os contratos de regressão usados para calibrar `rankRootCauseHypotheses`. Os pesos atuais são heurísticos e determinísticos; não representam probabilidades nem foram ajustados com um conjunto rotulado de incidentes reais.

## Cenários de regressão

1. **Evidência direta vs. recorrência isolada:** a hipótese derivada da divergência observada deve superar a recorrência histórica isolada.
2. **Recorrência repetida:** adicionar uma execução anterior elegível com a mesma cláusula divergente deve aumentar o suporte da hipótese de recorrência.
3. **Filtro temporal e de identidade:** execuções futuras e execuções de outra trajetória não podem alterar a pontuação da recorrência elegível.
4. **Reprodutibilidade:** permutar a ordem do histórico não deve alterar a ordem final nem os fatores de pontuação.

Esses cenários estão automatizados em `packages/trajestify/tests/hypothesis-calibration.test.mjs` e fazem parte do comando `npm test`.

## Critérios para interpretar os resultados

- A pontuação é uma prioridade para triagem, não uma estimativa de probabilidade.
- A recorrência histórica não deve superar a evidência direta da divergência apenas por estar presente no histórico.
- Só contam para recorrência execuções da mesma trajetória, com outro `runId`, finalizadas antes do início da execução atual e com a mesma cláusula divergente.
- Um teste sintético confirma invariantes do algoritmo; não prova que os pesos são ótimos no mundo real.
- Antes de qualquer calibração estatística, deve ser criado um corpus rotulado de incidentes com causa confirmada, hipóteses concorrentes, falso positivo e falso negativo. O corpus precisa ser separado por projeto/tempo para evitar vazamento entre treino e avaliação.

## Próxima evolução recomendada

Registrar em cada avaliação a hipótese correta confirmada por investigação, calcular métricas de ranking (MRR, Recall@k e taxa de falso positivo) e comparar versões dos pesos no mesmo corpus. Até existir esse conjunto rotulado, não automatizar correções com base apenas no score.
