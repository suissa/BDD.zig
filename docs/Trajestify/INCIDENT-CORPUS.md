# Trajestify Incident Corpus

O Incident Corpus é a camada de avaliação em que uma execução de Trajestify deixa de ser apenas um ranking heurístico e passa a ter um resultado investigativo rotulado.

## Objetivo

Cada caso associa uma trajetória executada, o ranking produzido pelo diagnóstico e a causa-raiz confirmada por evidência independente. O corpus permite medir se o ranking coloca a causa confirmada entre as primeiras hipóteses.

O corpus desta etapa é **sintético**. Ele valida o formato e o pipeline de avaliação; não representa precisão em produção.

## Caso

Campos obrigatórios:

- `caseId`: identificador único do incidente.
- `trajectoryId`: trajetória que produziu o incidente.
- `runId`: execução específica.
- `outcome`: `diverged`, `failed` ou `error`.
- `rankedHypothesisIds`: hipóteses na ordem produzida pelo Trajestify.
- `confirmedRootCause`: resultado da investigação posterior.

`confirmedRootCause.hypothesisId` precisa existir no ranking para que o caso seja recuperável pelo avaliador. `eventId` liga a causa confirmada ao evento concreto da trajetória. `evidenceIds` liga a confirmação às evidências utilizadas pela investigação.

## Regra de rotulagem

`confirmed` significa que uma investigação independente encontrou evidência suficiente para aceitar a hipótese como causa do incidente. `rejected` representa uma hipótese que foi investigada e descartada. O corpus deve preferir registrar apenas a causa confirmada como ground truth positivo; hipóteses rejeitadas podem ser adicionadas posteriormente para avaliações mais ricas.

Não se deve transformar automaticamente `firstDivergence` em `confirmedRootCause`: uma divergência é um sinal observável, enquanto a causa-raiz exige confirmação.

## Formato

O corpus usa JSONL para permitir append incremental e processamento streaming. O schema está em `packages/trajestify/evaluation/incident-corpus.schema.json`.

## Próximo uso

O avaliador deve converter cada caso rotulado para o formato de avaliação existente, usando `confirmedRootCause.hypothesisId` como relevante. Depois pode calcular MRR, Recall@K, Precision@K e falsos positivos.

A evolução seguinte é substituir os fixtures sintéticos por incidentes reais revisados, preservando o mesmo schema e adicionando metadados de revisão, versão do ranking e evidências sanitizadas.
