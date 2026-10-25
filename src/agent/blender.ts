/**
 * Emits a self-contained Blender (bpy) Python script that rebuilds the Spec
 * natively: primitives + boolean modifiers + array/mirror transforms, so the
 * result is editable in Blender rather than a frozen mesh. Units: mm (the
 * script sets scene unit scale to 0.001 so 1 Blender unit = 1 mm).
 */
import type { Node, Spec } from "./spec";

export function toBlenderScript(spec: Spec): string {
  const parts = spec.parts ?? {};
  let counter = 0;
  const lines: string[] = [];
  const emit = (s: string) => lines.push(s);

  const name = (p: string) => `${p}_${++counter}`;

  const build = (n: Node, depth: number): string => {
    if (depth > 64) throw new Error("spec nesting too deep");
    switch (n.op) {
      case "cube": {
        const v = name("cube");
        const [x, y, z] = n.size;
        const loc = n.center ? [0, 0, 0] : [x / 2, y / 2, z / 2];
        emit(`${v} = add_cube((${x}, ${y}, ${z}), ${py(loc)})`);
        return v;
      }
      case "cylinder": {
        const v = name("cyl");
        const z = n.center ? 0 : n.height / 2;
        emit(`${v} = add_cone(${n.radius}, ${n.radiusTop ?? n.radius}, ${n.height}, ${n.segments ?? 64}, (0, 0, ${z}))`);
        return v;
      }
      case "cone": {
        const v = name("cone");
        const z = n.center ? 0 : n.height / 2;
        emit(`${v} = add_cone(${n.radius}, 0.0, ${n.height}, ${n.segments ?? 64}, (0, 0, ${z}))`);
        return v;
      }
      case "sphere": {
        const v = name("sphere");
        emit(`${v} = add_sphere(${n.radius}, ${n.segments ?? 48})`);
        return v;
      }
      case "torus": {
        const v = name("torus");
        emit(`${v} = add_torus(${n.radius}, ${n.tube}, ${n.segments ?? 48})`);
        return v;
      }
      case "roundedBox": {
        const v = name("rbox");
        const [x, y, z] = n.size;
        const loc = n.center ? [0, 0, 0] : [x / 2, y / 2, z / 2];
        emit(`${v} = add_rounded_box((${x}, ${y}, ${z}), ${n.radius}, ${py(loc)})`);
        return v;
      }
      case "extrude": {
        const v = name("extrude");
        const scaleTop = n.scaleTop === undefined ? [1, 1] : typeof n.scaleTop === "number" ? [n.scaleTop, n.scaleTop] : n.scaleTop;
        emit(`${v} = add_extrude(${py(n.polygon)}, ${n.height}, ${n.twist ?? 0}, ${py(scaleTop)}, ${n.center ? "True" : "False"})`);
        return v;
      }
      case "revolve": {
        const v = name("revolve");
        emit(`${v} = add_revolve(${py(n.polygon)}, ${n.degrees ?? 360}, ${n.segments ?? 64})`);
        return v;
      }
      case "union": {
        const kids = n.children.map((c) => build(c, depth + 1));
        return kids.length === 1 ? kids[0] : group("union", kids);
      }
      case "difference": {
        const kids = n.children.map((c) => build(c, depth + 1));
        if (kids.length === 1) return kids[0];
        const v = name("diff");
        emit(`${v} = boolean(${kids[0]}, union_all([${kids.slice(1).join(", ")}]), 'DIFFERENCE')`);
        return v;
      }
      case "intersection": {
        const kids = n.children.map((c) => build(c, depth + 1));
        if (kids.length === 1) return kids[0];
        const v = name("inter");
        emit(`${v} = ${kids[0]}`);
        for (const k of kids.slice(1)) emit(`${v} = boolean(${v}, ${k}, 'INTERSECT')`);
        return v;
      }
      case "hull": {
        const kids = n.children.map((c) => build(c, depth + 1));
        const v = name("hull");
        emit(`${v} = convex_hull(union_all([${kids.join(", ")}]))`);
        return v;
      }
      case "translate": {
        const v = group("t", n.children.map((c) => build(c, depth + 1)));
        emit(`transform(${v}, Matrix.Translation(${py(n.by)}))`);
        return v;
      }
      case "rotate": {
        const v = group("r", n.children.map((c) => build(c, depth + 1)));
        const [rx, ry, rz] = n.degrees;
        emit(`transform(${v}, Euler((radians(${rx}), radians(${ry}), radians(${rz})), 'XYZ').to_matrix().to_4x4())`);
        return v;
      }
      case "scale": {
        const v = group("s", n.children.map((c) => build(c, depth + 1)));
        const by = typeof n.by === "number" ? [n.by, n.by, n.by] : n.by;
        emit(`transform(${v}, Matrix.Diagonal((${by[0]}, ${by[1]}, ${by[2]}, 1.0)))`);
        return v;
      }
      case "mirror": {
        const v = group("m", n.children.map((c) => build(c, depth + 1)));
        emit(`mirror(${v}, ${py(n.normal)})`);
        return v;
      }
      case "repeat": {
        const base = group("rep", n.children.map((c) => build(c, depth + 1)));
        const v = name("array");
        emit(`${v} = linear_array(${base}, ${n.count}, ${py(n.step)})`);
        return v;
      }
      case "radial": {
        const base = group("rad", n.children.map((c) => build(c, depth + 1)));
        const v = name("radial");
        emit(`${v} = radial_array(${base}, ${n.count}, ${n.radius ?? 0}, ${n.degrees ?? 360})`);
        return v;
      }
      case "ref": {
        const target = parts[n.name];
        if (!target) throw new Error(`unknown part "${n.name}"`);
        const v = build(target, depth + 1);
        emit(`${v}.name = ${JSON.stringify(n.name)}`);
        return v;
      }
    }
  };

  const group = (prefix: string, kids: string[]) => {
    if (kids.length === 1) return kids[0];
    const v = name(prefix);
    emit(`${v} = union_all([${kids.join(", ")}])`);
    return v;
  };

  const root = build(spec.root, 0);
  emit(`root = ${root}`);
  emit(`root.name = ${JSON.stringify(spec.name)}`);
  emit(`finish(root)`);

  return `${HEADER(spec)}\n${lines.join("\n")}\n`;
}

const py = (v: unknown) => JSON.stringify(v).replace(/\[/g, "(").replace(/\]/g, ")");

const HEADER = (spec: Spec) => `# ${spec.name}
# ${spec.description.replace(/\n/g, " ")}
#
# Generated by 3DBlend — https://github.com/alfredang/3dblend
# Run in Blender 3.6+ : Scripting workspace > Open > Run Script (Alt+P)
# Units are millimetres (scene unit scale is set to 0.001).
# The object is left on the build plate (min Z = 0, centred on origin) and is
# ready for File > Export > STL.

import bpy, bmesh
from math import radians, cos, sin, pi
from mathutils import Matrix, Vector, Euler

def _reset_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    scn = bpy.context.scene
    scn.unit_settings.system = 'METRIC'
    scn.unit_settings.scale_length = 0.001
    scn.unit_settings.length_unit = 'MILLIMETERS'

_reset_scene()

def _apply_all(o):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    o.select_set(False)
    return o

def _obj_from_bmesh(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    return o

def add_cube(size, loc):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return _obj_from_bmesh(bm, "Cube")

def add_cone(r1, r2, depth, segs, loc):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=int(segs), radius1=r1, radius2=max(r2, 1e-6), depth=depth)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=bm.verts)
    return _obj_from_bmesh(bm, "Cylinder")

def add_sphere(r, segs):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=int(segs), v_segments=max(8, int(segs/2)), radius=r)
    return _obj_from_bmesh(bm, "Sphere")

def add_torus(R, r, segs):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=int(segs), minor_segments=max(12, int(segs/2)))
    o = bpy.context.active_object
    o.select_set(False)
    return o

def add_rounded_box(size, radius, loc):
    o = add_cube(size, loc)
    bev = o.modifiers.new("Bevel", 'BEVEL')
    bev.width = min(radius, min(size)/2 - 1e-3)
    bev.segments = 8
    bev.limit_method = 'NONE'
    return _apply_all(o)

def _polygon_bmesh(poly):
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, 0.0)) for (x, y) in poly]
    bm.faces.new(verts)
    bm.normal_update()
    return bm, verts

def add_extrude(poly, height, twist, scale_top, center):
    bm, verts = _polygon_bmesh(poly)
    face = bm.faces[0]
    if face.normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=[face])
    res = bmesh.ops.extrude_face_region(bm, geom=[face])
    top_verts = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, 0, height)), verts=top_verts)
    if scale_top != (1, 1) or twist:
        m = Matrix.Diagonal((scale_top[0], scale_top[1], 1.0, 1.0)) @ Matrix.Rotation(radians(twist), 4, 'Z')
        bmesh.ops.transform(bm, matrix=m, verts=top_verts)
    if center:
        bmesh.ops.translate(bm, vec=Vector((0, 0, -height/2)), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj_from_bmesh(bm, "Extrude")

def add_revolve(poly, degrees, segs):
    bm = bmesh.new()
    verts = [bm.verts.new((max(0.0, x), 0.0, y)) for (x, y) in poly]
    edges = [bm.edges.new((verts[i], verts[(i+1) % len(verts)])) for i in range(len(verts))]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0,0,0), axis=(0,0,1), angle=radians(degrees), steps=int(segs), use_merge=(degrees >= 360))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    if degrees < 360:
        bmesh.ops.holes_fill(bm, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj_from_bmesh(bm, "Revolve")

def boolean(a, b, op):
    mod = a.modifiers.new(op.title(), 'BOOLEAN')
    mod.operation = op
    mod.solver = 'EXACT'
    mod.object = b
    _apply_all(a)
    bpy.data.objects.remove(b, do_unlink=True)
    return a

def union_all(objs):
    base = objs[0]
    for o in objs[1:]:
        base = boolean(base, o, 'UNION')
    return base

def convex_hull(o):
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(o.data); bm.free()
    return o

def transform(o, matrix):
    o.data.transform(matrix)
    o.data.update()
    return o

def mirror(o, normal):
    n = Vector(normal).normalized()
    m = Matrix.Identity(4)
    for i in range(3):
        for j in range(3):
            m[i][j] = (1.0 if i == j else 0.0) - 2.0 * n[i] * n[j]
    transform(o, m)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()
    return o

def _copy(o):
    c = o.copy(); c.data = o.data.copy()
    bpy.context.collection.objects.link(c)
    return c

def linear_array(o, count, step):
    copies = []
    for i in range(1, int(count)):
        c = _copy(o)
        transform(c, Matrix.Translation(Vector(step) * i))
        copies.append(c)
    return union_all([o] + copies)

def radial_array(o, count, radius, degrees):
    if radius:
        transform(o, Matrix.Translation((radius, 0, 0)))
    step = (360.0 / count) if degrees >= 360 else (degrees / (count - 1) if count > 1 else 0)
    copies = []
    for i in range(1, int(count)):
        c = _copy(o)
        transform(c, Matrix.Rotation(radians(step * i), 4, 'Z'))
        copies.append(c)
    return union_all([o] + copies)

def finish(o):
    # Seat on the build plate: centre XY, min Z = 0.
    xs = [v.co.x for v in o.data.vertices]; ys = [v.co.y for v in o.data.vertices]; zs = [v.co.z for v in o.data.vertices]
    cx = (min(xs) + max(xs)) / 2; cy = (min(ys) + max(ys)) / 2
    transform(o, Matrix.Translation((-cx, -cy, -min(zs))))
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()
    bpy.context.view_layer.objects.active = o
    o.select_set(True)

# ---------------------------------------------------------------- model`;
