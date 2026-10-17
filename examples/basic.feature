Feature: Conta bancária

  Exemplo mínimo de uma especificação executável.

  Scenario: Depositar dinheiro
    Given saldo = 100
    When depositar(50)
    Then saldo == 150
    And audit == 1

  Scenario: Transferir dinheiro
    Given saldo = 100 and limite = 50
    When transferir(30)
    Then saldo == 70
    And limite == 50
    And audit == 1
