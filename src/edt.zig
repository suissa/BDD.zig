const std = @import("std");

pub const max_behaviors = 16;
pub const max_parameters_per_behavior = 24;

pub const Unit = enum {
    none,
    bytes,
    kilobytes,
    megabytes,
    megabits,
    milliseconds,
    seconds,
    minutes,
    hours,
    percent,
};

pub const ValueKind = enum { text, number, quantity, percentage };

pub const Value = struct {
    kind: ValueKind,
    text: []const u8,
    number: f64 = 0,
    unit: Unit = .none,
};

pub const Parameter = struct {
    name: []const u8,
    value: Value,
};

pub const Behavior = struct {
    name: []const u8,
    parameters: [max_parameters_per_behavior]Parameter = undefined,
    parameter_count: usize = 0,
    expectation: []const u8 = "",

    pub fn get(self: *const Behavior, name: []const u8) ?Value {
        for (self.parameters[0..self.parameter_count]) |parameter| {
            if (std.mem.eql(u8, parameter.name, name)) return parameter.value;
        }
        return null;
    }
};

pub const Document = struct {
    behaviors: [max_behaviors]Behavior = undefined,
    behavior_count: usize = 0,

    pub fn find(self: *const Document, name: []const u8) ?*const Behavior {
        for (self.behaviors[0..self.behavior_count]) |*behavior| {
            if (std.mem.eql(u8, behavior.name, name)) return behavior;
        }
        return null;
    }
};

pub const ParseError = error{
    BehaviorLimitExceeded,
    ParameterLimitExceeded,
    InvalidParameter,
    MissingExpectation,
};

fn trim(text: []const u8) []const u8 {
    return std.mem.trim(u8, text, " \t\r");
}

fn startsWith(text: []const u8, prefix: []const u8) bool {
    return std.mem.startsWith(u8, text, prefix);
}

fn parseValue(raw_value: []const u8) Value {
    const raw = trim(raw_value);
    var numeric_end: usize = 0;
    while (numeric_end < raw.len) : (numeric_end += 1) {
        const c = raw[numeric_end];
        if (!((c >= '0' and c <= '9') or c == '.' or (numeric_end == 0 and (c == '-' or c == '+')))) break;
    }
    if (numeric_end == 0) return .{ .kind = .text, .text = raw };

    const number = std.fmt.parseFloat(f64, raw[0..numeric_end]) catch {
        return .{ .kind = .text, .text = raw };
    };
    const suffix = trim(raw[numeric_end..]);
    if (suffix.len == 0) return .{ .kind = .number, .text = raw, .number = number };

    const unit: Unit = if (std.mem.eql(u8, suffix, "B")) .bytes else if (std.mem.eql(u8, suffix, "KB")) .kilobytes else if (std.mem.eql(u8, suffix, "MB")) .megabytes else if (std.mem.eql(u8, suffix, "Mb")) .megabits else if (std.mem.eql(u8, suffix, "ms")) .milliseconds else if (std.mem.eql(u8, suffix, "s")) .seconds else if (std.mem.eql(u8, suffix, "m")) .minutes else if (std.mem.eql(u8, suffix, "h")) .hours else if (std.mem.eql(u8, suffix, "%")) .percent else return .{ .kind = .text, .text = raw };
    return .{
        .kind = if (unit == .percent) .percentage else .quantity,
        .text = raw,
        .number = number,
        .unit = unit,
    };
}

/// Parses the executable subset of Evidency Behavior declarations.
/// Entity/Property/Laws/Background lines are metadata; behavior parameters and
/// expectations are retained as typed values. Returned slices reference source.
pub fn parse(source: []const u8) ParseError!Document {
    var document = Document{};
    var current: ?usize = null;
    var lines = std.mem.splitScalar(u8, source, '\n');

    while (lines.next()) |raw_line| {
        const line = trim(raw_line);
        if (line.len == 0 or line[0] == '#') continue;

        if (startsWith(line, "Evidency Behavior:")) {
            if (document.behavior_count >= max_behaviors) return error.BehaviorLimitExceeded;
            const name = trim(line["Evidency Behavior:".len..]);
            if (name.len == 0) return error.InvalidParameter;
            const index = document.behavior_count;
            document.behaviors[index] = .{ .name = name };
            document.behavior_count += 1;
            current = index;
            continue;
        }

        const behavior_index = current orelse continue;
        if (startsWith(line, "I Expect ")) {
            const expectation = trim(line["I Expect ".len..]);
            if (expectation.len == 0) return error.InvalidParameter;
            document.behaviors[behavior_index].expectation = expectation;
            continue;
        }

        const value_line = if (startsWith(line, "Given ")) line["Given ".len..] else if (startsWith(line, "And ")) line["And ".len..] else continue;
        const equals = std.mem.indexOfScalar(u8, value_line, '=') orelse return error.InvalidParameter;
        const name = trim(value_line[0..equals]);
        const raw_value = trim(value_line[equals + 1 ..]);
        if (name.len == 0 or raw_value.len == 0) return error.InvalidParameter;

        var behavior = &document.behaviors[behavior_index];
        if (behavior.parameter_count >= max_parameters_per_behavior) return error.ParameterLimitExceeded;
        behavior.parameters[behavior.parameter_count] = .{
            .name = name,
            .value = parseValue(raw_value),
        };
        behavior.parameter_count += 1;
    }

    for (document.behaviors[0..document.behavior_count]) |behavior| {
        if (behavior.expectation.len == 0) return error.MissingExpectation;
    }
    return document;
}

test "parses all API evidence behaviors from the example file" {
    const source = @embedFile("edt_test_fixture.edt");
    const document = try parse(source);
    try std.testing.expectEqual(@as(usize, 11), document.behavior_count);
    try std.testing.expect(document.find("Stress API") != null);
    try std.testing.expect(document.find("Concurrency API") != null);
}

test "parses typed duration and percentage values" {
    const source =
        \\Evidency Behavior: typed values
        \\  Given duration = 2m
        \\  And increase_data = 10Mb
        \\  And max_error_rate = 0.1%
        \\  I Expect isLive
    ;
    const document = try parse(source);
    const behavior = document.find("typed values").?;
    const duration = behavior.get("duration").?;
    try std.testing.expectEqual(ValueKind.quantity, duration.kind);
    try std.testing.expectEqual(Unit.minutes, duration.unit);
    try std.testing.expectEqual(@as(f64, 2), duration.number);

    const payload = behavior.get("increase_data").?;
    try std.testing.expectEqual(Unit.megabits, payload.unit);
    try std.testing.expectEqual(@as(f64, 10), payload.number);

    const error_rate = behavior.get("max_error_rate").?;
    try std.testing.expectEqual(ValueKind.percentage, error_rate.kind);
    try std.testing.expectEqual(@as(f64, 0.1), error_rate.number);
}

test "rejects a behavior without an expectation" {
    try std.testing.expectError(error.MissingExpectation, parse(
        \\Evidency Behavior: incomplete
        \\  Given payload = X
    ));
}

test "rejects malformed parameters" {
    try std.testing.expectError(error.InvalidParameter, parse(
        \\Evidency Behavior: malformed
        \\  Given duration
        \\  I Expect isLive
    ));
}
