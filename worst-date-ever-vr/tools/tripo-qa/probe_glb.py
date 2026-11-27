"""Blender probe: deterministic geometry/material facts for a GLB.

Run indirectly through ``render_asset.py`` (recommended) or directly:

    /tmp/wde-blender-portable/blender --background --python \
      tools/tripo-qa/probe_glb.py -- --model x.glb --output geometry.json

This is evidence for the ``scale`` and ``topology_artifacts`` axes. It is not a
visual judgement: a human or vision reviewer still supplies those scores.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--model", required=True)
parser.add_argument("--output", required=True)
opt = parser.parse_args(args)

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

model = Path(opt.model).resolve()
destination = Path(opt.output).resolve()
if not model.is_file():
    raise FileNotFoundError(str(model))
destination.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(model))

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    raise RuntimeError("No meshes imported: " + str(model))

objects = []
world_points = []
totals = {"vertices": 0, "triangles": 0, "boundary_edges": 0,
          "non_manifold_edges": 0, "degenerate_faces": 0, "loose_vertices": 0}
material_names = set()

for obj in meshes:
    mesh = obj.data
    world_points.extend(obj.matrix_world @ Vector(c) for c in obj.bound_box)
    mesh.calc_loop_triangles()
    triangles = len(mesh.loop_triangles)
    materials = [slot.material.name for slot in obj.material_slots if slot.material]
    material_names.update(materials)

    bm = bmesh.new()
    bm.from_mesh(mesh)
    boundary = sum(1 for edge in bm.edges if len(edge.link_faces) == 1)
    non_manifold = sum(1 for edge in bm.edges if len(edge.link_faces) not in (1, 2))
    degenerate = sum(1 for face in bm.faces if face.calc_area() < 1e-12)
    loose = sum(1 for vert in bm.verts if not vert.link_edges)
    bm.free()

    lo = Vector([min((obj.matrix_world @ Vector(c))[i] for c in obj.bound_box)
                 for i in range(3)])
    hi = Vector([max((obj.matrix_world @ Vector(c))[i] for c in obj.bound_box)
                 for i in range(3)])
    dims = hi - lo

    objects.append({
        "name": obj.name,
        "mesh": mesh.name,
        "vertices": len(mesh.vertices),
        "triangles": triangles,
        "materials": materials,
        "dimensions_m": [round(v, 6) for v in dims],
        "boundary_edges": boundary,
        "non_manifold_edges": non_manifold,
        "degenerate_faces": degenerate,
        "loose_vertices": loose,
        "has_uv": len(mesh.uv_layers) > 0,
        "uv_layers": [layer.name for layer in mesh.uv_layers],
    })
    totals["vertices"] += len(mesh.vertices)
    totals["triangles"] += triangles
    totals["boundary_edges"] += boundary
    totals["non_manifold_edges"] += non_manifold
    totals["degenerate_faces"] += degenerate
    totals["loose_vertices"] += loose

lo = Vector([min(p[i] for p in world_points) for i in range(3)])
hi = Vector([max(p[i] for p in world_points) for i in range(3)])
dims = hi - lo
center = (lo + hi) * 0.5

images = []
for image in bpy.data.images:
    if image.name in {"Render Result", "Viewer Node"}:
        continue
    images.append({
        "name": image.name,
        "size": list(image.size),
        "source": image.source,
        "file_format": image.file_format,
        "has_data": bool(image.has_data),
        "packed": bool(image.packed_file),
    })

payload = {
    "schema_version": "tripo-qa-geometry/1",
    "model": str(model),
    "asset_sha256": __import__("hashlib").sha256(model.read_bytes()).hexdigest(),
    "blender_version": bpy.app.version_string,
    "objects": objects,
    "totals": {
        **totals,
        "mesh_objects": len(meshes),
        "unique_materials": len(material_names),
        "images": len(images),
    },
    "bounds_m": {
        "min": [round(v, 6) for v in lo],
        "max": [round(v, 6) for v in hi],
        "center": [round(v, 6) for v in center],
        "dimensions": [round(v, 6) for v in dims],
        "max_dimension": round(max(dims), 6),
    },
    "materials": sorted(material_names),
    "images": images,
}
destination.write_text(json.dumps(payload, indent=2) + "\n")
print(json.dumps({"ok": True, "output": str(destination),
                  "triangles": totals["triangles"],
                  "dimensions_m": payload["bounds_m"]["dimensions"]}))
