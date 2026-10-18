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
    expected: []const u8,
    expected_error: ?[]const u8 = null,
};

pub const cases = [_]ConcreteCase{
    .{ .name = "string concatenation", .left_type = .string, .right_type = .number, .operator = .add, .left_partition = .ordinary, .right_partition = .ordinary, .expected = "\"x1\"" },
    .{ .name = "invalid numeric string yields NaN", .left_type = .string, .right_type = .number, .operator = .subtract, .left_partition = .invalid_numeric_string, .right_partition = .ordinary, .expected = "NaN" },
    .{ .name = "number division by zero yields Infinity", .left_type = .number, .right_type = .number, .operator = .divide, .left_partition = .ordinary, .right_partition = .zero, .expected = "Infinity" },
    .{ .name = "BigInt division by zero throws", .left_type = .bigint, .right_type = .bigint, .operator = .divide, .left_partition = .ordinary, .right_partition = .bigint_zero, .expected = "", .expected_error = "RangeError" },
    .{ .name = "negative BigInt exponent throws", .left_type = .bigint, .right_type = .bigint, .operator = .exponent, .left_partition = .ordinary, .right_partition = .bigint_negative, .expected = "", .expected_error = "RangeError" },
    .{ .name = "mixed BigInt addition throws", .left_type = .bigint, .right_type = .number, .operator = .add, .left_partition = .ordinary, .right_partition = .ordinary, .expected = "", .expected_error = "TypeError" },
    .{ .name = "Symbol arithmetic throws", .left_type = .symbol, .right_type = .number, .operator = .multiply, .left_partition = .symbol_value, .right_partition = .ordinary, .expected = "", .expected_error = "TypeError" },
    .{ .name = "NaN relational comparison is false", .left_type = .number, .right_type = .number, .operator = .less_than, .left_partition = .nan, .right_partition = .ordinary, .expected = "false" },
    .{ .name = "logical AND returns falsy operand", .left_type = .number, .right_type = .string, .operator = .logical_and, .left_partition = .falsy, .right_partition = .ordinary, .expected = "left operand" },
    .{ .name = "null numeric conversion yields zero", .left_type = .null, .right_type = .number, .operator = .add, .left_partition = .null_value, .right_partition = .ordinary, .expected = "1" },
    .{ .name = "undefined numeric conversion yields NaN", .left_type = .undefined, .right_type = .number, .operator = .add, .left_partition = .undefined_value, .right_partition = .ordinary, .expected = "NaN" },
};

test "concrete semantic cases are linked to classified operator rules" {
    try std.testing.expect(cases.len >= 10);
    for (cases) |case| {
        const rule = operators.classify(case.left_type, case.right_type, case.operator);
        try std.testing.expect(case.name.len > 0);
        try std.testing.expect(case.expected.len > 0 or case.expected_error != null);
        if (case.expected_error) |err| {
            if (std.mem.eql(u8, err, "TypeError")) try std.testing.expectEqual(ast.Outcome.type_error, rule.outcome);
        }
    }
}
