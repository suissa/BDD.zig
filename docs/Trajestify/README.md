# Trajestify

**Trajectory + Testify** — uma DSL de testes executáveis cujo resultado principal não é apenas PASS/FAIL: cada execução produz um **Trajectory Artifact** com os passos percorridos, estados observados, relações causais, evidências e o primeiro ponto de divergência conhecido.

Trajestify nasce dentro de `BDD.zig`, mas seu contrato semântico não pertence a Zig. Zig é uma implementação do runner; adapters futuros podem executar a mesma Intent em TypeScript/Node, browsers, serviços HTTP ou outras linguagens. O objetivo da biblioteca TypeScript é oferecer uma experiência familiar a CucumberJS, mantendo a semântica de Intent, Trajectory e Evidence como núcleo próprio.

> Status: esta é a especificação inicial v0.1 e um protótipo TypeScript independente. O parser DSL agora compila para uma IR semântica e pode ser ligado ao runtime TypeScript por bindings explícitos. A integração com contextos de execução nativos do BDD.zig continua pendente.

## 1. Princípios

1. **Intent-first:** toda execução começa por uma intenção identificada.
2. **Trajectory-first:** cada etapa executada gera um evento estruturado.
3. **Evidence over verdict:** PASS/FAIL é um resumo; a trajetória e suas evidências são a saída diagnóstica.
4. **First divergence:** a primeira divergência observável é apontada sem alegar automaticamente que ela é a causa raiz.
5. **Continue diagnostics:** por padrão, após uma divergência, o runner pode continuar passos independentes/seguros para preservar o contexto completo. Dependências bloqueadas devem ser marcadas como `blocked`, não executadas cegamente.
6. **Language-neutral semantics:** a DSL compila para uma representação intermediária estável (IR). Cada linguagem fornece um adapter para invocar seu código.
7. **Reproducibility:** artefatos têm schema versionado, IDs de execução/evento e referências causais.
8. **Safety and privacy:** segredos e payloads sensíveis não devem ser copiados para artefatos sem política explícita de redação.

## 2. Fluxo arquitetural

```text
.traj source
   -> lexer/parser
   -> Trajestify AST
   -> semantic validation
   -> language-neutral Intent/Trajectory IR
   -> runtime adapter (Zig / TypeScript / browser / HTTP / ...)
   -> execution events + observations
   -> divergence analysis
   -> Trajectory Artifact (JSON)
   -> Agent / CodeHealer / replay / regression corpus
```

A semântica deve ser independente da linguagem de implementação. Um adapter implementa resolução de ações, leitura de estado, invocação e coleta de evidências. O runtime comum controla IDs, sequência, causalidade, expectativas, divergências e serialização.

## 3. Arquivo de exemplo

Exemplo ilustrativo para a Intent de compra de produto. A DSL descreve uma cadeia de entidades de domínio; ela não exige que essas entidades sejam classes de uma linguagem específica.

```trajest
Trajestify: Buy product
Version: 1

Intent: buy_product
Actor: Customer

Trajectory: purchase_product
Given: Customer is active
When: Customer requests Product quantity=2
Then: Sales.order.status == "created"
And: Financial.transaction.status == "recorded"
And: Stock.quantity == 8
And: Delivery.status == "scheduled"

Invariant: Stock.quantity == Stock.initial_quantity - Intent.quantity
Trace: full
OnDivergence: continue
Evidence: inputs, outputs, state, errors, causal_links
```

O exemplo assume estoque inicial 10 e quantidade 2. Em uma execução com defeito, o estoque observado pode ser 9. O artefato deve preservar Customer → Sales → Financial → Stock → Delivery, marcar Stock como primeira divergência e registrar se Delivery executou, foi bloqueada ou foi omitida conforme as dependências declaradas.

A expressão `Stock.quantity == 8` é uma expressão semântica, não código JavaScript a ser executado com `eval`. A implementação deve compilar expressões para AST e avaliá-las com um interpretador seguro ou resolver a expectativa por um adapter tipado.

## 4. Palavras reservadas

Palavras-chave são sensíveis a maiúsculas/minúsculas. A forma canônica nesta versão é a grafia exata abaixo. Palavras reservadas não podem ser reutilizadas como identificadores de entidade, campo ou nome de Intent sem escape (escape ainda não faz parte de v0.1).

| Palavra | Obrigatória? | Significado |
|---|---|---|
| `Trajestify:` | Sim, uma vez | Cabeçalho e nome legível do documento. |
| `Version:` | Sim, uma vez | Versão da gramática do documento. Nesta versão, `1`. |
| `Intent:` | Sim, uma vez | Identificador estável do resultado pretendido; snake_case recomendado. |
| `Actor:` | Não | Ator que inicia a ação, por exemplo Customer ou Agent. |
| `Trajectory:` | Sim, uma vez | Identificador/nome da trajetória que será executada. |
| `Given:` | Pelo menos uma cláusula de contexto | Pré-condição, estado inicial ou dado de entrada. |
| `When:` | Pelo menos uma ação | Ação que o adapter deve executar. |
| `Then:` | Pelo menos uma expectativa | Asserção observável que pode produzir divergência. |
| `And:` | Não | Acrescenta uma cláusula ao tipo semântico da cláusula anterior (Given/When/Then). Não muda seu tipo. |
| `Invariant:` | Não | Propriedade que deve permanecer verdadeira durante ou após a execução. |
| `Trace:` | Não | Política de captura: `full` exige registrar todas as etapas observadas. |
| `OnDivergence:` | Não | Política diagnóstica. `continue` continua etapas seguras; `stop` interrompe após a divergência. |
| `Evidence:` | Não | Categorias de evidência solicitadas. |
| `#` | Não | Inicia comentário até o fim da linha. |

### IDs estáveis de cláusula\n\n`Given`, `When`, `Then` e `And` aceitam um ID opcional entre colchetes antes dos dois-pontos, por exemplo `When [purchase-requested]: Customer buys Product quantity=2`. O ID deve começar com letra e conter apenas letras, números, `_` ou `-`; deve ser único no documento. O compilador preserva esse ID no IR e o runtime usa-o para resolver bindings. Se omitido, o parser gera `clause-1`, `clause-2` etc.; esses IDs posicionais são convenientes para protótipos, mas podem mudar quando passos forem inseridos. `And [id]: ...` mantém o tipo semântico da cláusula anterior.\n\n### Palavras contextuais / valores reservados

- Tipos de cláusula: `Given`, `When`, `Then`, `And`.
- Modos de trace: `full`, `minimal`.
- Políticas: `continue`, `stop`.
- Categorias iniciais de evidência: `inputs`, `outputs`, `state`, `errors`, `causal_links`, `timing`, `logs`, `attachments`.
- Operadores de expressão propostos: `==`, `!=`, `>`, `>=`, `<`, `<=`, `and`, `or`, `not`, parênteses e literais string/número/boolean/null.

Os nomes de entidades e campos — `Customer`, `Sales.order.status`, `Stock.quantity` — são identificadores de domínio, não palavras reservadas. Sua resolução é responsabilidade do adapter e do registro de schemas.

## 5. Regras gramaticais iniciais

Gramática compacta aproximada (EBNF; a validação semântica acrescenta restrições):

```ebnf
document      = header, version, intent, [actor], trajectory, clause+, {metadata} ;
header        = "Trajestify:", text ;
version       = "Version:", integer ;
intent        = "Intent:", identifier ;
actor         = "Actor:", identifier ;
trajectory    = "Trajectory:", identifier ;
clause        = given | when | then | and ;
given         = "Given:", expression ;
when          = "When:", expression ;
then          = "Then:", expression ;
and           = "And:", expression ;
metadata      = invariant | trace | onDivergence | evidence ;
invariant     = "Invariant:", expression ;
trace         = "Trace:", ("full" | "minimal") ;
onDivergence  = "OnDivergence:", ("continue" | "stop") ;
evidence      = "Evidence:", identifier, {",", identifier} ;
identifier    = letter, {letter | digit | "_" | "-" | "."} ;
```

A gramática acima é normativa apenas para a intenção da v0.1; o parser pode rejeitar construções ainda não suportadas. Linhas vazias e comentários são ignorados. Um arquivo inválido deve produzir diagnóstico com arquivo, linha, coluna e motivo.

## 6. Schemas

### 6.1 Trajestify Document (conceitual)

| Campo | Tipo | Obrigatório | Restrições |
|---|---|---|---|
| `schemaVersion` | integer | Sim | Versão do schema do parser/AST; distinta da versão escrita no documento. |
| `name` | string | Sim | Derivado de `Trajestify:`; não vazio. |
| `version` | integer | Sim | `1` nesta gramática. |
| `intent.id` | string | Sim | Identificador estável, não vazio. |
| `actor` | string/null | Não | Identificador de ator. |
| `trajectory.id` | string | Sim | Identificador estável. |
| `clauses` | Clause[] | Sim | Pelo menos uma Given, When e Then; preserva a ordem de origem. |
| `invariants` | Expression[] | Não | Expressões verificáveis. |
| `trace` | `full` / `minimal` | Não | Padrão `full` para o runner diagnóstico. |
| `onDivergence` | `continue` / `stop` | Não | Padrão `continue`, sujeito a segurança/dependências. |
| `evidence` | EvidenceKind[] | Não | Lista enumerada e validada. |
| `source` | SourceLocation | Sim no AST | Caminho e posição de cada nó para diagnóstico de sintaxe. |

### 6.2 Clause

```ts
type ClauseKind = "given" | "when" | "then";
interface Clause {
  kind: ClauseKind;
  expression: Expression;
  source: SourceLocation;
  id: string;
}
```

`And:` é normalizado para o `kind` da cláusula anterior. Não pode aparecer antes de uma cláusula base. `Given` define/prepara contexto, `When` executa uma ação, `Then` verifica uma expectativa. A execução deve manter separadas a avaliação de expressões e a invocação de ações.

### 6.3 Expression / Value

A expressão é representada como AST tipada, nunca avaliada com `eval`/Function. Valores permitidos na v0.1: string, número finito, boolean e null; referências de campo e operadores explicitamente permitidos. Chamada arbitrária de função, acesso a protótipos, imports e execução de código são proibidos no parser.

```ts
type Scalar = string | number | boolean | null;
type Expression =
  | { kind: "literal"; value: Scalar }
  | { kind: "reference"; path: string[] }
  | { kind: "unary"; operator: "not"; operand: Expression }
  | { kind: "binary"; operator: "==" | "!=" | ">" | ">=" | "<" | "<=" | "and" | "or"; left: Expression; right: Expression };
```

Comparações de tipos incompatíveis devem produzir erro semântico explícito, não coerção silenciosa. A semântica de igualdade e comparação deve ser documentada e igual em todos os adapters.

### 6.4 Trajectory Artifact (JSON)

O artifact é a saída durável do runner. O exemplo de forma abaixo é esquemático; o schema deve ser versionado antes de ser tratado como contrato estável:

```json
{
  "schemaVersion": 1,
  "runId": "run-...",
  "document": "buy-product",
  "intent": { "id": "buy_product", "status": "diverged" },
  "trajectory": { "id": "purchase_product", "status": "diverged" },
  "startedAt": "2026-01-01T00:00:00.000Z",
  "finishedAt": "2026-01-01T00:00:00.100Z",
  "steps": [
    {
      "eventId": "evt-3",
      "sequence": 3,
      "clauseId": "clause-stock",
      "kind": "then",
      "entity": "Stock",
      "action": "assert",
      "status": "diverged",
      "expected": 8,
      "observed": 9,
      "causedBy": ["evt-2"],
      "source": { "line": 12, "column": 1 }
    }
  ],
  "firstDivergence": {
    "eventId": "evt-3",
    "sequence": 3,
    "category": "assertion_mismatch",
    "expected": 8,
    "observed": 9
  },
  "summary": { "passed": 3, "failed": 1, "blocked": 0, "skipped": 0 }
}
```

### 6.5 Trajectory event schema

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `eventId` | string | Sim | ID único no run. |
| `sequence` | integer | Sim | Ordem total de registro, começando em zero ou um conforme versão do schema; uma versão deve escolher apenas uma convenção. |
| `clauseId` | string | Sim | Cláusula da DSL que originou o evento. |
| `kind` | enum | Sim | `given`, `when`, `then`, `invariant`, `system`. |
| `status` | enum | Sim | `passed`, `failed`, `diverged`, `blocked`, `skipped`, `error`. |
| `expected` | JSON value/null | Não | Resultado ou condição esperada. |
| `observed` | JSON value/null | Não | Resultado real, com redação se necessário. |
| `startedAt` / `finishedAt` | timestamp/null | Não | Tempo observado. |
| `durationMs` | number/null | Não | Duração medida por relógio monotônico. |
| `causedBy` | string[] | Sim | IDs de eventos antecedentes causais conhecidos; lista vazia se desconhecidos/sem predecessor. |
| `entity` | string/null | Não | Entidade de domínio relacionada. |
| `error` | ErrorEvidence/null | Não | Classe, mensagem sanitizada, stack opcional e código. |
| `source` | SourceLocation | Sim | Arquivo, linha e coluna da DSL. |
| `evidenceRefs` | string[] | Sim | IDs/URIs de evidências adicionais. |

### 6.6 Entity / adapter schema

O schema de domínio não é imposto globalmente pela DSL. Cada adapter declara schemas de entidades e capacidades:

```ts
interface EntitySchema {
  name: string;
  fields: Record<string, { type: "string" | "number" | "boolean" | "object"; required?: boolean }>;
}
interface RuntimeAdapter {
  resolve(path: string[]): Promise<unknown>;
  invoke(action: string, input?: unknown): Promise<unknown>;
  snapshot?(entity: string): Promise<unknown>;
  capabilities: string[];
}
```

O runner não deve presumir que `Stock` é uma classe. É um nome semântico resolvido por adapter para um contexto Zig, objeto TypeScript, endpoint HTTP, browser fixture ou outro runtime.

## 7. Determinação e divergência

- `passed`: a cláusula foi executada e a condição observável foi satisfeita.
- `failed`: a execução falhou por erro de infraestrutura/ação, sem que isso necessariamente seja uma divergência de valor.
- `diverged`: valor/estado observado contradiz a expectativa.
- `blocked`: não executada porque uma dependência necessária falhou.
- `skipped`: intencionalmente omitida por política.
- `error`: erro do runner/parser/adapter.

`firstDivergence` é a primeira divergência segundo a ordem registrada, não prova da causa raiz. Em execução concorrente, ordem temporal não implica causalidade. Causal links precisam vir do runtime ou ser marcados como inferidos.

`OnDivergence: continue` não autoriza efeitos inseguros depois de falha. O executor deve respeitar dependências, idempotência e política de segurança; etapas dependentes ficam `blocked` quando não podem continuar com segurança.

## 8. TypeScript API: proposta de uso

O objetivo é uma API familiar a CucumberJS sem prender o núcleo à sintaxe Cucumber:

```ts
import { defineIntent, Given, When, Then, And, expectValue, runTrajectory } from "@trajestify/core";

const purchase = defineIntent("buy_product", "Buy product", [
  Given("customer", "Customer is active", async ctx => ctx.customer.active),
  When("sales", "Persist sale", async ctx => ctx.buy(2)),
  And("when", "financial", "Record transaction", async ctx => ctx.recordFinancial()),
  Then("stock", "Stock is 8", async ctx => expectValue(8, ctx.stock)),
  And("then", "delivery", "Schedule delivery", async ctx => ctx.scheduleDelivery()),
]);

const artifact = await runTrajectory(purchase, purchaseContext);
```

A API é uma direção proposta; nomes e assinatura podem evoluir antes de publicação. A implementação deve permitir registrar step definitions, executar hooks, produzir artifact estruturado e disponibilizar o artifact mesmo quando uma etapa falhar. Não se deve copiar a API de CucumberJS integralmente nem tornar Cucumber uma dependência obrigatória.

## 9. Organização de pacotes planejada

```text
packages/trajestify/
  src/
    ast.ts             # AST e schemas TypeScript
    parser.ts          # parser .traj
    expression.ts      # lexer/parser/evaluator seguro
    runner.ts          # runtime de trajetória
    artifact.ts        # schema e serialização do artifact
    adapter.ts         # interface language-neutral
    index.ts           # API pública
  tests/
    parser.test.ts
    runner.test.ts
    divergence.test.ts
```

Pacote inicial sugerido: `@trajestify/core`. A publicação npm não está configurada ainda.

## 10. CLI e CI

Comandos desejados (não implementados nesta versão):

```sh
trajestify validate examples/buy-product.traj
trajestify run examples/buy-product.traj --adapter ts
trajestify replay artifacts/trajectory.json
```

CI deve: validar a DSL; testar o cenário correto; executar um fixture com divergência Stock (esperado 8, observado 9); verificar que `firstDivergence` aponta Stock; verificar que Delivery é preservado ou marcado blocked conforme política; salvar o JSON como artifact. Nenhum teste deve atingir sistemas externos por padrão.

## 11. Relação com BDD.zig

BDD.zig fornece a experiência Zig e o trabalho prévio sobre semântica de tipos/operadores. Trajestify deve reutilizar os princípios de AST, semântica explícita e verificação diferencial, mas não depender de sintaxe interna exclusiva do Zig. O objetivo futuro é que Zig seja apenas um adapter entre vários.

O DSL inicial deste diretório não substitui Gherkin nem a implementação existente. Ele adiciona uma camada orientada a Intent + Trajectory + Evidence, projetada para diagnóstico e correção assistida por Agents.

## 12. Fora de escopo nesta versão

- Parser completo de expressões e schema JSON Schema publicado.
- Integração automática entre o arquivo `.traj` e o runner Zig.
- Adapter HTTP/browser/DB real.
- Execução paralela distribuída e causalidade entre processos.
- Assinatura criptográfica dos artefatos.
- Reprodução automática de todas as fontes externas.
- Compatibilidade estável de schema antes de publicar a primeira versão formal.

Esses limites são intencionais: o primeiro contrato deve ser simples, versionado e verificável antes de expandir a linguagem.


Machine-readable schemas:
- [Normalized DSL document AST](../../packages/trajestify/schemas/trajestify-document.schema.json)
- [Trajectory Artifact JSON](../../packages/trajestify/schemas/trajectory-artifact.schema.json)

The initial TypeScript API uses `Given(id, text, execute)`, `When(id, text, execute)`, and `Then(id, text, execute)`. `expectValue(expected, observed)` preserves both values in a divergence artifact rather than recording only `false`. `And(kind, id, text, execute)` explicitly receives the inherited semantic kind in v0.1. The example above illustrates the intended adapter integration; it is not yet a published npm package.


## 13. Integração DSL → IR → TypeScript runtime

A primeira integração executável está disponível em `packages/trajestify/src/compiler.ts`:

- `parseTrajestify(source)` valida e normaliza o arquivo `.traj`.
- `compileToIR(document)` gera uma representação intermediária sem dependência de Zig ou TypeScript.
- `bindTrajectory(ir, bindings)` associa cada cláusula a uma função fornecida pelo adapter.
- `runTrajectory(intent, context)` executa as funções registradas e produz o Trajectory Artifact.

Exemplo de ligação por ID de cláusula:

```ts
import { parseTrajestify, compileToIR, bindTrajectory, runTrajectory } from "@trajestify/core";

const document = parseTrajestify(source, "buy-product.traj");
const ir = compileToIR(document);
const intent = bindTrajectory(ir, {
  "clause-1": async context => context.customer.active,
  "clause-2": async context => context.stock === 10,
  // Registre explicitamente os demais IDs presentes no IR.
});
const artifact = await runTrajectory(intent, context);
```

Os IDs `clause-1`, `clause-2` são atribuídos pela ordem no arquivo; adapters de produção devem preferir IDs explícitos e estáveis quando essa capacidade for adicionada à gramática. Até lá, também é possível registrar um binding usando o texto exato da expressão. Se qualquer cláusula ou invariante não tiver binding, `bindTrajectory` falha imediatamente com `TrajestifyBindingError`: texto da DSL nunca é executado por `eval`.

Invariantes são convertidos em etapas de runtime do tipo `invariant` e divergências de invariantes geram evidência, sem substituir a primeira divergência anterior. Um teste de integração lê `examples/buy-product.traj`, compila o IR e executa bindings com divergência de estoque (esperado 8, observado 9), verificando que a etapa Delivery continua registrada. O adapter ainda é fornecido manualmente pelo código TypeScript; inferência automática de ações a partir de linguagem natural não faz parte deste contrato.
