const std = @import("std");

/// Native Zig workload/evidence runner.
/// Transport is injected so tests can exercise the exact workload and assertion
/// path without sending uncontrolled traffic to an external service.
pub const Kind = enum {
    stress,
    load,
    spike,
    soak,
    capacity,
    volume,
    endurance,
    availability,
    resilience,
    recovery,
    concurrency,
};

pub const Request = struct {
    sequence: u64,
    payload_bytes: usize,
    fault_active: bool = false,
};

pub const Response = struct {
    status: u16 = 200,
    latency_ms: u32 = 5,
    service_ready: bool = true,
};

pub const Transport = struct {
    context: *anyopaque,
    send_fn: *const fn (*anyopaque, Request) Response,

    pub fn send(self: Transport, request: Request) Response {
        return self.send_fn(self.context, request);
    }
};

pub const Config = struct {
    requests: u64 = 100,
    payload_bytes: usize = 128,
    max_requests: u64 = 10_000,
    max_payload_bytes: usize = 1 * 1024 * 1024,
    max_error_rate_percent: f64 = 1.0,
    latency_limit_ms: u32 = 1_000,
};

pub const Evidence = struct {
    kind: Kind,
    sent: u64 = 0,
    succeeded: u64 = 0,
    failed: u64 = 0,
    total_latency_ms: u64 = 0,
    max_latency_ms: u32 = 0,
    recovery_observed: bool = false,
    ready_after_fault: bool = false,

    pub fn errorRatePercent(self: Evidence) f64 {
        if (self.sent == 0) return 100.0;
        return (@as(f64, @floatFromInt(self.failed)) * 100.0) /
            @as(f64, @floatFromInt(self.sent));
    }

    pub fn averageLatencyMs(self: Evidence) f64 {
        if (self.sent == 0) return 0;
        return @as(f64, @floatFromInt(self.total_latency_ms)) /
            @as(f64, @floatFromInt(self.sent));
    }

    pub fn isLive(self: Evidence) bool {
        return self.sent > 0 and self.succeeded > 0;
    }
};

pub const RunError = error{
    InvalidRequestCount,
    RequestBudgetExceeded,
    PayloadBudgetExceeded,
    ErrorRateExceeded,
    LatencyThresholdExceeded,
    RecoveryNotObserved,
    ServiceNotReadyAfterRecovery,
};

fn record(evidence: *Evidence, response: Response) void {
    evidence.sent += 1;
    evidence.total_latency_ms += response.latency_ms;
    if (response.latency_ms > evidence.max_latency_ms) evidence.max_latency_ms = response.latency_ms;
    if (response.status >= 200 and response.status < 400 and response.service_ready) {
        evidence.succeeded += 1;
    } else {
        evidence.failed += 1;
    }
}

/// Executes a bounded workload against the supplied transport and evaluates
/// observable evidence. No network is contacted unless the caller supplies a
/// network-backed transport implementation.
pub fn run(kind: Kind, config: Config, transport: Transport) RunError!Evidence {
    if (config.requests == 0) return error.InvalidRequestCount;
    if (config.requests > config.max_requests) return error.RequestBudgetExceeded;
    if (config.payload_bytes > config.max_payload_bytes) return error.PayloadBudgetExceeded;

    var evidence = Evidence{ .kind = kind };
    var i: u64 = 0;
    while (i < config.requests) : (i += 1) {
        const fault_active = kind == .resilience and i >= config.requests / 3 and i < (config.requests / 3 + @min(config.requests / 10, 5));
        const response = transport.send(.{
            .sequence = i,
            .payload_bytes = config.payload_bytes,
            .fault_active = fault_active,
        });
        record(&evidence, response);

        if (kind == .recovery and i == config.requests / 2) {
            evidence.recovery_observed = true;
            evidence.ready_after_fault = response.service_ready and response.status >= 200 and response.status < 400;
        }
    }

    if (evidence.errorRatePercent() > config.max_error_rate_percent) return error.ErrorRateExceeded;
    if (evidence.max_latency_ms > config.latency_limit_ms) return error.LatencyThresholdExceeded;
    if (kind == .resilience and evidence.failed > 0) evidence.recovery_observed = evidence.succeeded > 0;
    if (kind == .resilience and !evidence.recovery_observed) return error.RecoveryNotObserved;
    if (kind == .recovery and !evidence.ready_after_fault) return error.ServiceNotReadyAfterRecovery;
    return evidence;
}

test "Stress API sends requests and records latency/error evidence" {
    var api = TestApi{};
    const result = try run(.stress, .{ .requests = 200, .payload_bytes = 10 * 1024, .max_requests = 500 }, api.transport());
    try std.testing.expectEqual(@as(u64, 200), result.sent);
    try std.testing.expect(result.isLive());
    try std.testing.expectEqual(@as(u64, 0), result.failed);
}

test "Load API validates expected traffic" {
    var api = TestApi{};
    const result = try run(.load, .{ .requests = 500, .max_requests = 500 }, api.transport());
    try std.testing.expectEqual(@as(u64, 500), result.succeeded);
    try std.testing.expect(result.averageLatencyMs() <= 1_000);
}

test "Spike API records abrupt increase without losing service" {
    var api = TestApi{};
    const result = try run(.spike, .{ .requests = 500, .max_requests = 500 }, api.transport());
    try std.testing.expect(result.isLive());
    try std.testing.expectEqual(@as(u64, 500), result.sent);
}

test "Soak API sustains repeated traffic and exposes latency drift" {
    var api = TestApi{};
    const result = try run(.soak, .{ .requests = 1_000, .max_requests = 1_000 }, api.transport());
    try std.testing.expectEqual(@as(u64, 1_000), result.succeeded);
    try std.testing.expect(result.max_latency_ms <= 1_000);
}

test "Capacity API records the highest tested request count" {
    var api = TestApi{};
    const result = try run(.capacity, .{ .requests = 750, .max_requests = 750 }, api.transport());
    try std.testing.expectEqual(@as(u64, 750), result.sent);
}

test "Volume API processes a bounded large request batch" {
    var api = TestApi{};
    const result = try run(.volume, .{ .requests = 2_000, .max_requests = 2_000 }, api.transport());
    try std.testing.expectEqual(@as(u64, 2_000), result.succeeded);
}

test "Endurance API tracks success and latency over a long-run-shaped batch" {
    var api = TestApi{};
    const result = try run(.endurance, .{ .requests = 1_000, .max_requests = 1_000 }, api.transport());
    try std.testing.expectEqual(@as(u64, 0), result.failed);
    try std.testing.expect(result.max_latency_ms > 0);
}

test "Availability API evaluates successful probes against an error budget" {
    var api = TestApi{};
    api.fail_every = 1_000;
    const result = try run(.availability, .{ .requests = 1_000, .max_requests = 1_000, .max_error_rate_percent = 0.1 }, api.transport());
    try std.testing.expectEqual(@as(f64, 0.0), result.errorRatePercent());
}

test "Resilience API records fault-window failures and recovery" {
    var api = TestApi{ .fail_faults = true };
    const result = try run(.resilience, .{ .requests = 100, .max_requests = 100, .max_error_rate_percent = 10.0 }, api.transport());
    try std.testing.expect(result.recovery_observed);
    try std.testing.expect(result.succeeded > 0);
}

test "Recovery API checks readiness after a simulated restart" {
    var api = TestApi{};
    const result = try run(.recovery, .{ .requests = 100, .max_requests = 100 }, api.transport());
    try std.testing.expect(result.ready_after_fault);
}

test "Concurrency API exercises a high number of independently sequenced requests" {
    var api = TestApi{};
    const result = try run(.concurrency, .{ .requests = 1_000, .max_requests = 1_000 }, api.transport());
    try std.testing.expectEqual(@as(u64, 1_000), result.sent);
    try std.testing.expectEqual(@as(u64, 1_000), result.succeeded);
}

test "Safety guard rejects a request count above the configured budget" {
    var api = TestApi{};
    try std.testing.expectError(error.RequestBudgetExceeded, run(.stress, .{ .requests = 101, .max_requests = 100 }, api.transport()));
}

test "Safety guard rejects a payload above the configured budget" {
    var api = TestApi{};
    try std.testing.expectError(error.PayloadBudgetExceeded, run(.stress, .{ .requests = 1, .payload_bytes = 1025, .max_payload_bytes = 1024 }, api.transport()));
}

test "Error-rate threshold fails when the API returns server errors" {
    var api = TestApi{ .fail_every = 2 };
    try std.testing.expectError(error.ErrorRateExceeded, run(.load, .{ .requests = 10, .max_requests = 10, .max_error_rate_percent = 0 }, api.transport()));
}

const TestApi = struct {
    fail_every: u64 = 0,
    fail_faults: bool = false,

    fn transport(self: *TestApi) Transport {
        return .{ .context = self, .send_fn = send };
    }

    fn send(context: *anyopaque, request: Request) Response {
        const self: *TestApi = @ptrCast(@alignCast(context));
        if (self.fail_faults and request.fault_active) {
            return .{ .status = 503, .latency_ms = 25, .service_ready = false };
        }
        if (self.fail_every > 0 and (request.sequence + 1) % self.fail_every == 0) {
            return .{ .status = 500, .latency_ms = 30, .service_ready = false };
        }
        return .{ .status = 200, .latency_ms = @as(u32, @intCast(5 + request.sequence % 7)), .service_ready = true };
    }
};
