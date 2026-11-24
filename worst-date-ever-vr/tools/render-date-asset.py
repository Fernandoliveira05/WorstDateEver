"""Render candidate views with Blender: blender -b -t 4 -P tools/render-date-asset.py -- --help."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def configure_scene(scene, output):
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if bpy.app.version >= (4, 2, 0) else 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.render.filepath = str(output)
    scene.unit_settings.system = 'METRIC'


def import_candidate(path):
    before = set(bpy.data.objects)
    extension = path.suffix.lower()
    if extension in ('.gltf', '.glb'):
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif extension == '.fbx':
        bpy.ops.import_scene.fbx(filepath=str(path))
    else:
        raise ValueError('Use a .glb, .gltf or .fbx candidate')
    return sorted(set(bpy.data.objects) - before, key=lambda obj: obj.name)


def inspect_meshes(objects, provenance):
    widgets = {bone.custom_shape for obj in objects if obj.type == 'ARMATURE' for bone in obj.pose.bones}
    meshes = [obj for obj in objects if obj.type == 'MESH' and obj not in widgets and
              not obj.hide_render and not obj.name.startswith(('COL_', 'UCX_'))]
    if not meshes:
        raise ValueError('Candidate contains no renderable mesh')
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    high = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    triangles = degenerate = vertices = 0
    for obj in meshes:
        mesh = obj.data
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        vertices += len(mesh.vertices)
        for face in mesh.loop_triangles:
            a, b, c = [obj.matrix_world @ mesh.vertices[idx].co for idx in face.vertices]
            if (b - a).cross(c - a).length_squared <= 1e-18:
                degenerate += 1
    health = triangles > 0 and not degenerate and all(math.isfinite(co) for point in points for co in point)
    return (low, high, {
        'triangleCount': triangles,
        'vertexCount': vertices,
        'degenerateTriangles': degenerate,
        'boundsMeters': {'min': list(low), 'max': list(high), 'dimensions': list(high - low)},
        'pivots': {obj.name: list(obj.matrix_world.translation) for obj in objects if not obj.parent},
        'meshObjects': len(meshes),
        'materialSlots': sum(len(obj.material_slots) for obj in meshes),
        'armatures': {obj.name: len(obj.data.bones) for obj in objects if obj.type == 'ARMATURE'},
        'collisionMarkers': [obj.name for obj in objects if obj.name.startswith(('COL_', 'UCX_'))],
        'gripMarkers': [obj.name for obj in objects if obj.name.startswith(('GRIP_', 'ANCHOR_'))],
        'staticChecks': {
            'provenance': provenance,
            'meshHealth': 'pass' if health else 'fail',
            'scale': 'pending',
            'colliderAndGrip': 'pending',
            'rigIfRequired': 'pending',
            'exportCompatibility': 'pending',
            'questWeb': 'pending',
            'questUnity': 'pending'
        }
    })


def add_studio_point(name, target, position, energy, size):
    lamp = bpy.data.lights.new(name, 'AREA')
    lamp.energy = energy
    lamp.shape = 'DISK'
    lamp.size = size
    light = bpy.data.objects.new(name, lamp)
    bpy.context.scene.collection.objects.link(light)
    light.location = position
    light.rotation_euler = (target - position).to_track_quat('-Z', 'Y').to_euler()


def render_views(output, low, high):
    scene = bpy.context.scene
    scene.world = bpy.data.worlds.new('Candidate studio')
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (.19, .16, .20, 1)
    background.inputs['Strength'].default_value = .55
    center = (low + high) / 2
    radius = max((high - low).length, .03)
    add_studio_point('Key', center, center + Vector((2, -3, 4)) * radius, 380 * radius ** 2, 2.5 * radius)
    add_studio_point('Fill', center, center + Vector((-3, -1, 1)) * radius, 160 * radius ** 2, 2.5 * radius)
    add_studio_point('Rim', center, center + Vector((1, 3, 3)) * radius, 280 * radius ** 2, 2 * radius)
    camera = bpy.data.objects.new('Candidate views', bpy.data.cameras.new('Candidate views'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = radius * 1.12
    views = {
        'front': (0, -1, 0), 'back': (0, 1, 0), 'left': (-1, 0, 0), 'right': (1, 0, 0),
        'top': (0, -.0001, 1), 'three_quarter': (1, -1.6, .65)
    }
    for view, direction in views.items():
        offset = Vector(direction).normalized() * 2.7 * radius
        camera.location = center + offset
        camera.rotation_euler = (-offset).to_track_quat('-Z', 'Y').to_euler()
        configure_scene(scene, output / (view + '.png'))
        bpy.ops.render.render(write_still=True)
    return list(views)


def verify_provenance(path, digest):
    if not path:
        return 'pending'
    entry = json.loads(path.read_text())
    required = ['assetId', 'sourceUrl', 'creator', 'license', 'approvedBy']
    if entry.get('sha256') != digest or not all(isinstance(entry.get(key), str) and entry[key].strip() for key in required):
        return 'fail'
    return 'pass'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--asset', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--venue', type=Path, help='Staged venue .blend with reviewed camera and DateAssetAnchor empty')
    parser.add_argument('--provenance', type=Path, help='Reviewed provenance JSON with asset SHA-256')
    parser.add_argument('--audit-only', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    asset, output = args.asset.resolve(), args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(asset.read_bytes()).hexdigest()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objects = import_candidate(asset)
    low, high, audit = inspect_meshes(objects, verify_provenance(args.provenance, digest))
    audit['assetHash'] = digest
    views = [] if args.audit_only else render_views(output, low, high)
    if not args.audit_only and args.venue:
        bpy.ops.wm.open_mainfile(filepath=str(args.venue.resolve()))
        anchor = bpy.data.objects.get('DateAssetAnchor')
        scene = bpy.context.scene
        if not anchor or not scene.camera:
            raise ValueError('Venue needs DateAssetAnchor and an active comparison camera')
        objects = import_candidate(asset)
        for obj in objects:
            if obj.parent is None:
                obj.matrix_world = anchor.matrix_world @ obj.matrix_world
        configure_scene(scene, output / 'in_scene.png')
        bpy.ops.render.render(write_still=True)
        views.append('in_scene')
    audit['views'] = views
    (output / 'mesh-audit.json').write_text(json.dumps(audit, indent=2) + '\n')


if __name__ == '__main__':
    main()
