"""Rebuild the four staged picnic GLBs from the licensed publisher downloads."""
import argparse
from collections import defaultdict
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Vector
import numpy as np


def islands(obj):
    mesh = obj.data
    vertices = [obj.matrix_world @ v.co for v in mesh.vertices]
    leaders = list(range(len(vertices)))

    def root(index):
        while index != leaders[index]:
            leaders[index] = leaders[leaders[index]]
            index = leaders[index]
        return index

    def join(first, second):
        leaders[root(first)] = root(second)

    coincident = {}
    for i, point in enumerate(vertices):
        key = tuple(round(value, 5) for value in point)
        join(i, coincident.setdefault(key, i))
    for edge in mesh.edges:
        join(*edge.vertices)
    groups = defaultdict(list)
    for face in mesh.polygons:
        groups[root(face.vertices[0])].append(face)
    for group in groups.values():
        points = [vertices[i] for face in group for i in face.vertices]
        minimum = Vector([min(point[d] for point in points) for d in range(3)])
        maximum = Vector([max(point[d] for point in points) for d in range(3)])
        yield group, minimum, maximum


def retain(obj, predicate):
    selected = {face.index for faces, lo, hi in islands(obj)
                if predicate(faces, lo, hi) for face in faces}
    if not selected:
        bpy.data.objects.remove(obj, do_unlink=True)
        return
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    mesh.faces.ensure_lookup_table()
    bmesh.ops.delete(mesh, geom=[f for f in mesh.faces if f.index not in selected], context='FACES')
    bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if not v.link_faces], context='VERTS')
    mesh.to_mesh(obj.data)
    mesh.free()


def material(name, rgba):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = rgba
    shader.inputs['Roughness'].default_value = .75
    return mat


def recolor_fabric(objects, field):
    images = set()
    for obj in objects:
        for mat in obj.data.materials:
            shader = mat.node_tree.nodes.get('Principled BSDF')
            if shader and shader.inputs['Base Color'].is_linked:
                image = shader.inputs['Base Color'].links[0].from_node.image
                if image:
                    images.add(image)
            if shader and not shader.inputs['Roughness'].is_linked:
                shader.inputs['Roughness'].default_value = .78
    for image in images:
        pixels = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(pixels)
        rgb = pixels.reshape((-1, 4))[:, :3]
        rgb[:] = field(rgb, *image.size)
        image.pixels.foreach_set(pixels)
        image.update()
        image.pack()


def basket():
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']

    def dusty_rose(rgb, _width, _height):
        r, g, b = rgb.T
        strength = np.clip((r - g * 2.2) * 3.5, 0, .8)
        rose = np.column_stack((r * .74, np.maximum(g, r * .22), np.maximum(b, r * .30)))
        return rgb * (1 - strength[:, None]) + rose * strength[:, None]

    recolor_fabric(objects, dusty_rose)


def blanket():
    fabric = bpy.data.objects['picnic-blanket_body']
    retain(fabric, lambda _faces, lo, hi: min(hi.x - lo.x, hi.y - lo.y) > 1.35 and hi.z < .035)

    def woven_checks(rgb, width, height):
        y, x = np.ogrid[:height, :width]
        u, v = x / width, y / height
        dark = np.array((.082, .158, .142))
        cream = np.array((.65, .44, .27))
        rose = np.array((.47, .161, .18))
        vertical = (u * 5 % 1) < .49
        horizontal = (v * 5 % 1) < .49
        base = np.where((vertical & horizontal)[..., None], dark,
                        np.where((vertical | horizontal)[..., None], cream, rose))
        # Short staggered yarn stitches keep the texture matte and readable
        # at arm's length while averaging cleanly into the distance mips.
        warp = np.cos((u * 130 + .5 * (np.floor(v * 132) % 2)) * np.pi * 2)
        weft = np.cos((v * 132 + .5 * (np.floor(u * 130) % 2)) * np.pi * 2)
        yarn = (.89 + .085 * warp + .055 * weft).ravel()
        shading = rgb @ np.array((.2126, .7152, .0722), dtype=np.float32)
        shading = .83 + .22 * np.clip(shading, 0, 1)
        return base.reshape((-1, 3)) * (shading * yarn)[:, None]

    recolor_fabric([fabric], woven_checks)
    fringe_vertices, fringe_faces = [], []
    for side in (-1, 1):
        for index in range(40):
            x = -.718 + index * .0368
            if side < 0 and x < -.22:
                continue  # The source has a clipped corner along this edge.
            start = len(fringe_vertices)
            end = side * (.767 + .008 * (index % 3))
            for y, width, center in ((side * .738, .010, .013), (end, .008, .007)):
                fringe_vertices.extend([(x - width, y, center), (x, y, center + .004),
                                        (x + width, y, center), (x, y, center - .004)])
            for i in range(4):
                face = (start + i, start + (i + 1) % 4, start + (i + 1) % 4 + 4, start + i + 4)
                fringe_faces.append(face if side > 0 else face[::-1])
            cap = tuple(start + i + 4 for i in range(4))
            fringe_faces.append(cap if side > 0 else cap[::-1])
    fringe_data = bpy.data.meshes.new('Rose yarn fringe')
    fringe_data.from_pydata(fringe_vertices, [], fringe_faces)
    fringe = bpy.data.objects.new('Rose yarn fringe', fringe_data)
    bpy.context.collection.objects.link(fringe)
    fringe.data.materials.append(material('Dusty rose thread', (.44, .152, .175, 1)))
    bpy.ops.object.select_all(action='DESELECT')
    fabric.select_set(True)
    fringe.select_set(True)
    bpy.context.view_layer.objects.active = fabric
    bpy.ops.object.join()

    fabric.shape_key_add(name='Basis')
    edges = {'Front': (1, -.741), 'Back': (1, .741), 'Left': (0, -.741), 'Right': (0, .741)}
    conversion = fabric.matrix_world.inverted().to_3x3()
    for edge, (axis, border) in edges.items():
        along = 1 - axis
        low = -.20 if edge == 'Front' else -.56
        for suffix, station in [('Low', low), ('', 0), ('High', .56)]:
            key = fabric.shape_key_add(name='Pull' + edge + suffix)
            point = Vector((0, 0))
            point[axis], point[along] = border, -station if axis == 0 else station
            push = Vector((0, 0, .24))
            push[axis] = .05 if border > 0 else -.05
            for vertex in fabric.data.vertices:
                distance = ((fabric.matrix_world @ vertex.co).to_2d() - point).length
                influence = max(0, 1 - distance / .48) ** 2
                key.data[vertex.index].co = vertex.co + conversion @ (push * influence)


def sandwich():
    eggplant = material('Roasted aubergine', (.27, .097, .063, 1))
    pepper = material('Roasted golden pepper', (.68, .34, .073, 1))
    for obj in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
        if obj.name != 'sandwich_right':
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        retain(obj, lambda _faces, _lo, hi: hi.z < .060)
        obj.data.materials.append(eggplant)
        obj.data.materials.append(pepper)
        for faces, lo, hi in islands(obj):
            # The source has three bread layers, two lettuce layers and two
            # distinct thin filling layers. Replace the latter's baked colors.
            if .029 < lo.z < .031 and .037 < hi.z < .040:
                for face in faces:
                    face.material_index = len(obj.data.materials) - 2
            if .027 <= lo.z < .028 and hi.z < .032:
                for face in faces:
                    face.material_index = len(obj.data.materials) - 1
        obj.location.x -= .057
        obj.location.y -= .012
        obj.name = 'Vegan sandwich'

    # A folded kraft sleeve supports one half and gives the fingers a clean edge.
    outline = [(-.066,-.033,.010),(-.022,-.047,.008),(.061,-.030,.009),
               (.067,-.020,.032),(.027,-.039,.028),(-.025,-.041,.025),
               (-.064,-.020,.030),(-.058,.025,.009),(.052,.030,.009)]
    faces = [(0,1,2,8,7),(0,6,5,1),(1,5,4,2),(2,4,3,8)]
    paper_mesh = bpy.data.meshes.new('Kraft sleeve')
    paper_mesh.from_pydata(outline, [], faces)
    paper = bpy.data.objects.new('Kraft sleeve', paper_mesh)
    bpy.context.collection.objects.link(paper)
    paper.data.materials.append(material('Warm matte kraft', (.63,.40,.22,1)))
    shell = paper.modifiers.new('Paper thickness', 'SOLIDIFY')
    shell.thickness = .0012
    shell.offset = 0
    bpy.context.view_layer.objects.active = paper
    bpy.ops.object.modifier_apply(modifier=shell.name)


def kombucha():
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for obj in objects:
        def central(_faces, lo, hi):
            # The downloaded bottle trio shares glass and trim meshes.
            # Retain only the central bottle, omitting all fruit decorations.
            return lo.x > -.052 and hi.x < .052 and lo.y > .008
        if obj.name.endswith('_body'):
            def trim(faces, lo, hi):
                fruit_logo = hi.z < .129 and lo.z > .055 and hi.x - lo.x < .067
                return central(faces, lo, hi) and not fruit_logo
            retain(obj, trim)
        else:
            retain(obj, central)
    body = bpy.data.objects['juice-bottle_body']
    # Preserve the publisher's glass and fill geometry. Replace the opaque label
    # and screw cap with the swing-top closure shown in the park concept.
    retain(body, lambda _faces, _lo, _hi: False)
    glass = bpy.data.objects['juice-bottle_bottles_glass']
    glass_material = material('Clear bottle glass', (.91, .97, 1.0, 1))
    shader = glass_material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Transmission Weight'].default_value = .94
    shader.inputs['Roughness'].default_value = .14
    shader.inputs['IOR'].default_value = 1.43
    glass.data.materials.clear()
    glass.data.materials.append(glass_material)

    liquid = bpy.data.objects['juice-bottle_orange_juice_glass']
    juice = material('Amber kombucha', (.54, .105, .005, 1))
    for vertex in liquid.data.vertices:
        vertex.co.z = .0045 + (vertex.co.z - .0045) * .83
    juice.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = .24
    liquid.data.materials.clear()
    liquid.data.materials.append(juice)

    def stopper_part(name, radius, depth, height, rgba):
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=depth, location=(0, .0565, height))
        part = bpy.context.object
        part.name = name
        part.data.materials.append(material(name, rgba))
        edge = part.modifiers.new('Rounded rim', 'BEVEL')
        edge.width = .0018
        edge.segments = 2
        bpy.ops.object.modifier_apply(modifier=edge.name)

    stopper_part('Rose rubber seal', .018, .006, .247, (.48, .094, .050, 1))
    stopper_part('Cream ceramic stopper', .017, .012, .255, (.89, .76, .56, 1))
    wire = material('Swing-top wire', (.53, .55, .56, 1))
    wire_shader = wire.node_tree.nodes.get('Principled BSDF')
    wire_shader.inputs['Metallic'].default_value = .72
    wire_shader.inputs['Roughness'].default_value = .34
    for side in (-1, 1):
        curve = bpy.data.curves.new('Swing-top loop', type='CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = .00115
        curve.bevel_resolution = 1
        spline = curve.splines.new('BEZIER')
        spline.bezier_points.add(4)
        for joint, (x, y, z) in zip(spline.bezier_points, (
                (.012, .055, .255), (.021, .054, .252), (.026, .055, .225),
                (.019, .047, .216), (.014, .047, .224))):
            joint.co = (side * x, y, z)
            joint.handle_left_type = joint.handle_right_type = 'AUTO'
        loop = bpy.data.objects.new('Swing-top loop', curve)
        bpy.context.collection.objects.link(loop)
        loop.data.materials.append(wire)
        bpy.context.view_layer.objects.active = loop
        bpy.ops.object.select_all(action='DESELECT')
        loop.select_set(True)
        bpy.ops.object.convert(target='MESH')

    for obj in bpy.context.scene.objects:
        if obj.parent is None:
            obj.location += Vector((-.003, -.0565, 0))


ASSETS = {
    'picnic_basket': ('picnic-basket', basket),
    'picnic_blanket': ('picnic-blanket', blanket),
    'picnic_sandwich': ('sandwich', sandwich),
    'picnic_kombucha': ('juice-bottle', kombucha),
}


def main():
    args = argparse.ArgumentParser()
    args.add_argument('root', type=Path)
    args.add_argument('--asset', choices=ASSETS)
    args.add_argument('--output', type=Path)
    options = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
    root = options.root.resolve()
    output = options.output.resolve() if options.output else root / 'candidates'
    output.mkdir(parents=True, exist_ok=True)
    for asset, (slug, adapt) in ASSETS.items():
        if options.asset and asset != options.asset:
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(root / 'sources' / asset / f'{slug}.glb'))
        adapt()
        bpy.ops.export_scene.gltf(filepath=str(output / f'{asset}.glb'), export_format='GLB')


if __name__ == '__main__':
    main()
