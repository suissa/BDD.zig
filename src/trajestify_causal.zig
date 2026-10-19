const std = @import("std");
const trajestify = @import("trajestify.zig");

pub const CausalValidationError = error{
    DuplicateEventId,
    InvalidCausalLink,
};

/// Validates the causal portion of a Trajectory Artifact.
/// A cause must identify an event that already occurred. This makes the
/// trajectory a causal DAG over execution order instead of merely a log.
pub fn validateCausalGraph(steps: []const trajestify.ArtifactStep) CausalValidationError!void {
    for (steps, 0..) |step, i| {
        for (steps[0..i]) |prior| {
            if (std.mem.eql(u8, prior.eventId, step.eventId)) return error.DuplicateEventId;
        }
        for (step.causedBy) |cause_id| {
            var found_prior = false;
            for (steps[0..i]) |prior| {
                if (std.mem.eql(u8, prior.eventId, cause_id)) {
                    found_prior = true;
                    break;
                }
            }
            if (!found_prior) return error.InvalidCausalLink;
        }
    }
}

test "accepts a causal chain" {
    const steps = [_]trajestify.ArtifactStep{
        .{ .eventId = "evt-1", .sequence = 1, .clauseId = "customer", .kind = "given", .status = .passed, .startedAt = "t", .finishedAt = "t", .durationMs = 1, .causedBy = &.{} },
        .{ .eventId = "evt-2", .sequence = 2, .clauseId = "sales", .kind = "when", .status = .passed, .startedAt = "t", .finishedAt = "t", .durationMs = 1, .causedBy = &.{ "evt-1" } },
        .{ .eventId = "evt-3", .sequence = 3, .clauseId = "stock", .kind = "then", .status = .passed, .startedAt = "t", .finishedAt = "t", .durationMs = 1, .causedBy = &.{ "evt-2" } },
    };
    try validateCausalGraph(&steps);
}

test "rejects a future causal reference" {
    const steps = [_]trajestify.ArtifactStep{
        .{ .eventId = "evt-1", .sequence = 1, .clauseId = "customer", .kind = "given", .status = .passed, .startedAt = "t", .finishedAt = "t", .durationMs = 1, .causedBy = &.{ "evt-2" } },
        .{ .eventId = "evt-2", .sequence = 2, .clauseId = "sales", .kind = "when", .status = .passed, .startedAt = "t", .finishedAt = "t", .durationMs = 1, .causedBy = &.{} },
    };
    try std.testing.expectError(error.InvalidCausalLink, validateCausalGraph(&steps));
}

test "rejects an unknown causal reference" {
    const steps = [_]trajestify.ArtifactStep{
        .{ .eventId = "evt-1", .sequence = 1, .clauseId = "customer", .kind = "given", .status = .passed, .startedAt = "t", .finishedAt = "t", .durationMs = 1, .causedBy = &.{ "missing" } },
    };
    try std.testing.expectError(error.InvalidCausalLink, validateCausalGraph(&steps));
}

test "rejects duplicate event IDs" {
    const steps = [_]trajestify.ArtifactStep{
        .{ .eventId = "same", .sequence = 1, .clauseId = "customer", .kind = "given", .status = .passed, .startedAt = "t", .finishedAt = "t", .durationMs = 1, .causedBy = &.{} },
        .{ .eventId = "same", .sequence = 2, .clauseId = "sales", .kind = "when", .status = .passed, .startedAt = "t", .finishedAt = "t", .durationMs = 1, .causedBy = &.{ "same" } },
    };
    try std.testing.expectError(error.DuplicateEventId, validateCausalGraph(&steps));
}
