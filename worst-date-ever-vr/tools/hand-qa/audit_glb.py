"""Audit real imported triangles and material bindings for staged candidates."""
from collections import Counter
from hashlib import sha256
import json
import math
from pathlib import Path
import sys

import bpy


def audit(source):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    bpy.context.view_layer.update()
    faces = Counter()
    triangles = degenerate = missing_uv = vertices = 0
    bounds = [[math.inf] * 3, [-math.inf] * 3]
    meshes = []
    for obj in (obj for obj in bpy.context.scene.objects if obj.type == 'MESH'):
        mesh = obj.data
        mesh.calc_loop_triangles()
        points = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
        vertices += len(points)
        triangles += len(mesh.loop_triangles)
        missing_uv += int(not mesh.uv_layers)
        for point in points:
            if not all(map(math.isfinite, point)):
                raise ValueError(f'Non-finite vertex in {obj.name}')
            for i, value in enumerate(point):
                bounds[0][i] = min(bounds[0][i], value)
                bounds[1][i] = max(bounds[1][i], value)
        for face in mesh.loop_triangles:
            a, b, c = (points[index] for index in face.vertices)
            if (b-a).cross(c-a).length_squared < 1e-20:
                degenerate += 1
                continue
            key = tuple(sorted(tuple(round(value, 6) for value in vertex) for vertex in (a, b, c)))
            faces[key] += 1
        meshes.append({
            'name': obj.name,
            'triangle_count': len(mesh.loop_triangles),
            'material_slots': [mat.name for mat in mesh.materials if mat],
            'shape_keys': list(mesh.shape_keys.key_blocks.keys())[1:] if mesh.shape_keys else [],
            'pivot_m': list(obj.matrix_world.translation),
        })
    if not triangles:
        raise ValueError('No mesh triangles')
    return {
        'asset_id': source.stem, 'asset_sha256': sha256(source.read_bytes()).hexdigest(),
        'auditor': 'Blender ' + bpy.app.version_string, 'triangle_count': triangles,
        'vertex_count': vertices, 'degenerate_triangles': degenerate,
        'exact_coincident_triangles': sum(n-1 for n in faces.values() if n > 1),
        'meshes_missing_uvs': missing_uv, 'bounds_m_blender_z_up': bounds, 'meshes': meshes,
        'images': [{'name': image.name, 'size_px': list(image.size)}
                   for image in bpy.data.images if image.source in ('FILE', 'GENERATED')],
        'limits': ['Exact coincidences only. Partial overlaps and flicker require in-engine inspection.',
                   'UV presence does not establish texture quality or VR performance.']
    }


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    root = Path(args[0]).resolve()
    for source in sorted(root.joinpath('candidates').glob('*.glb')):
        output = root / 'evidence' / source.stem
        output.mkdir(parents=True, exist_ok=True)
        result = audit(source)
        (output / 'mesh-audit.json').write_text(json.dumps(result, indent=2) + '\n')
        print(source.stem, result['triangle_count'], result['exact_coincident_triangles'])


if __name__ == '__main__':
    main()
