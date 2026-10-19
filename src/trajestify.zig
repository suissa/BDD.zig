const std = @import("std");

pub const ClauseKind = enum { given, when, then };
pub const TracePolicy = enum { full, minimal };
pub const DivergencePolicy = enum { @"continue", stop };
pub const EvidenceKind = enum { inputs, outputs, state, errors, causal_links, timing, logs, attachments };

pub const SourceLocation = struct {
    file: ?[]const u8 = null,
    line: u32,
    column: u32,
};

pub const Clause = struct {
    id: []const u8,
    kind: ClauseKind,
    expression: []const u8,
    source: SourceLocation,
};

/// Schema-compatible semantic IR emitted by the TypeScript compiler.
pub const TrajectoryIR = struct {
    schemaVersion: u8,
    name: []const u8,
    intentId: []const u8,
    actor: ?[]const u8 = null,
    trajectoryId: []const u8,
    clauses: []const Clause,
    invariants: []const []const u8,
    trace: TracePolicy,
    onDivergence: DivergencePolicy,
    evidence: []const EvidenceKind,
};

pub const StepStatus = enum { passed, failed, diverged, blocked, skipped, @"error" };
pub const ArtifactIntentStatus = enum { passed, diverged, failed };
pub const DivergenceCategory = enum { assertion_mismatch, execution_error };

pub const ArtifactStep = struct {
    eventId: []const u8,
    sequence: u32,
    clauseId: []const u8,
    kind: []const u8,
    status: StepStatus,
    startedAt: []const u8,
    finishedAt: []const u8,
    durationMs: u64,
    causedBy: []const []const u8,
    expected: ?std.json.Value = null,
    observed: ?std.json.Value = null,
    source: ?SourceLocation = null,
    @"error": ?ArtifactError = null,
};

pub const ArtifactError = struct { name: []const u8, message: []const u8 };

pub const ArtifactSummary = struct {
    passed: u32,
    failed: u32,
    diverged: u32,
    blocked: u32,
    skipped: u32,
};

pub const FirstDivergence = struct {
    eventId: []const u8,
    sequence: u32,
    category: DivergenceCategory,
    message: []const u8,
    expected: ?std.json.Value = null,
    observed: ?std.json.Value = null,
};

pub const CausalPathNode = struct { eventId: []const u8, clauseId: []const u8 };
pub const RootCauseCandidate = struct {
    eventId: []const u8,
    clauseId: []const u8,
    confidence: enum { candidate },
    basis: enum { first_divergence },
};
pub const ArtifactDiagnostics = struct {
    rootCause: ?RootCauseCandidate,
    causalPath: []const CausalPathNode,
};

pub const TrajectoryArtifact = struct {
    schemaVersion: u8,
    runId: []const u8,
    intent: struct {
        id: []const u8,
        title: []const u8,
        status: ArtifactIntentStatus,
    },
    trajectory: struct {
        id: []const u8,
        status: ArtifactIntentStatus,
    },
    startedAt: []const u8,
    finishedAt: []const u8,
    steps: []const ArtifactStep,
    firstDivergence: ?FirstDivergence,
    diagnostics: ArtifactDiagnostics,
    summary: ArtifactSummary,
};

pub const ValidationError = error{
    UnsupportedSchemaVersion,
    EmptyIdentifier,
    InvalidClauseId,
    DuplicateClauseId,
    MissingGiven,
    MissingWhen,
    MissingThen,
    EmptyExpression,
    InvalidSourceLocation,
    InvalidArtifactSequence,
    InvalidSummary,
    InconsistentStatus,
    MissingFirstDivergence,
    InvalidFirstDivergence,
    InvalidDiagnostics,
};

fn nonEmpty(value: []const u8) bool {
    return value.len > 0;
}

fn validId(value: []const u8) bool {
    if (value.len == 0 or !std.ascii.isAlphabetic(value[0])) return false;
    for (value[1..]) |ch| {
        if (!std.ascii.isAlphanumeric(ch) and ch != '_' and ch != '-') return false;
    }
    return true;
}

/// Validates structural invariants that JSON Schema cannot express portably
/// (unique clause IDs and presence of each BDD phase).
pub fn validateIR(ir: TrajectoryIR) ValidationError!void {
    if (ir.schemaVersion != 1) return error.UnsupportedSchemaVersion;
    if (!nonEmpty(ir.name) or !validId(ir.intentId) or !nonEmpty(ir.trajectoryId)) return error.EmptyIdentifier;

    var has_given = false;
    var has_when = false;
    var has_then = false;
    for (ir.clauses, 0..) |clause, i| {
        if (!validId(clause.id)) return error.InvalidClauseId;
        if (!nonEmpty(clause.expression)) return error.EmptyExpression;
        if (clause.source.line == 0 or clause.source.column == 0) return error.InvalidSourceLocation;
        for (ir.clauses[0..i]) |prior| {
            if (std.mem.eql(u8, prior.id, clause.id)) return error.DuplicateClauseId;
        }
        switch (clause.kind) {
            .given => has_given = true,
            .when => has_when = true,
            .then => has_then = true,
        }
    }
    if (!has_given) return error.MissingGiven;
    if (!has_when) return error.MissingWhen;
    if (!has_then) return error.MissingThen;
    for (ir.invariants) |expression| {
        if (!nonEmpty(expression)) return error.EmptyExpression;
    }
}

pub fn parseIR(allocator: std.mem.Allocator, json_bytes: []const u8) !TrajectoryIR {
    const parsed = try std.json.parseFromSlice(TrajectoryIR, allocator, json_bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false });
    defer parsed.deinit();
    try validateIR(parsed.value);
    return try cloneIR(allocator, parsed.value);
}

fn cloneIR(allocator: std.mem.Allocator, ir: TrajectoryIR) !TrajectoryIR {
    const clauses = try allocator.alloc(Clause, ir.clauses.len);
    for (ir.clauses, 0..) |clause, i| {
        clauses[i] = .{
            .id = try allocator.dupe(u8, clause.id),
            .kind = clause.kind,
            .expression = try allocator.dupe(u8, clause.expression),
            .source = .{
                .file = if (clause.source.file) |file| try allocator.dupe(u8, file) else null,
                .line = clause.source.line,
                .column = clause.source.column,
            },
        };
    }
    const invariants = try allocator.alloc([]const u8, ir.invariants.len);
    for (ir.invariants, 0..) |expression, i| invariants[i] = try allocator.dupe(u8, expression);
    return .{
        .schemaVersion = ir.schemaVersion,
        .name = try allocator.dupe(u8, ir.name),
        .intentId = try allocator.dupe(u8, ir.intentId),
        .actor = if (ir.actor) |actor| try allocator.dupe(u8, actor) else null,
        .trajectoryId = try allocator.dupe(u8, ir.trajectoryId),
        .clauses = clauses,
        .invariants = invariants,
        .trace = ir.trace,
        .onDivergence = ir.onDivergence,
        .evidence = try allocator.dupe(EvidenceKind, ir.evidence),
    };
}

pub fn parseArtifact(allocator: std.mem.Allocator, json_bytes: []const u8) !TrajectoryArtifact {
    const artifact = try std.json.parseFromSliceLeaky(TrajectoryArtifact, allocator, json_bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false });
    try validateArtifact(artifact);
    return artifact;
}

pub fn validateArtifact(artifact: TrajectoryArtifact) ValidationError!void {
    if (artifact.schemaVersion != 1) return error.UnsupportedSchemaVersion;
    if (!nonEmpty(artifact.runId) or !nonEmpty(artifact.intent.id) or !nonEmpty(artifact.trajectory.id)) return error.EmptyIdentifier;

    var passed: u32 = 0;
    var failed: u32 = 0;
    var diverged: u32 = 0;
    var blocked: u32 = 0;
    var skipped: u32 = 0;
    for (artifact.steps, 0..) |step, i| {
        if (step.sequence != i + 1) return error.InvalidArtifactSequence;
        if (!nonEmpty(step.eventId) or !nonEmpty(step.clauseId)) return error.EmptyIdentifier;
        switch (step.status) {
            .passed => passed += 1,
            .failed, .@"error" => failed += 1,
            .diverged => diverged += 1,
            .blocked => blocked += 1,
            .skipped => skipped += 1,
        }
    }
    const summary = artifact.summary;
    if (summary.passed != passed or summary.failed != failed or summary.diverged != diverged or summary.blocked != blocked or summary.skipped != skipped) return error.InvalidSummary;
    if (artifact.intent.status != artifact.trajectory.status) return error.InconsistentStatus;

    const expected_status: ArtifactIntentStatus = if (failed > 0) .failed else if (diverged > 0) .diverged else .passed;
    if (artifact.intent.status != expected_status) return error.InconsistentStatus;

    if (artifact.firstDivergence) |first| {
        if (first.sequence == 0 or first.sequence > artifact.steps.len) return error.InvalidFirstDivergence;
        const step = artifact.steps[first.sequence - 1];
        if (!std.mem.eql(u8, first.eventId, step.eventId)) return error.InvalidFirstDivergence;
        switch (first.category) {
            .assertion_mismatch => if (step.status != .diverged) return error.InvalidFirstDivergence,
            .execution_error => if (step.status != .failed and step.status != .@"error") return error.InvalidFirstDivergence,
        }
    } else if (failed > 0 or diverged > 0) {
        return error.MissingFirstDivergence;
    }

    const diagnostics = artifact.diagnostics;
    if (artifact.firstDivergence) |first| {
        const root = diagnostics.rootCause orelse return error.InvalidDiagnostics;
        if (!std.mem.eql(u8, root.eventId, first.eventId) or
            !std.mem.eql(u8, root.clauseId, artifact.steps[first.sequence - 1].clauseId))
            return error.InvalidDiagnostics;
        if (diagnostics.causalPath.len == 0) return error.InvalidDiagnostics;
        const last = diagnostics.causalPath[diagnostics.causalPath.len - 1];
        if (!std.mem.eql(u8, last.eventId, first.eventId) or
            !std.mem.eql(u8, last.clauseId, artifact.steps[first.sequence - 1].clauseId))
            return error.InvalidDiagnostics;
        for (diagnostics.causalPath, 0..) |node, i| {
            var matched: ?usize = null;
            for (artifact.steps, 0..) |step, step_index| {
                if (std.mem.eql(u8, step.eventId, node.eventId) and std.mem.eql(u8, step.clauseId, node.clauseId)) {
                    matched = step_index;
                    break;
                }
            }
            const current_index = matched orelse return error.InvalidDiagnostics;
            if (i > 0) {
                const previous = diagnostics.causalPath[i - 1];
                var linked = false;
                for (artifact.steps[current_index].causedBy) |cause_id| {
                    if (std.mem.eql(u8, cause_id, previous.eventId)) {
                        linked = true;
                        break;
                    }
                }
                if (!linked) return error.InvalidDiagnostics;
            }
        }
    } else if (diagnostics.rootCause != null or diagnostics.causalPath.len != 0) {
        return error.InvalidDiagnostics;
    }
}

test "validates IR and rejects duplicate clause IDs" {
    const allocator = std.testing.allocator;
    const valid =
        \\{"schemaVersion":1,"name":"Buy product","intentId":"buy_product","trajectoryId":"purchase_product","clauses":[{"id":"customer-active","kind":"given","expression":"Customer is active","source":{"line":7,"column":1}},{"id":"purchase-requested","kind":"when","expression":"Customer buys Product","source":{"line":8,"column":1}},{"id":"order-created","kind":"then","expression":"Order exists","source":{"line":9,"column":1}}],"invariants":[],"trace":"full","onDivergence":"continue","evidence":["inputs","outputs"]}
    ;
    const ir = try parseIR(allocator, valid);
    defer allocator.free(ir.clauses);
    try std.testing.expectEqual(@as(usize, 3), ir.clauses.len);

    const duplicate =
        \\{"schemaVersion":1,"name":"Buy product","intentId":"buy_product","trajectoryId":"purchase_product","clauses":[{"id":"same","kind":"given","expression":"active","source":{"line":1,"column":1}},{"id":"same","kind":"when","expression":"buy","source":{"line":2,"column":1}},{"id":"done","kind":"then","expression":"done","source":{"line":3,"column":1}}],"invariants":[],"trace":"full","onDivergence":"continue","evidence":[]}
    ;
    try std.testing.expectError(error.DuplicateClauseId, parseIR(allocator, duplicate));
}

test "parses a TypeScript-compatible trajectory artifact JSON" {
    var arena_state = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena_state.deinit();
    const json =
        \\{"schemaVersion":1,"runId":"run-1","intent":{"id":"buy_product","title":"Buy product","status":"passed"},"trajectory":{"id":"purchase_product","status":"passed"},"startedAt":"2026-10-19T00:00:00.000Z","finishedAt":"2026-10-19T00:00:01.000Z","steps":[],"firstDivergence":null,"diagnostics":{"rootCause":null,"causalPath":[]},"summary":{"passed":0,"failed":0,"diverged":0,"blocked":0,"skipped":0}}
    ;
    const artifact = try parseArtifact(arena_state.allocator(), json);
    try std.testing.expectEqualStrings("run-1", artifact.runId);
    try std.testing.expectEqual(ArtifactIntentStatus.passed, artifact.intent.status);
}

test "rejects malformed artifact sequence and mismatched summary" {
    const artifact = TrajectoryArtifact{
        .schemaVersion = 1,
        .runId = "run-1",
        .intent = .{ .id = "buy_product", .title = "Buy product", .status = .passed },
        .trajectory = .{ .id = "purchase_product", .status = .passed },
        .startedAt = "2026-10-19T00:00:00.000Z",
        .finishedAt = "2026-10-19T00:00:01.000Z",
        .steps = &.{.{
            .eventId = "run-1:evt:2",
            .sequence = 2,
            .clauseId = "customer-active",
            .kind = "given",
            .status = .passed,
            .startedAt = "2026-10-19T00:00:00.000Z",
            .finishedAt = "2026-10-19T00:00:00.001Z",
            .durationMs = 1,
            .causedBy = &.{},
        }},
        .firstDivergence = null,
        .diagnostics = .{ .rootCause = null, .causalPath = &.{} },
        .summary = .{ .passed = 1, .failed = 0, .diverged = 0, .blocked = 0, .skipped = 0 },
    };
    try std.testing.expectError(error.InvalidArtifactSequence, validateArtifact(artifact));
}


test "rejects artifact whose first divergence points to the wrong event" {
    const artifact = TrajectoryArtifact{
        .schemaVersion = 1,
        .runId = "run-1",
        .intent = .{ .id = "buy_product", .title = "Buy product", .status = .diverged },
        .trajectory = .{ .id = "purchase_product", .status = .diverged },
        .startedAt = "2026-10-19T00:00:00.000Z",
        .finishedAt = "2026-10-19T00:00:01.000Z",
        .steps = &.{.{
            .eventId = "run-1:evt:1",
            .sequence = 1,
            .clauseId = "stock",
            .kind = "then",
            .status = .diverged,
            .startedAt = "2026-10-19T00:00:00.000Z",
            .finishedAt = "2026-10-19T00:00:00.001Z",
            .durationMs = 1,
            .causedBy = &.{},
        }},
        .firstDivergence = .{
            .eventId = "run-1:evt:9",
            .sequence = 1,
            .category = .assertion_mismatch,
            .message = "Stock expected 8 but got 9",
        },
        .diagnostics = .{
            .rootCause = .{ .eventId = "run-1:evt:1", .clauseId = "stock", .confidence = .candidate, .basis = .first_divergence },
            .causalPath = &.{.{ .eventId = "run-1:evt:1", .clauseId = "stock" }},
        },
        .summary = .{ .passed = 0, .failed = 0, .diverged = 1, .blocked = 0, .skipped = 0 },
    };
    try std.testing.expectError(error.InvalidFirstDivergence, validateArtifact(artifact));
}

test "requires first divergence whenever an artifact contains failed or diverged steps" {
    const artifact = TrajectoryArtifact{
        .schemaVersion = 1,
        .runId = "run-1",
        .intent = .{ .id = "buy_product", .title = "Buy product", .status = .diverged },
        .trajectory = .{ .id = "purchase_product", .status = .diverged },
        .startedAt = "2026-10-19T00:00:00.000Z",
        .finishedAt = "2026-10-19T00:00:01.000Z",
        .steps = &.{.{
            .eventId = "run-1:evt:1",
            .sequence = 1,
            .clauseId = "stock",
            .kind = "then",
            .status = .diverged,
            .startedAt = "2026-10-19T00:00:00.000Z",
            .finishedAt = "2026-10-19T00:00:00.001Z",
            .durationMs = 1,
            .causedBy = &.{},
        }},
        .firstDivergence = null,
        .diagnostics = .{ .rootCause = null, .causalPath = &.{} },
        .summary = .{ .passed = 0, .failed = 0, .diverged = 1, .blocked = 0, .skipped = 0 },
    };
    try std.testing.expectError(error.MissingFirstDivergence, validateArtifact(artifact));
}
