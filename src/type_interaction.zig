const std = @import("std");
const ast = @import("semantic_ast.zig");

pub const Rule = struct {
    source: ast.Primitive,
    target: ast.Primitive,
    relation: ast.Relation,
    operation: []const u8,
    outcome: ast.Outcome,
    result: []const u8,
};

pub const Matrix = [_]Rule{
    .{ .source=.string, .target=.number, .relation=.convert, .operation="Number(value)", .outcome=.runtime_value, .result="Number(value)" },
    .{ .source=.string, .target=.boolean, .relation=.convert, .operation="Boolean(value)", .outcome=.runtime_value, .result="Boolean(value)" },
    .{ .source=.string, .target=.bigint, .relation=.convert, .operation="BigInt(value)", .outcome=.runtime_value, .result="BigInt(value) or RangeError" },
    .{ .source=.number, .target=.string, .relation=.convert, .operation="String(value)", .outcome=.runtime_value, .result="String(value)" },
    .{ .source=.number, .target=.boolean, .relation=.convert, .operation="Boolean(value)", .outcome=.runtime_value, .result="Boolean(value)" },
    .{ .source=.number, .target=.bigint, .relation=.convert, .operation="BigInt(value)", .outcome=.runtime_value, .result="BigInt(value) when integral; RangeError otherwise" },
    .{ .source=.boolean, .target=.number, .relation=.convert, .operation="Number(value)", .outcome=.runtime_value, .result="1 or 0" },
    .{ .source=.boolean, .target=.string, .relation=.convert, .operation="String(value)", .outcome=.runtime_value, .result="true or false" },
    .{ .source=.null, .target=.number, .relation=.convert, .operation="Number(null)", .outcome=.runtime_value, .result="0" },
    .{ .source=.undefined, .target=.number, .relation=.convert, .operation="Number(undefined)", .outcome=.nan, .result="NaN" },
    .{ .source=.symbol, .target=.number, .relation=.convert, .operation="Number(symbol)", .outcome=.type_error, .result="TypeError" },
    .{ .source=.bigint, .target=.number, .relation=.convert, .operation="Number(bigint)", .outcome=.type_error, .result="TypeError in implicit numeric conversion" },
};

pub fn find(source: ast.Primitive, target: ast.Primitive, relation: ast.Relation, operation: []const u8) ?Rule {
    for (Matrix) |rule| {
        if (rule.source == source and rule.target == target and rule.relation == relation and std.mem.eql(u8, rule.operation, operation)) return rule;
    }
    return null;
}

test "matrix distinguishes explicit conversion from coercion" {
    const rule = find(.string, .number, .convert, "Number(value)").?;
    try std.testing.expectEqual(ast.Outcome.runtime_value, rule.outcome);
    try std.testing.expect(find(.string, .number, .coerce, "Number(value)") == null);
}

test "invalid primitive conversion is executable semantic evidence" {
    const rule = find(.symbol, .number, .convert, "Number(symbol)").?;
    try std.testing.expectEqual(ast.Outcome.type_error, rule.outcome);
}

test "undefined to number records NaN" {
    const rule = find(.undefined, .number, .convert, "Number(undefined)").?;
    try std.testing.expectEqual(ast.Outcome.nan, rule.outcome);
}
