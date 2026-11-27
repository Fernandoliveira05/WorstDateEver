"""Blender: extract one connected island group from a merged set GLB.

Used for sources like a three-mug set or a condiment caddy where the publisher
merged everything into one mesh. Selects islands whose XY centre falls inside a
target radius (plus optional min-X guard), recenters the result, exports a
single-object GLB, and updates the source record.

    blender -b --python-exit-code 1 -P tools/tripo-qa/stage_split.py -- \
      --asset-id beer-mug \\
      --source assets/hand-qa/sources/beer-mug/camping-mug.glb \\
      --output assets/hand-qa/candidates/beer-mug.glb \\
      --target 0.055 0.061 --radius 0.060
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from hashlib import sha256
from pathlib import Path

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--asset-id", required=True)
parser.add_argument("--source", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--target", nargs=2, type=float, required=True)
parser.add_argument("--radius", type=float, required=True)
parser.add_argument("--min-x", type=float)
opt = parser.parse_args(args)

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

source = Path(opt.source).resolve()
output = Path(opt.output).resolve()
record_path = source.parent / "source-record.json"
if not source.is_file():
    raise FileNotFoundError(str(source))
output.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if len(meshes) != 1:
    raise RuntimeError(f"Expected one mesh, got {len(meshes)}")
obj = meshes[0]
mesh = obj.data
vertices = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]

leaders = list(range(len(vertices)))


def root(index: int) -> int:
    while leaders[index] != index:
        leaders[index] = leaders[leaders[index]]
        index = leaders[index]
    return index


def join(first: int, second: int) -> None:
    leaders[root(first)] = root(second)


coincident = {}
for index, point in enumerate(vertices):
    join(index, coincident.setdefault(tuple(round(value, 5) for value in point), index))
for edge in mesh.edges:
    join(edge.vertices[0], edge.vertices[1])

groups = defaultdict(list)
for polygon in mesh.polygons:
    groups[root(polygon.vertices[0])].append(polygon.index)

selected = set()
selected_islands = []
target = Vector((opt.target[0], opt.target[1]))
for face_indices in groups.values():
    points = [vertices[index] for face in face_indices for index in mesh.polygons[face].vertices]
    minimum = Vector([min(point[d] for point in points) for d in range(3)])
    maximum = Vector([max(point[d] for point in points) for d in range(3)])
    center = (minimum + maximum) * 0.5
    if (center.xy - target).length > opt.radius:
        continue
    if opt.min_x is not None and center.x < opt.min_x:
        continue
    selected.update(face_indices)
    selected_islands.append({
        "faces": len(face_indices),
        "center": [round(value, 5) for value in center],
        "dims": [round(value, 5) for value in (maximum - minimum)],
    })

if not selected:
    raise RuntimeError("No islands matched the target selection")

bm = bmesh.new()
bm.from_mesh(mesh)
bm.faces.ensure_lookup_table()
remove = [face for face in bm.faces if face.index not in selected]
bmesh.ops.delete(bm, geom=remove, context="FACES")
bmesh.ops.delete(bm, geom=[vertex for vertex in bm.verts if not vertex.link_faces],
                 context="VERTS")
bm.to_mesh(mesh)
bm.free()
mesh.update()

# Recenter horizontally, place the lowest point on z=0.
points = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
low = Vector([min(point[d] for point in points) for d in range(3)])
high = Vector([max(point[d] for point in points) for d in range(3)])
center = (low + high) * 0.5
translation = Matrix.Translation(Vector((-center.x, -center.y, -low.z)))
mesh.transform(translation)
mesh.update()
obj.location = (0, 0, 0)
obj.rotation_euler = (0, 0, 0)
obj.scale = (1, 1, 1)

bpy.ops.object.select_all(action="DESELECT")
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB",
                          use_selection=True, export_apply=True)

mesh.calc_loop_triangles()
out_points = [vertex.co for vertex in mesh.vertices]
out_low = [min(point[d] for point in out_points) for d in range(3)]
out_high = [max(point[d] for point in out_points) for d in range(3)]
triangles = len(mesh.loop_triangles)
digest = sha256(output.read_bytes()).hexdigest()
result = {
    "asset_id": opt.asset_id,
    "source": str(source),
    "source_sha256": sha256(source.read_bytes()).hexdigest(),
    "output": str(output),
    "output_sha256": digest,
    "bytes": output.stat().st_size,
    "triangles": triangles,
    "bounds_m": {
        "min": [round(value, 5) for value in out_low],
        "max": [round(value, 5) for value in out_high],
        "dimensions": [round(out_high[d] - out_low[d], 5) for d in range(3)],
    },
    "selected_islands": len(selected_islands),
    "islands": selected_islands,
    "selection": {
        "target": opt.target,
        "radius": opt.radius,
        "min_x": opt.min_x,
    },
    "object": obj.name,
}
(source.parent / "split-record.json").write_text(json.dumps(result, indent=2) + "\n")

if record_path.is_file():
    record = json.loads(record_path.read_text())
    record["candidate"] = {
        "path": str(output.resolve().relative_to(Path.cwd().resolve())),
        "sha256": digest,
        "bytes": output.stat().st_size,
        "adapted": True,
        "split_record": str((source.parent / "split-record.json").resolve().relative_to(Path.cwd().resolve())),
    }
    record["note"] = ("Extracted one object from a merged Grab3D set. "
                      "Benchmark candidate only; not a Tripo output.")
    record_path.write_text(json.dumps(record, indent=2) + "\n")

print(json.dumps({"ok": True, "output": str(output), "sha256": digest,
                  "triangles": triangles, "dimensions": result["bounds_m"]["dimensions"]}))
