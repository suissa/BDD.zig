# Comparativo de Cobertura Gherkin: Zig Comptime BDD vs Mercado

Este documento apresenta uma análise comparativa da cobertura da especificação **Gherkin** entre o seu projeto **Zig Comptime BDD (Zirkin)** e os 2 frameworks BDD mais populares e relevantes do mercado:

1. **Cucumber** (O padrão ouro oficial da indústria, originalmente em Ruby/Java/JS).
2. **Godog** (A implementação mais madura para linguagens compiladas estaticamente e concorrentes de baixo nível, feita em Golang).

Como não existem frameworks BDD nativos para Zig maduros no momento (sendo o Zig focado em ferramentas de teste built-in sem muita abstração), o seu projeto já desponta como um **pioneiro no ecossistema Zig**.

---

## 1. Suporte a Palavras-chave Primárias (Estruturais)

A especificação oficial do Gherkin define como os documentos devem ser estruturados. 

| Keyword / Feature | Zig Comptime BDD | Cucumber | Godog (Go) | Notas sobre a sua implementação |
| :--- | :---: | :---: | :---: | :--- |
| `Feature` | ✅ | ✅ | ✅ | Implementado com suporte a título único por arquivo. |
| `Rule` | ✅ | ✅ | ✅ | Suporte a regras de negócio agrupadora de cenários. |
| `Background` | ✅ | ✅ | ✅ | Excelente suporte, funcionando tanto no escopo da `Feature` quanto em `Rule`. |
| `Scenario` / `Example` | ✅ | ✅ | ✅ | Cenários padrão e seus aliases funcionam perfeitamente. |
| `Scenario Outline` / `Template` | ✅ | ✅ | ✅ | Geração em comptime das variações baseadas nas tabelas de Examples. |
| `Examples` / `Scenarios` | ✅ | ✅ | ✅ | Passagem de parâmetros `<var>` avaliada dinamicamente e injetada com tipagem. |

**Veredito Estrutural:** O parser suporta **100% da estrutura fundamental** do Gherkin v6+, cobrindo até as adições mais recentes como `Rule` e o alias `Example/Template`.

---

## 2. Suporte aos Steps (Passos)

Os passos são o núcleo da execução do BDD.

| Keyword / Feature | Zig Comptime BDD | Cucumber | Godog (Go) | Notas sobre a sua implementação |
| :--- | :---: | :---: | :---: | :--- |
| `Given`, `When`, `Then` | ✅ | ✅ | ✅ | Mapeado diretamente para binding de struct. |
| `And`, `But` | ✅ | ✅ | ✅ | Herança do contexto semântico anterior funcionando perfeitamente. |
| `*` (Asterisk) | ✅ | ✅ | ✅ | Herda a execução livre, demonstrando parser maduro. |
| Doc Strings (`"""`) | ✅ | ✅ | ✅ | Anexadas ao step anterior e disponibilizadas em `StepPayload.doc_string`. |
| Data Tables (Nos Steps) | ✅ | ✅ | ✅ | Linhas com pipes são anexadas ao step e disponibilizadas em `StepPayload.table`. |
| Comentários (`#`) | ✅ | ✅ | ✅ | Linhas de comentário são corretamente ignoradas. |

**Veredito de Steps:** Excelente para linhas simples, parametrizadas e binding por *pattern-matching* (ex: alocação e expects no Zig). Doc Strings e Data Tables inline agora podem ser consumidos por actions com payload tipado.

---

## 3. Arquitetura e Engenharia de Binding (O Diferencial)

Aqui a comparação de como as abstrações conversam com o código real. 

| Feature | Zig Comptime BDD | Cucumber | Godog (Go) |
| :--- | :---: | :---: | :---: |
| **Tempo de Avaliação do BDD** | **Comptime (Compile-time)** | Runtime | Runtime |
| **Binding dos Steps** | Parsing textual + reflexão comptime | Regex / Cucumber Expressions | Regex / Cucumber Expressions |
| **Uso de Memória** | **Nulo/Zero Overhead** | Alto (Alocação Dinâmica) | Moderado |
| **Tags / Filtros (`@tag`)** | ❌ | ✅ | ✅ |
| **Hooks (`Before`, `After`)** | Abstrato (via reinicialização da `Struct` para cada cenário) | Dinâmico (Global/Tag) | Dinâmico (Contexto) |

> **A grande inovação do seu projeto**
> Enquanto Cucumber e Godog utilizam **Regex ou Cucumber Expressions em tempo de execução** para associar o texto Gherkin à função na linguagem alvo, você criou uma arquitetura onde o `testes.feature` é analisado usando `@embedFile` e a associação (binding) acontece via macros iterativas no **comptime**. 
> 
> Isso significa que um step escrito errado no `.feature` ou apontando para uma action que não existe na struct Zig gera um **ERRO DE COMPILAÇÃO** (`@compileError`), e não um erro de execução ou um aviso de "Step Undefined" durante os testes em CI/CD como ocorre no Cucumber e Godog. Isso traz um grau de segurança inédito para BDD.

---

## 4. O que falta para se tornar o padrão de mercado no Zig?

O suporte atual cobre Doc Strings e Data Tables anexados diretamente a steps. Para ampliar a
compatibilidade com Gherkin e chegar mais perto dos frameworks maduros, ainda seria possível adicionar:

1. **Tags de Execução (`@tag`)**:
   Implementar a capacidade de rodar apenas partes do arquivo em comptime filtrando por tags antes do `parseFeature`.
2. **Hooks (`Before`, `After`)** explícitos para setup e teardown por feature, rule ou cenário.
3. **Expansão de placeholders em Data Tables de Scenario Outline**, além da expansão já suportada no título e nos steps.

### Contrato dos payloads

O parser captura os blocos, mas a action só recebe o payload quando declara a assinatura com três
argumentos:

```zig
pub fn registrar(self: *Conta, valor: i32, payload: StepPayload) !void
```

`payload.doc_string` contém o texto multilinear sem a indentação estrutural do Gherkin e
`payload.table` contém as linhas, cada uma com suas células. Actions existentes com dois
argumentos continuam recebendo apenas `self` e o argumento numérico.

O cenário `Doc String e Data Table são enviados para a action`, em `testes.feature`, valida
esses dois caminhos em conjunto.

### Conclusão

Sua cobertura estrutural (Rules, Backgrounds, Scenario Outlines) já empata com as soluções maduras do mercado. Contudo, em termos de engenharia de runtime/comptime, você criou algo muito singular: um **BDD Framework Compile-Safe** (Tipado em Tempo de Compilação), o que faz total sentido para a filosofia explícita e livre de custos escondidos da linguagem Zig.
