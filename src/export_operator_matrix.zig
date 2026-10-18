const std = @import("std");
const ast = @import("semantic_ast.zig");
const operators = @import("operator_interaction.zig");

const ExportCase = struct {
    left: []const u8,
    right: []const u8,
    operator: []const u8,
    result: []const u8,
    outcome: []const u8,
};

pub fn main() !void {
    const allocator = std.heap.page_allocator;
    const output = try allocator.alloc(ExportCase, operators.caseCount());
    var i: usize = 0;
    for (ast.primitives) |left| {
        for (ast.primitives) |right| {
            for (operators.operators) |op| {
                const rule = operators.classify(left, right, op);
                output[i] = .{
                    .left = @tagName(left),
                    .right = @tagName(right),
                    .operator = @tagName(op),
                    .result = @tagName(rule.result),
                    .outcome = @tagName(rule.outcome),
                };
                i += 1;
            }
        }
    }
    const json = try std.json.Stringify.valueAlloc(allocator, output, .{});
    defer allocator.free(json);
    try std.fs.cwd().writeFile(.{ .sub_path = "tests/generated-operator-matrix.json", .data = json });
}
