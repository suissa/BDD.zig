const std = @import("std");
const ast = @import("semantic_ast.zig");

/// Binary JavaScript operators whose primitive interaction is part of the semantic contract.
pub const Operator = enum {
    add,
    subtract,
    multiply,
    divide,
    remainder,
    exponent,
    strict_equal,
    loose_equal,
    less_than,
    less_equal,
    greater_than,
    greater_equal,
    logical_and,
    logical_or,
    bitwise_and,
};

pub const ResultKind = enum {
    number,
    bigint,
    string,
    boolean,
    operand,
    number_or_nan,
    type_error,
};

pub const Rule = struct {
    left: ast.Primitive,
    right: ast.Primitive,
    operator: Operator,
    result: ResultKind,
    outcome: ast.Outcome,
    rationale: []const u8,
};

pub const operators = [_]Operator{
    .add, .subtract, .multiply, .divide, .remainder, .exponent,
    .strict_equal, .loose_equal, .less_than, .less_equal,
    .greater_than, .greater_equal, .logical_and, .logical_or, .bitwise_and,
};

fn isBigInt(p: ast.Primitive) bool {
    return p == .bigint;
}

fn isSymbol(p: ast.Primitive) bool {
    return p == .symbol;
}

fn isString(p: ast.Primitive) bool {
    return p == .string;
}

fn numericResult(left: ast.Primitive, right: ast.Primitive) ResultKind {
    if (isBigInt(left) and isBigInt(right)) return .bigint;
    return .number_or_nan;
}

/// Classifies the semantics of a binary operator over primitive type pairs.
/// This is a rule classifier, not a JavaScript interpreter: it describes result
/// categories and failure modes, while concrete values are exercised by generated tests.
pub fn classify(left: ast.Primitive, right: ast.Primitive, operator: Operator) Rule {
    var rule = Rule{
        .left = left,
        .right = right,
        .operator = operator,
        .result = .number_or_nan,
        .outcome = .runtime_value,
        .rationale = "ECMAScript primitive operator semantics",
    };

    switch (operator) {
        .strict_equal => {
            rule.result = .boolean;
            rule.rationale = "Strict equality never coerces primitive operands";
        },
        .loose_equal => {
            rule.result = .boolean;
            rule.rationale = "Abstract equality applies ECMAScript equality rules";
        },
        .less_than, .less_equal, .greater_than, .greater_equal => {
            if (isSymbol(left) or isSymbol(right)) {
                rule.result = .type_error;
                rule.outcome = .type_error;
                rule.rationale = "Relational comparison of a Symbol primitive throws TypeError";
            } else {
                rule.result = .boolean;
                rule.rationale = "Relational comparison returns boolean; NaN comparisons are false";
            }
        },
        .logical_and, .logical_or => {
            rule.result = .operand;
            rule.rationale = "Logical operators return one of their operands after truthiness testing";
        },
        .add => {
            if (isSymbol(left) or isSymbol(right)) {
                rule.result = .type_error;
                rule.outcome = .type_error;
                rule.rationale = "Symbol cannot be converted to a primitive string/number for addition";
            } else if (isString(left) or isString(right)) {
                rule.result = .string;
                rule.rationale = "Addition concatenates when either ToPrimitive result is a string";
            } else if (isBigInt(left) and isBigInt(right)) {
                rule.result = .bigint;
                rule.rationale = "BigInt plus BigInt returns BigInt";
            } else if (isBigInt(left) or isBigInt(right)) {
                rule.result = .type_error;
                rule.outcome = .type_error;
                rule.rationale = "Addition rejects mixed BigInt and Number numeric primitives";
            } else {
                rule.result = .number_or_nan;
                rule.rationale = "Numeric addition converts operands to Number; invalid strings/undefined may yield NaN";
            }
        },
        .subtract, .multiply, .divide, .remainder, .exponent, .bitwise_and => {
            if (isSymbol(left) or isSymbol(right)) {
                rule.result = .type_error;
                rule.outcome = .type_error;
                rule.rationale = "Numeric/bitwise operator cannot convert Symbol to numeric value";
            } else if (isBigInt(left) != isBigInt(right)) {
                rule.result = .type_error;
                rule.outcome = .type_error;
                rule.rationale = "Numeric operator rejects mixed BigInt and Number after ToNumeric";
            } else {
                rule.result = numericResult(left, right);
                rule.rationale = if (isBigInt(left) and isBigInt(right))
                    "Both operands are BigInt; result is BigInt (division/remainder/exponent may throw for special values)"
                else
                    "Operands convert to Number; non-numeric strings or undefined can produce NaN";
            }
        },
    }

    return rule;
}

/// Number of operator/type-pair cases represented by the generated rule space.
pub fn caseCount() usize {
    return ast.primitives.len * ast.primitives.len * operators.len;
}

test "addition models concatenation, numeric addition and mixed BigInt failure" {
    try std.testing.expectEqual(ResultKind.string, classify(.string, .number, .add).result);
    try std.testing.expectEqual(ResultKind.number_or_nan, classify(.number, .boolean, .add).result);
    try std.testing.expectEqual(ast.Outcome.type_error, classify(.bigint, .number, .add).outcome);
    try std.testing.expectEqual(ResultKind.bigint, classify(.bigint, .bigint, .add).result);
}

test "arithmetic and bitwise operators reject Symbol" {
    try std.testing.expectEqual(ast.Outcome.type_error, classify(.symbol, .number, .multiply).outcome);
    try std.testing.expectEqual(ast.Outcome.type_error, classify(.number, .symbol, .bitwise_and).outcome);
}

test "strict equality returns boolean without coercion" {
    const rule = classify(.string, .number, .strict_equal);
    try std.testing.expectEqual(ResultKind.boolean, rule.result);
    try std.testing.expectEqual(ast.Outcome.runtime_value, rule.outcome);
}

test "logical operators preserve operand result semantics" {
    try std.testing.expectEqual(ResultKind.operand, classify(.string, .number, .logical_and).result);
    try std.testing.expectEqual(ResultKind.operand, classify(.null, .undefined, .logical_or).result);
}

test "complete primitive operator space has a rule for every combination" {
    for (ast.primitives) |left| {
        for (ast.primitives) |right| {
            for (operators) |operator| {
                const rule = classify(left, right, operator);
                try std.testing.expectEqual(left, rule.left);
                try std.testing.expectEqual(right, rule.right);
                try std.testing.expectEqual(operator, rule.operator);
            }
        }
    }
    try std.testing.expectEqual(@as(usize, 7 * 7 * 15), caseCount());
}
