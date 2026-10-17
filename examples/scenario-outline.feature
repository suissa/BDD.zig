Feature: Transferências parametrizadas

  Scenario Outline: Transferir <valor> a partir de <saldo>
    Given saldo = <saldo> and limite = <limite>
    When transferir(<valor>)
    Then saldo == <saldo_final>
    And audit == 1

    Examples:
      | saldo | limite | valor | saldo_final |
      | 100   | 50     | 30    | 70          |
      | 80    | 20     | 10    | 70          |

  Scenario Template: Depositar <valor>
    Given saldo = <saldo> and limite = 0
    When depositar(<valor>)
    Then saldo == <saldo_final>

    Scenarios:
      | saldo | valor | saldo_final |
      | 60    | 15    | 75          |
      | 1     | 9     | 10          |
