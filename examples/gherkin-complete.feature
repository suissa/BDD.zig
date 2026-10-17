Feature: Cobertura das keywords Gherkin

  Background:
    Given saldo = 100
    And limite = 50
    But audit = 0

  Rule: Steps e aliases
    Background:
      Given limite = 25
      And audit = 10

    Example: Example funciona como Scenario
      When transferir(20)
      Then saldo == 80
      But limite == 25
      And audit == 11

  Rule: Asterisk
    Scenario: Asterisk herda a semântica anterior
      Given saldo = 10
      * limite = 0
      When depositar(5)
      * transferir(3)
      Then saldo == 12
      * limite == 0
      And audit == 2

  Rule: Payloads
    Scenario: Doc String e Data Table chegam à action
      When registrar(1)
        """
        {
          "evento": "transferencia"
        }
        """
        | nome | valor |
        | Joao | 30    |
      Then audit == 1

  Rule: Errors
    Scenario: Erro nativo esperado
      Given saldo = 20 and limite = 10
      When transferir(50)
      Then error SaldoInsuficiente

    Scenario: Alias expect error
      Given saldo = 100 and limite = 0
      When transferir(-10)
      Then expect error ValorInvalido
