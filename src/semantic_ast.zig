const std = @import("std");

pub const Primitive = enum {
    string,
    number,
    bigint,
    boolean,
    symbol,
    null,
    undefined,
};

pub const Relation = enum { assign, coerce, convert, cast, compare, operate, call };
pub const Outcome = enum { allowed, compile_error, runtime_value, runtime_error, nan, type_error };

pub const Interaction = struct {
    source: Primitive,
    target: Primitive,
    relation: Relation,
    outcome: Outcome,
    result: []const u8,
};

pub const Variant = enum { valid, empty, malformed, boundary, invalid };

pub const Constraint = struct { name: []const u8, expression: []const u8 };
pub const Law = struct { name: []const u8, expression: []const u8 };

pub const SemanticProperty = struct {
    name: []const u8,
    primitive: Primitive,
    variants: []const Variant = &.{},
    constraints: []const Constraint = &.{},
    laws: []const Law = &.{},
    interactions: []const Interaction = &.{},
};

pub const Ast = struct {
    properties: []const SemanticProperty,

    pub fn property(self: *const Ast, name: []const u8) ?*const SemanticProperty {
        for (self.properties) |*p| if (std.mem.eql(u8, p.name, name)) return p;
        return null;
    }
};

pub const primitives = [_]Primitive{ .string, .number, .bigint, .boolean, .symbol, .null, .undefined };

pub const string_interactions = [_]Interaction{
    .{ .source = .string, .target = .number, .relation = .coerce, .outcome = .runtime_value, .result = "Number(value)" },
    .{ .source = .string, .target = .boolean, .relation = .coerce, .outcome = .runtime_value, .result = "Boolean(value)" },
    .{ .source = .string, .target = .bigint, .relation = .coerce, .outcome = .runtime_value, .result = "BigInt(value) or RangeError" },
    .{ .source = .string, .target = .string, .relation = .assign, .outcome = .allowed, .result = "same value" },
    .{ .source = .string, .target = .number, .relation = .operate, .outcome = .runtime_value, .result = "numeric coercion; NaN when non-numeric" },
};

pub const number_interactions = [_]Interaction{
    .{ .source = .number, .target = .string, .relation = .coerce, .outcome = .runtime_value, .result = "String(value)" },
    .{ .source = .number, .target = .boolean, .relation = .coerce, .outcome = .runtime_value, .result = "Boolean(value)" },
    .{ .source = .number, .target = .bigint, .relation = .coerce, .outcome = .runtime_value, .result = "BigInt(value) when integral" },
    .{ .source = .number, .target = .number, .relation = .assign, .outcome = .allowed, .result = "same value" },
};

pub const boolean_interactions = [_]Interaction{
    .{ .source = .boolean, .target = .string, .relation = .coerce, .outcome = .runtime_value, .result = "\"true\" or \"false\"" },
    .{ .source = .boolean, .target = .number, .relation = .coerce, .outcome = .runtime_value, .result = "1 or 0" },
    .{ .source = .boolean, .target = .boolean, .relation = .assign, .outcome = .allowed, .result = "same value" },
};

pub const canonical_properties = [_]SemanticProperty{
    .{ .name = "String", .primitive = .string, .variants = &.{ .valid, .empty, .malformed, .boundary, .invalid }, .interactions = &string_interactions },
    .{ .name = "Number", .primitive = .number, .variants = &.{ .valid, .boundary, .invalid }, .interactions = &number_interactions },
    .{ .name = "BigInt", .primitive = .bigint, .variants = &.{ .valid, .boundary, .invalid } },
    .{ .name = "Boolean", .primitive = .boolean, .variants = &.{ .valid, .invalid }, .interactions = &boolean_interactions },
    .{ .name = "Symbol", .primitive = .symbol, .variants = &.{ .valid, .invalid } },
    .{ .name = "Null", .primitive = .null, .variants = &.{ .valid, .invalid } },
    .{ .name = "Undefined", .primitive = .undefined, .variants = &.{ .valid, .invalid } },
};

pub const canonical_ast = Ast{ .properties = &canonical_properties };

pub fn interaction(source: Primitive, target: Primitive, relation: Relation) ?Interaction {
    for (canonical_properties) |property_def| {
        if (property_def.primitive != source) continue;
        for (property_def.interactions) |item| {
            if (item.target == target and item.relation == relation) return item;
        }
    }
    return null;
}

test "canonical AST exposes primitive properties as first-class definitions" {
    const cpf = SemanticProperty{ .name = "CPF", .primitive = .string, .variants = &.{ .valid, .empty, .malformed, .boundary, .invalid }, .constraints = &.{.{ .name = "length", .expression = "11" }}, .laws = &.{.{ .name = "digitsOnly", .expression = "true" }} };
    try std.testing.expectEqual(Primitive.string, cpf.primitive);
    try std.testing.expectEqual(@as(usize, 5), cpf.variants.len);
    try std.testing.expectEqualStrings("length", cpf.constraints[0].name);
}

test "AST records string to number coercion gap" {
    const result = interaction(.string, .number, .coerce).?;
    try std.testing.expectEqual(Outcome.runtime_value, result.outcome);
    try std.testing.expectEqualStrings("Number(value)", result.result);
}

test "all seven TypeScript primitive kinds have canonical properties" {
    try std.testing.expectEqual(@as(usize, 7), canonical_ast.properties.len);
    inline for (primitives) |primitive| {
        var found = false;
        for (canonical_ast.properties) |p| {
            if (p.primitive == primitive) found = true;
        }
        try std.testing.expect(found);
    }
}
