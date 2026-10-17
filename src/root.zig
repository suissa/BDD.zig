//! By convention, root.zig is the root source file when making a package.
const std = @import("std");
const Io = std.Io;

/// This is a documentation comment to explain the `printAnotherMessage` function below.
///
/// Accepting an `Io.Writer` instance is a handy way to write reusable code.
pub fn printAnotherMessage(writer: *Io.Writer) Io.Writer.Error!void {
    try writer.print("Run `zig build test` to run the tests.\n", .{});
}

pub fn add(a: i32, b: i32) i32 {
    return a + b;
}

test "basic add functionality" {
    try std.testing.expect(add(3, 7) == 10);
}

// Include the native Evidence Behavior runner in `zig build test`.
test {
    _ = @import("evidence.zig");
}

// Include bounded eventual assertions in `zig build test`.
test {
    _ = @import("eventually.zig");
}

// Include the Evidency Behavior parser and its typed-value tests in the suite.
test {
    _ = @import("edt.zig");
}
