const std = @import("std");
const ast = @import("semantic_ast.zig");
const operators = @import("operator_interaction.zig");

pub const Partition = enum { ordinary, empty, numeric_string, invalid_numeric_string, zero, negative, nan, positive_infinity, negative_zero, bigint_zero, bigint_negative, truthy, falsy, symbol_value, null_value, undefined_value };

pub const ConcreteCase = struct {
    name: []const u8,
    left_type: ast.Primitive,
    right_type: ast.Primitive,
    operator: operators.Operator,
    left_partition: Partition,
    right_partition: Partition,
    /// Expected-value encoding: JSON literals for strings/numbers/booleans/null,
    /// and NaN, Infinity, -Infinity, -0, or an integer suffixed with 'n' for BigInt.
    expected: []const u8,
    expected_error: ?[]const u8 = null,
};

pub const cases = [_]ConcreteCase{
    .{ .name = "string concatenation", .left_type = .string, .right_type = .number, .operator = .add, .left_partition = .ordinary, .right_partition = .ordinary, .expected = "\"x1\"" },
    .{ .name = "numeric string subtraction", .left_type = .string, .right_type = .number, .operator = .subtract, .left_partition = .numeric_string, .right_partition = .ordinary, .expected = "7" },
    .{ .name = "invalid numeric string produces NaN", .left_type = .string, .right_type = .number, .operator = .subtract, .left_partition = .invalid_numeric_string, .right_partition = .ordinary, .expected = "NaN" },
    .{ .name = "empty string converts to zero", .left_type = .string, .right_type = .number, .operator = .multiply, .left_partition = .empty, .right_partition = .ordinary, .expected = "0" },
    .{ .name = "null converts to zero in addition", .left_type = .null, .right_type = .number, .operator = .add, .left_partition = .null_value, .right_partition = .ordinary, .expected = "1" },
    .{ .name = "undefined produces NaN in addition", .left_type = .undefined, .right_type = .number, .operator = .add, .left_partition = .undefined_value, .right_partition = .ordinary, .expected = "NaN" },
    .{ .name = "number division by positive zero", .left_type = .number, .right_type = .number, .operator = .divide, .left_partition = .ordinary, .right_partition = .zero, .expected = "Infinity" },
    .{ .name = "zero divided by zero", .left_type = .number, .right_type = .number, .operator = .divide, .left_partition = .zero, .right_partition = .zero, .expected = "NaN" },
    .{ .name = "negative zero is preserved", .left_type = .number, .right_type = .number, .operator = .multiply, .left_partition = .negative_zero, .right_partition = .ordinary, .expected = "-0" },
    .{ .name = "NaN relational comparison is false", .left_type = .number, .right_type = .number, .operator = .less_than, .left_partition = .nan, .right_partition = .ordinary, .expected = "false" },
    .{ .name = "NaN loose equality is false", .left_type = .number, .right_type = .number, .operator = .loose_equal, .left_partition = .nan, .right_partition = .nan, .expected = "false" },
    .{ .name = "positive infinity remains infinity", .left_type = .number, .right_type = .number, .operator = .multiply, .left_partition = .positive_infinity, .right_partition = .ordinary, .expected = "Infinity" },
    .{ .name = "BigInt division by zero throws RangeError", .left_type = .bigint, .right_type = .bigint, .operator = .divide, .left_partition = .ordinary, .right_partition = .bigint_zero, .expected = "", .expected_error = "RangeError" },
    .{ .name = "BigInt remainder by zero throws RangeError", .left_type = .bigint, .right_type = .bigint, .operator = .remainder, .left_partition = .ordinary, .right_partition = .bigint_zero, .expected = "", .expected_error = "RangeError" },
    .{ .name = "negative BigInt exponent throws RangeError", .left_type = .bigint, .right_type = .bigint, .operator = .exponent, .left_partition = .ordinary, .right_partition = .bigint_negative, .expected = "", .expected_error = "RangeError" },
    .{ .name = "mixed BigInt and Number arithmetic throws TypeError", .left_type = .bigint, .right_type = .number, .operator = .subtract, .left_partition = .ordinary, .right_partition = .ordinary, .expected = "", .expected_error = "TypeError" },
    .{ .name = "Symbol numeric conversion throws TypeError", .left_type = .symbol, .right_type = .number, .operator = .multiply, .left_partition = .symbol_value, .right_partition = .ordinary, .expected = "", .expected_error = "TypeError" },
    .{ .name = "string plus BigInt concatenates", .left_type = .string, .right_type = .bigint, .operator = .add, .left_partition = .truthy, .right_partition = .ordinary, .expected = "\"left1\"" },
    .{ .name = "BigInt addition returns BigInt", .left_type = .bigint, .right_type = .bigint, .operator = .add, .left_partition = .ordinary, .right_partition = .ordinary, .expected = "2n" },
    .{ .name = "logical AND returns falsy left operand", .left_type = .number, .right_type = .string, .operator = .logical_and, .left_partition = .falsy, .right_partition = .ordinary, .expected = "0" },
    .{ .name = "logical OR returns truthy left operand", .left_type = .string, .right_type = .string, .operator = .logical_or, .left_partition = .truthy, .right_partition = .ordinary, .expected = "\"left\"" },
    .{ .name = "logical OR returns right operand for falsy left", .left_type = .string, .right_type = .number, .operator = .logical_or, .left_partition = .empty, .right_partition = .ordinary, .expected = "1" },
    .{ .name = "bitwise AND converts Number operands", .left_type = .number, .right_type = .number, .operator = .bitwise_and, .left_partition = .ordinary, .right_partition = .zero, .expected = "0" },
    .{ .name = "strict equality does not coerce", .left_type = .string, .right_type = .number, .operator = .strict_equal, .left_partition = .numeric_string, .right_partition = .ordinary, .expected = "false" },
    .{ .name = "loose equality coerces numeric string", .left_type = .string, .right_type = .number, .operator = .loose_equal, .left_partition = .numeric_string, .right_partition = .ordinary, .expected = "true" },
};

test "concrete semantic cases are linked to classified operator rules" {
    try std.testing.expectEqual(@as(usize, 25), cases.len);
    for (cases) |case| {
        const rule = operators.classify(case.left_type, case.right_type, case.operator);
        try std.testing.expect(case.name.len > 0);
        try std.testing.expect(case.expected.len > 0 or case.expected_error != null);
        if (case.expected_error) |err| {
            if (std.mem.eql(u8, err, "TypeError")) try std.testing.expectEqual(ast.Outcome.type_error, rule.outcome);
        }
    }
}
