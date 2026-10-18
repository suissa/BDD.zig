const std = @import("std");
const cases = @import("semantic_cases.zig");
const operators = @import("operator_interaction.zig");

const ExportCase = struct {
    name: []const u8,
    left_type: []const u8,
    right_type: []const u8,
    operator: []const u8,
    left_partition: []const u8,
    right_partition: []const u8,
    expected: []const u8,
    expected_error: ?[]const u8,
    modeled_result: []const u8,
    modeled_outcome: []const u8,
};

pub fn main() !void {
    const allocator = std.heap.page_allocator;
    const output = try allocator.alloc(ExportCase, cases.cases.len);
    for (cases.cases, 0..) |case, i| {
        output[i] = .{
            .name = case.name,
            .left_type = @tagName(case.left_type),
            .right_type = @tagName(case.right_type),
            .operator = @tagName(case.operator),
            .left_partition = @tagName(case.left_partition),
            .right_partition = @tagName(case.right_partition),
            .expected = case.expected,
            .expected_error = case.expected_error,
            .modeled_result = @tagName(operators.classify(case.left_type, case.right_type, case.operator).result),
            .modeled_outcome = @tagName(operators.classify(case.left_type, case.right_type, case.operator).outcome),
        };
    }
    const json = try std.json.Stringify.valueAlloc(allocator, output, .{});
    defer allocator.free(json);
    try std.fs.cwd().writeFile(.{ .sub_path = "tests/generated-semantic-cases.json", .data = json });
}
