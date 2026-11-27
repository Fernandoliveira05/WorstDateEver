"""Blender background script: render eight orthographic screenshots of a *real* GLB.

Run: blender --background --python tools/render_glb_turntable.py -- \
  --model external/picnic_basket.glb --output results/screenshots/picnic_basket

Requires Blender with glTF importer. This only captures ISOLATED MESHES; real hand pose
and Quest runtime screenshots must come from the actual target clients separately.
"""
import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import sys
from pathlib import Path

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--model', required=True)
ap.add_argument('--output', required=True)
ap.add_argument('--resolution', type=int, default=768)
ap.add_argument('--asset-id', required=True)
ap.add_argument('--view-transform', default=None,
                help="Blender view transform, e.g. Standard or AgX (default: scene default)")
ap.add_argument('--light-scale', type=float, default=1.0,
                help="Multiply the neutral turntable light energies")
opt = ap.parse_args(args)

import bpy
from mathutils import Vector

model_path = Path(opt.model).resolve()
out = Path(opt.output).resolve()
if not model_path.is_file():
    raise FileNotFoundError(str(model_path))
out.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(model_path))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes: raise RuntimeError('No meshes imported: ' + str(model_path))

# Bound the actual imported asset, in world space.
points = [o.matrix_world @ Vector(corner) for o in meshes for corner in o.bound_box]
lo = Vector([min(p[i] for p in points) for i in range(3)])
hi = Vector([max(p[i] for p in points) for i in range(3)])
center = (lo + hi) * 0.5
extent = max((hi - lo).length, 0.05)

camera_data = bpy.data.cameras.new('QA_camera')
camera = bpy.data.objects.new('QA_camera', camera_data)
bpy.context.collection.objects.link(camera)
bpy.context.scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.ortho_scale = extent * 1.35
camera_data.lens = 48

def area_light(name, at, energy, color, size):
    light_data = bpy.data.lights.new(name, type='AREA')
    light_data.energy = energy * opt.light_scale * extent ** 2
    light_data.color = color
    light_data.shape = 'DISK'
    light_data.size = size * extent
    light_obj = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light_obj)
    light_obj.location = center + Vector(at) * extent
    direction = center - light_obj.location
    light_obj.rotation_euler = direction.to_track_quat('-Z','Y').to_euler()

area_light('key', (1.0, -1.4, 1.8), 600, (1.0, 0.89, 0.79), 3.0)
area_light('fill', (-1.2, 0.8, 0.7), 370, (0.88, 0.91, 1.0), 3.4)
area_light('rim', (0.7, 1.4, 1.0), 460, (1.0, 1.0, 1.0), 2.8)

scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=16
scene.cycles.use_denoising=True
scene.render.resolution_x=opt.resolution
scene.render.resolution_y=opt.resolution
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.world.use_nodes=True
scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value=(0.68,0.69,0.71,1.0)
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value=0.8
if opt.view_transform:
    scene.view_settings.view_transform = opt.view_transform
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.display_settings.display_device = 'sRGB'

views={
 'front':(0,-1,0.05), 'back':(0,1,0.05),
 'left':(-1,0,0.05), 'right':(1,0,0.05),
 'top':(0,-0.01,1), 'bottom':(0,-0.01,-1),
 'three_quarter_left':(-1,-1,0.7), 'three_quarter_right':(1,-1,0.7)
}
captures=[]
digest=sha256(model_path.read_bytes()).hexdigest()
for name,vec in views.items():
    direction=Vector(vec).normalized()
    camera.location = center + direction * extent * 2.3
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath = str(out / (name+'.png'))
    bpy.ops.render.render(write_still=True)
    image=Path(scene.render.filepath)
    captures.append({
        'asset_id': opt.asset_id,
        'asset_sha256': digest,
        'filename': image.name,
        'image_sha256': sha256(image.read_bytes()).hexdigest(),
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'engine': 'Blender ' + bpy.app.version_string,
        'renderer': scene.render.engine,
        'camera_position': list(camera.location),
        'camera_rotation_euler': list(camera.rotation_euler),
        'orthographic_scale': camera_data.ortho_scale,
        'objects': [{'mesh': obj.name, 'matrix_world': [list(row) for row in obj.matrix_world]} for obj in meshes],
        'lighting': 'neutral turntable',
        'units': 'meters',
        'hand': None,
        'scene': 'isolated'
    })
(out / 'captures.json').write_text(json.dumps(captures, indent=2) + '\n')

print(f'Rendered {len(views)} screenshots: {out}')
