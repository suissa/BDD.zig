# Comparativo de Cobertura Gherkin: BDD Gherkin.zig vs Mercado

Este documento apresenta uma análise comparativa da cobertura da especificação **Gherkin** entre o seu projeto **BDD Gherkin.zig (Zirkin)** e os 2 frameworks BDD mais populares e relevantes do mercado:

1. **Cucumber** (O padrão ouro oficial da indústria, originalmente em Ruby/Java/JS).
2. **Godog** (A implementação mais madura para linguagens compiladas estaticamente e concorrentes de baixo nível, feita em Golang).

Como não existem frameworks BDD nativos para Zig maduros no momento (sendo o Zig focado em ferramentas de teste built-in sem muita abstração), o seu projeto já desponta como um **pioneiro no ecossistema Zig**.

---

## 1. Suporte a Palavras-chave Primárias (Estruturais)

A especificação oficial do Gherkin define como os documentos devem ser estruturados. 

| Keyword / Feature | BDD Gherkin.zig | Cucumber | Godog (Go) | Notas sobre a sua implementação |
| :--- | :---: | :---: | :---: | :--- |
| `Feature` | ✅ | ✅ | ✅ | Implementado com suporte a título único por arquivo. |
| `Rule` | ✅ | ✅ | ✅ | Suporte a regras de negócio agrupadora de cenários. |
| `Background` | ✅ | ✅ | ✅ | Excelente suporte, funcionando tanto no escopo da `Feature` quanto em `Rule`. |
| `Scenario` / `Example` | ✅ | ✅ | ✅ | Cenários padrão e seus aliases funcionam perfeitamente. |
| `Scenario Outline` / `Template` | ✅ | ✅ | ✅ | Geração em comptime das variações baseadas nas tabelas de Examples. |
| `Examples` / `Scenarios` | ✅ | ✅ | ✅ | Passagem de parâmetros `<var>` avaliada dinamicamente e injetada com tipagem. |

**Veredito Estrutural:** O seu parser suporta **100% da estrutura fundamental** do Gherkin v6+, cobrindo até as adições mais recentes como `Rule` e o alias `Example/Template`.

---

## 2. Suporte aos Steps (Passos)

Os passos são o núcleo da execução do BDD.

| Keyword / Feature | BDD Gherkin.zig | Cucumber | Godog (Go) | Notas sobre a sua implementação |
| :--- | :---: | :---: | :---: | :--- |
| `Given`, `When`, `Then` | ✅ | ✅ | ✅ | Mapeado diretamente para binding de struct. |
| `And`, `But` | ✅ | ✅ | ✅ | Herança do contexto semântico anterior funcionando perfeitamente. |
| `*` (Asterisk) | ✅ | ✅ | ✅ | Herda a execução livre, demonstrando parser maduro. |
| Doc Strings (`"""`) | ❌ | ✅ | ✅ | Textos longos formatados não são suportados nativamente pelo seu parser atual. |
| Data Tables (Nos Steps) | ❌ | ✅ | ✅ | Tabelas (além das de `Examples`) passadas como parâmetro em steps específicos não estão implementadas. |
| Comentários (`#`) | ✅ | ✅ | ✅ | Linhas de comentário são corretamente ignoradas. |

**Veredito de Steps:** Excelente para linhas simples, parametrizadas e binding por *pattern-matching* (ex: alocação e expects no Zig). Falta apenas suporte a *Data Tables inline* e *Doc Strings* para cobrir a especificação completa de payloads complexos.

---

## 3. Arquitetura e Engenharia de Binding (O Diferencial)

Aqui a comparação de como as abstrações conversam com o código real. 

| Feature | BDD Gherkin.zig | Cucumber | Godog (Go) |
| :--- | :---: | :---: | :---: |
| **Tempo de Avaliação do BDD** | **Comptime (Compile-time)** | Runtime | Runtime |
| **Binding dos Steps** | Reflection Simples (AST parser) | Regex / Cucumber Expressions | Regex / Cucumber Expressions |
| **Uso de Memória** | **Nulo/Zero Overhead** | Alto (Alocação Dinâmica) | Moderado |
| **Tags / Filtros (`@tag`)** | ❌ | ✅ | ✅ |
| **Hooks (`Before`, `After`)** | Abstrato (via reinicialização da `Struct` para cada cenário) | Dinâmico (Global/Tag) | Dinâmico (Contexto) |

> **A grande inovação do seu projeto**
> Enquanto Cucumber e Godog utilizam **Regex ou Cucumber Expressions em tempo de execução** para associar o texto Gherkin à função na linguagem alvo, você criou uma arquitetura onde o `testes.feature` é analisado usando `@embedFile` e a associação (binding) acontece via macros iterativas no **comptime**. 
> 
> Isso significa que um step escrito errado no `.feature` ou apontando para uma action que não existe na struct Zig gera um **ERRO DE COMPILAÇÃO** (`@compileError`), e não um erro de execução ou um aviso de "Step Undefined" durante os testes em CI/CD como ocorre no Cucumber e Godog. Isso traz um grau de segurança inédito para BDD.

---

## 4. O que falta para se tornar o padrão de mercado no Zig?

Caso você queira escalar este projeto para um repositório open-source definitivo para a comunidade Zig, você precisaria adicionar:

1. **Suporte a Data Tables Inline nos Steps**:
   ```gherkin
   Given os seguintes usuários existem:
     | nome | saldo | limite |
     | Joao | 100   | 50     |
     | Ana  | 0     | 200    |
   ```
2. **Tags de Execução (`@tag`)**:
   Implementar a capacidade de rodar apenas partes do arquivo em comptime filtrando por tags antes do `parseFeature`.
3. **Strings Multilinhas (Doc Strings)** para validações de payloads grandes (muito útil em testes de APIs REST).

### Conclusão

Sua cobertura estrutural (Rules, Backgrounds, Scenario Outlines) já empata com as soluções maduras do mercado. Contudo, em termos de engenharia de runtime/comptime, você criou algo muito singular: um **BDD Framework Compile-Safe** (Tipado em Tempo de Compilação), o que faz total sentido para a filosofia explícita e livre de custos escondidos da linguagem Zig.
