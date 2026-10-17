const std = @import("std");

/// Bounded polling for asynchronous integration/E2E assertions.
/// Time is injected so tests can verify retry behavior without real sleeps.
pub const Options = struct {
    max_attempts: usize = 10,
    interval_ms: u64 = 100,
};

pub const Predicate = struct {
    context: *anyopaque,
    check_fn: *const fn (*anyopaque) bool,

    pub fn check(self: Predicate) bool {
        return self.check_fn(self.context);
    }
};

pub const Sleeper = struct {
    context: *anyopaque,
    sleep_fn: *const fn (*anyopaque, u64) void,

    pub fn sleep(self: Sleeper, milliseconds: u64) void {
        self.sleep_fn(self.context, milliseconds);
    }
};

pub const WaitError = error{
    InvalidAttemptCount,
    ConditionNotMet,
};

/// Checks immediately, then waits between failed checks. Never exceeds
/// max_attempts and does not sleep after the final failed check.
pub fn waitFor(
    predicate: Predicate,
    sleeper: Sleeper,
    options: Options,
) WaitError!void {
    if (options.max_attempts == 0) return error.InvalidAttemptCount;

    var attempt: usize = 0;
    while (attempt < options.max_attempts) : (attempt += 1) {
        if (predicate.check()) return;
        if (attempt + 1 < options.max_attempts) {
            sleeper.sleep(options.interval_ms);
        }
    }
    return error.ConditionNotMet;
}

const Probe = struct {
    checks: usize = 0,
    ready_on_check: usize,
    sleeps: usize = 0,
    total_sleep_ms: u64 = 0,

    fn predicate(context: *anyopaque) bool {
        const self: *Probe = @ptrCast(@alignCast(context));
        self.checks += 1;
        return self.checks >= self.ready_on_check;
    }

    fn sleep(context: *anyopaque, milliseconds: u64) void {
        const self: *Probe = @ptrCast(@alignCast(context));
        self.sleeps += 1;
        self.total_sleep_ms += milliseconds;
    }

    fn makePredicate(self: *Probe) Predicate {
        return .{ .context = self, .check_fn = predicate };
    }

    fn makeSleeper(self: *Probe) Sleeper {
        return .{ .context = self, .sleep_fn = sleep };
    }
};

test "Eventually succeeds when a condition becomes true before the limit" {
    var probe = Probe{ .ready_on_check = 3 };
    try waitFor(probe.makePredicate(), probe.makeSleeper(), .{
        .max_attempts = 5,
        .interval_ms = 25,
    });
    try std.testing.expectEqual(@as(usize, 3), probe.checks);
    try std.testing.expectEqual(@as(usize, 2), probe.sleeps);
    try std.testing.expectEqual(@as(u64, 50), probe.total_sleep_ms);
}

test "Eventually fails after the configured number of checks" {
    var probe = Probe{ .ready_on_check = 99 };
    try std.testing.expectError(error.ConditionNotMet, waitFor(
        probe.makePredicate(),
        probe.makeSleeper(),
        .{ .max_attempts = 4, .interval_ms = 10 },
    ));
    try std.testing.expectEqual(@as(usize, 4), probe.checks);
    try std.testing.expectEqual(@as(usize, 3), probe.sleeps);
    try std.testing.expectEqual(@as(u64, 30), probe.total_sleep_ms);
}

test "Eventually rejects a zero attempt limit without checking or sleeping" {
    var probe = Probe{ .ready_on_check = 1 };
    try std.testing.expectError(error.InvalidAttemptCount, waitFor(
        probe.makePredicate(),
        probe.makeSleeper(),
        .{ .max_attempts = 0 },
    ));
    try std.testing.expectEqual(@as(usize, 0), probe.checks);
    try std.testing.expectEqual(@as(usize, 0), probe.sleeps);
}
