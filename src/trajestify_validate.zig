const std = @import("std");
const trajestify = @import("trajestify.zig");

pub fn main() !void {
    const allocator = std.heap.page_allocator;
    const args = try std.process.argsAlloc(allocator);
    defer std.process.argsFree(allocator, args);

    if (args.len != 3) {
        std.debug.print("Usage: trajestify-validate <ir|artifact> <json-file>\n", .{});
        return error.InvalidArguments;
    }

    const bytes = try std.fs.cwd().readFileAlloc(allocator, args[2], 16 * 1024 * 1024);
    defer allocator.free(bytes);

    if (std.mem.eql(u8, args[1], "ir")) {
        const ir = try trajestify.parseIR(allocator, bytes);
        std.debug.print("Trajestify IR valid: {s} ({d} clauses)\n", .{ ir.name, ir.clauses.len });
    } else if (std.mem.eql(u8, args[1], "artifact")) {
        const artifact = try trajestify.parseArtifact(allocator, bytes);
        std.debug.print("Trajestify artifact valid: {s} ({d} steps, status={s})\n", .{
            artifact.runId,
            artifact.steps.len,
            @tagName(artifact.trajectory.status),
        });
    } else {
        std.debug.print("Unknown input type: {s}; expected ir or artifact\n", .{args[1]});
        return error.InvalidArguments;
    }
}
