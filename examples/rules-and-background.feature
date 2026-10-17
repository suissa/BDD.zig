Feature: Transferências

  Background:
    Given saldo = 100
    And limite = 50

  Rule: Transferência normal

    Background:
      And audit = 10

    Scenario: Transferir dentro do limite
      When transferir(20)
      Then saldo == 80
      And limite == 50
      But audit == 11

  Rule: Depósito

    Example: Depositar
      Given saldo = 40 and limite = 0
      When depositar 10
      Then saldo expect 50
      And audit == 1
