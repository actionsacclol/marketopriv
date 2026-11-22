"""Prototype scene kit for Blender 5.x (tested on 5.2.2 LTS).

Imported by looks.py / demo.py / bench.py via sys.path. Everything is procedural:
no external assets except Blender's own bundled Inter font.

Sections: scene/engine setup + looks, materials, compositor (bloom), easing keys,
geometry helpers, props, text + labels, camera rigs, cutaway/x-ray, svg icons.
"""
import bpy, bmesh, math, os, random, time
from mathutils import Vector, Euler
from bpy_extras import anim_utils

# ----------------------------------------------------------------------------- looks
# Each look = engine settings + palette + material recipe. 'shade' picks the material builder.
LOOKS = {
    'clay': dict(engine='EEVEE', samples=16, raytrace=True, shade='pbr', vt='Khronos PBR Neutral', look='None', light=0.55,
                 world=(0.62, 0.58, 0.55), world_strength=0.35, bloom=0,
                 pal=dict(bg=(0.95, 0.70, 0.58), primary=(0.92, 0.88, 0.82), secondary=(0.95, 0.55, 0.45),
                          accent=(0.40, 0.62, 0.95), dark=(0.30, 0.30, 0.34), metal=(0.90, 0.78, 0.45), text=(0.97, 0.95, 0.92)),
                 rough=0.75, coat=0.0, emit=0.0, metal_ok=False),
    'plastic': dict(engine='EEVEE', samples=16, raytrace=True, shade='pbr', vt='Khronos PBR Neutral', look='None', light=0.6,
                    world=(0.35, 0.30, 0.55), world_strength=0.4, bloom=0.0,
                    pal=dict(bg=(0.36, 0.20, 0.85), primary=(0.95, 0.95, 0.97), secondary=(1.0, 0.30, 0.55),
                             accent=(0.15, 0.85, 1.0), dark=(0.08, 0.08, 0.12), metal=(1.0, 0.75, 0.25), text=(1, 1, 1)),
                    rough=0.22, coat=0.8, emit=1.5, metal_ok=True),
    'toon': dict(engine='EEVEE', samples=8, raytrace=False, shade='toon', vt='Standard', look='None', outline='hull',
                 world=(1, 1, 1), world_strength=0.4, bloom=0,
                 pal=dict(bg=(0.98, 0.80, 0.30), primary=(0.97, 0.97, 0.97), secondary=(0.95, 0.30, 0.35),
                          accent=(0.20, 0.55, 1.0), dark=(0.18, 0.18, 0.24), metal=(1.0, 0.78, 0.20), text=(1, 1, 1)),
                 rough=0.5, coat=0, emit=0, metal_ok=False),
    'lowpoly': dict(engine='EEVEE', samples=16, raytrace=False, shade='pbr', vt='Khronos PBR Neutral', look='None', lowpoly=True, light=0.55,
                    world=(0.55, 0.75, 0.95), world_strength=0.35, bloom=0,
                    pal=dict(bg=(0.45, 0.78, 0.70), primary=(0.95, 0.92, 0.85), secondary=(0.98, 0.45, 0.30),
                             accent=(0.25, 0.50, 0.90), dark=(0.22, 0.25, 0.32), metal=(1.0, 0.80, 0.30), text=(1, 1, 1)),
                    rough=0.85, coat=0, emit=0.5, metal_ok=False),
    'iso': dict(engine='EEVEE', samples=16, raytrace=True, shade='pbr', vt='Khronos PBR Neutral', look='None', camera='iso', light=0.5,
                world=(0.85, 0.88, 0.95), world_strength=0.35, bloom=0,
                pal=dict(bg=(0.62, 0.70, 1.0), primary=(0.97, 0.97, 1.0), secondary=(0.40, 0.35, 0.95),
                         accent=(0.10, 0.80, 0.70), dark=(0.20, 0.22, 0.35), metal=(1.0, 0.75, 0.30), text=(0.20, 0.22, 0.35)),
                rough=0.6, coat=0, emit=0.3, metal_ok=False),
    'neon': dict(engine='EEVEE', samples=16, raytrace=True, shade='pbr', vt='AgX', look='AgX - Punchy',
                 world=(0.004, 0.003, 0.012), world_strength=1.0, bloom=0.6,
                 pal=dict(bg=(0.012, 0.010, 0.025), primary=(0.05, 0.05, 0.08), secondary=(1.0, 0.15, 0.65),
                          accent=(0.1, 0.8, 1.0), dark=(0.02, 0.02, 0.03), metal=(0.7, 0.7, 0.8), text=(0.85, 0.95, 1.0)),
                 rough=0.25, coat=0.5, emit=14.0, metal_ok=True, floor_rough=0.12, text_emit=3.0),
    'workbench': dict(engine='WORKBENCH', shade='pbr', vt='Standard', look='None',
                      world=(0.2, 0.2, 0.25), world_strength=1, bloom=0,
                      pal=dict(bg=(0.30, 0.22, 0.60), primary=(0.92, 0.92, 0.95), secondary=(1.0, 0.35, 0.55),
                               accent=(0.20, 0.80, 1.0), dark=(0.12, 0.12, 0.16), metal=(1.0, 0.78, 0.30), text=(1, 1, 1)),
                      rough=0.4, coat=0, emit=0, metal_ok=False),
}

L = None          # active look dict
_MATS = {}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()


def setup(look_name='plastic', res=(1080, 1920), fps=30, frames=(1, 120), **over):
    """Fresh scene with render settings for a look. `over` overrides look keys (samples, raytrace, bloom...)."""
    global L
    reset()
    L = dict(LOOKS[look_name]); L.update(over); L['name'] = look_name
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.fps = fps
    sc.frame_start, sc.frame_end = frames
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    sc.render.image_settings.compression = 15
    sc.render.use_persistent_data = True
    if L['engine'] == 'EEVEE':
        sc.render.engine = 'BLENDER_EEVEE'          # 5.x id (was BLENDER_EEVEE_NEXT in 4.2-4.x)
        e = sc.eevee
        e.taa_render_samples = L.get('samples', 16)
        e.use_raytracing = L.get('raytrace', False)
        e.ray_tracing_method = 'SCREEN'
        e.use_shadows = L.get('shadows', True)
        e.shadow_ray_count = 1
        e.shadow_step_count = L.get('shadow_steps', 6)
        e.use_fast_gi = L.get('fast_gi', False)
        sc.render.use_motion_blur = L.get('motion_blur', False)
        if sc.render.use_motion_blur:
            e.motion_blur_steps = L.get('mb_steps', 1)
            sc.render.motion_blur_shutter = 0.5
    elif L['engine'] == 'WORKBENCH':
        sc.render.engine = 'BLENDER_WORKBENCH'
        sh = sc.display.shading
        sh.light = 'STUDIO'
        sh.color_type = 'MATERIAL'
        sh.show_cavity = True; sh.cavity_type = 'BOTH'
        sh.show_shadows = True; sh.shadow_intensity = 0.35
        sh.show_object_outline = True; sh.object_outline_color = (0.05, 0.05, 0.08)
        sh.show_specular_highlight = True
        sc.display.render_aa = '16'
    elif L['engine'] == 'CYCLES':
        sc.render.engine = 'CYCLES'
        sc.cycles.samples = L.get('samples', 32)
        sc.cycles.use_denoising = True
        sc.cycles.device = L.get('device', 'CPU')
        if sc.cycles.device == 'GPU':
            p = bpy.context.preferences.addons['cycles'].preferences
            p.compute_device_type = L.get('gpu_api', 'OPTIX')
            p.get_devices()
            for d in p.devices:
                d.use = d.type != 'CPU'
    sc.view_settings.view_transform = L['vt']
    sc.view_settings.exposure = L.get('exposure', 0.0)
    if L['look'] != 'None':
        sc.view_settings.look = L['look']
    w = bpy.data.worlds.new('world'); sc.world = w
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (*L['world'], 1); bg.inputs[1].default_value = L['world_strength']
    if L['engine'] == 'WORKBENCH':
        sc.display.shading.background_type = 'WORLD' if False else sc.display.shading.background_type
        w.color = L['pal']['bg']
    if L.get('bloom'):
        add_bloom(L['bloom'])
    return sc


def add_bloom(strength=0.6, threshold=1.0, kind='Bloom', size=0.6):
    """5.x compositor: a node *group* assigned to scene.compositing_node_group, ending in Group Output
    (no Composite node, no scene.node_tree). Glare options are input sockets now (Type is a menu socket)."""
    sc = bpy.context.scene
    ng = bpy.data.node_groups.new('post', 'CompositorNodeTree')
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = ng.nodes.new('CompositorNodeRLayers')
    gl = ng.nodes.new('CompositorNodeGlare')
    gl.inputs['Type'].default_value = kind
    gl.inputs['Quality'].default_value = 'Medium'
    gl.inputs['Threshold'].default_value = threshold
    gl.inputs['Strength'].default_value = strength
    gl.inputs['Size'].default_value = size
    out = ng.nodes.new('NodeGroupOutput')
    ng.links.new(rl.outputs['Image'], gl.inputs['Image'])
    ng.links.new(gl.outputs['Image'], out.inputs[0])
    sc.compositing_node_group = ng
    return gl


# ----------------------------------------------------------------------------- materials
def _toon(name, color, outline=False):
    m = bpy.data.materials.new(name)
    nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    if outline:
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = (0.03, 0.03, 0.05, 1)
        nt.links.new(em.outputs[0], o.inputs[0])
        m.use_backface_culling = True          # inverted hull: only the far side of the shell shows
        m.diffuse_color = (0.03, 0.03, 0.05, 1)
        return m
    d = nt.nodes.new('ShaderNodeBsdfDiffuse'); d.inputs[0].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new('ShaderNodeShaderToRGB')
    ramp = nt.nodes.new('ShaderNodeValToRGB'); cr = ramp.color_ramp; cr.interpolation = 'CONSTANT'
    cr.elements[0].position = 0.0; cr.elements[0].color = (*[c * 0.55 for c in color], 1)
    cr.elements[1].position = 0.18; cr.elements[1].color = (*color, 1)
    e2 = cr.elements.new(0.75); e2.color = (*[min(1, c * 1.12 + 0.06) for c in color], 1)
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(d.outputs[0], s2r.inputs[0])
    nt.links.new(s2r.outputs['Color'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs[0], o.inputs[0])
    m.diffuse_color = (*color, 1)
    return m


def mat(role, emit=None, rough=None, metal=None, alpha=None, color=None):
    """Material for a palette role under the active look; cached per (role, args)."""
    key = (role, emit, rough, metal, alpha, color)
    if key in _MATS:
        return _MATS[key]
    if role == 'outline':
        m = _toon('outline', (0, 0, 0), outline=True); _MATS[key] = m; return m
    col = color or L['pal'][role]
    if L['shade'] == 'toon':
        m = _toon('t_' + role, col)
        _MATS[key] = m
        return m
    if role == 'outline':
        m = _toon('outline', (0, 0, 0), outline=True); _MATS[key] = m; return m
    m = bpy.data.materials.new('m_' + role)
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*col, 1)
    r = rough if rough is not None else L['rough']
    if role == 'bg':
        r = L.get('floor_rough', max(r, 0.5))
    p.inputs['Roughness'].default_value = r
    mt = metal if metal is not None else (1.0 if role == 'metal' and L['metal_ok'] else 0.0)
    p.inputs['Metallic'].default_value = mt
    if L['coat'] and role not in ('bg',):
        p.inputs['Coat Weight'].default_value = L['coat']; p.inputs['Coat Roughness'].default_value = 0.08
    es = emit if emit is not None else (L['emit'] if role == 'accent' else (L.get('text_emit', 0.0) if role == 'text' else 0.0))
    if es:
        p.inputs['Emission Color'].default_value = (*col, 1)
        p.inputs['Emission Strength'].default_value = es
    if alpha is not None:
        p.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'     # 4.2+: replaces blend_method for EEVEE
        m.use_transparency_overlap = False
    m.diffuse_color = (*col, 1 if alpha is None else alpha)   # Workbench uses viewport colour
    m.roughness = r; m.metallic = mt
    _MATS[key] = m
    return m


# ----------------------------------------------------------------------------- easing / keys
def _fcurves(idb):
    ad = idb.animation_data
    if not ad or not ad.action:
        return []
    cb = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)   # 4.4+ layered actions
    return cb.fcurves if cb else []


def key(target, path, frame, value=None, interp='BEZIER', easing='AUTO'):
    """Set + keyframe target.<path> at frame; interp/easing apply to the segment AFTER this key.
    interp: CONSTANT LINEAR BEZIER SINE QUAD CUBIC QUART QUINT EXPO CIRC BACK BOUNCE ELASTIC."""
    if value is not None:
        cur = getattr(target, path)
        if hasattr(cur, '__len__') and not hasattr(value, '__len__'):
            value = [value] * len(cur)
        setattr(target, path, value)
    target.keyframe_insert(path, frame=frame)
    full = target.path_from_id(path) if target != target.id_data else path
    for fc in _fcurves(target.id_data):
        if fc.data_path == full:
            for kp in fc.keyframe_points:
                if abs(kp.co.x - frame) < 0.01:
                    kp.interpolation = interp; kp.easing = easing


def pop_in(obj, frame, dur=8, overshoot=True, final=None):
    s = final or tuple(obj.scale)
    key(obj, 'scale', frame, (0.001, 0.001, 0.001), 'BACK' if overshoot else 'CUBIC', 'EASE_OUT')
    key(obj, 'scale', frame + dur, s)


def slide_in(obj, frame, offset=(0, 0, -3), dur=12):
    end = Vector(obj.location)
    key(obj, 'location', frame, end + Vector(offset), 'EXPO', 'EASE_OUT')
    key(obj, 'location', frame + dur, end)


def float_idle(obj, f0, f1, amp=0.08, period=60):
    """Gentle bob: SINE keys every half period."""
    base = Vector(obj.location); f = f0; up = True
    while f <= f1:
        key(obj, 'location', f, base + Vector((0, 0, amp if up else -amp)), 'SINE', 'EASE_IN_OUT'); f += period // 2; up = not up


def add_noise(obj, path='rotation_euler', strength=0.02, scale=12):
    """Handheld shake via an F-curve Noise modifier (needs at least one key on path)."""
    for fc in _fcurves(obj):
        if fc.data_path == path:
            n = fc.modifiers.new('NOISE'); n.strength = strength; n.scale = scale; n.phase = random.random() * 100


# ----------------------------------------------------------------------------- geometry helpers
def _link(obj, coll=None):
    (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def lp():
    return bool(L and L.get('lowpoly'))


def finish(obj, material, bevel=0.0, segs=3, smooth=True, outline=True):
    """Assign material, optional bevel, smooth/flat shading, toon outline hull."""
    obj.data.materials.append(material)
    if bevel:
        b = obj.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 1 if lp() else segs
        b.limit_method = 'ANGLE'; b.harden_normals = not lp()
    if obj.type == 'MESH':
        obj.data.shade_smooth() if (smooth and not lp()) else obj.data.shade_flat()
    if outline and L and L.get('outline') == 'hull':
        add_hull(obj)
    return obj


def add_hull(obj, thick=0.025):
    if 'outline' not in [m.name for m in obj.data.materials]:
        obj.data.materials.append(mat('outline'))
    s = obj.modifiers.new('hull', 'SOLIDIFY')
    s.thickness = thick; s.offset = 1; s.use_flip_normals = True; s.use_rim = False
    s.material_offset = len(obj.data.materials) - 1 - 0   # point at outline slot
    s.material_offset = len(obj.data.materials) - 1


def box(name, size=(1, 1, 1), loc=(0, 0, 0), material=None, bevel=0.04, parent=None, origin='center', rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
        if origin == 'bottom':
            v.co.z += size[2] / 2
    bm.to_mesh(me); bm.free()
    o = _link(bpy.data.objects.new(name, me)); o.location = loc; o.rotation_euler = rot
    if parent:
        o.parent = parent
    if material:
        finish(o, material, bevel=bevel)
    return o


def cylinder(name, r=0.5, depth=0.2, loc=(0, 0, 0), material=None, segs=64, bevel=0.02, parent=None, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10 if lp() else segs, radius1=r, radius2=r, depth=depth)
    bm.to_mesh(me); bm.free()
    o = _link(bpy.data.objects.new(name, me)); o.location = loc; o.rotation_euler = rot
    if parent:
        o.parent = parent
    if material:
        finish(o, material, bevel=bevel)
    return o


def torus(name, R=0.5, r=0.06, loc=(0, 0, 0), material=None, parent=None, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    nu, nv = (12, 4) if lp() else (48, 12)
    verts = []
    for i in range(nu):
        a = 2 * math.pi * i / nu
        ring = []
        for j in range(nv):
            b = 2 * math.pi * j / nv
            ring.append(bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b))))
        verts.append(ring)
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((verts[i][j], verts[(i + 1) % nu][j], verts[(i + 1) % nu][(j + 1) % nv], verts[i][(j + 1) % nv]))
    bm.normal_update(); bm.to_mesh(me); bm.free()
    o = _link(bpy.data.objects.new(name, me)); o.location = loc; o.rotation_euler = rot
    if parent:
        o.parent = parent
    if material:
        finish(o, material, bevel=0)
    return o


def prism(name, pts, depth=0.2, loc=(0, 0, 0), material=None, bevel=0.03, parent=None, rot=(0, 0, 0)):
    """2D outline in the XZ plane (faces the -Y camera) extruded along Y. Base for icons/arrows/cursor/shield."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]
    f = bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=[f]) if False else None
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in ext['geom']:
        if isinstance(v, bmesh.types.BMVert):
            v.co.y += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = _link(bpy.data.objects.new(name, me)); o.location = loc; o.rotation_euler = rot
    if parent:
        o.parent = parent
    if material:
        finish(o, material, bevel=bevel, smooth=False)
        o.data.shade_smooth()
    return o


def cyclorama(material, width=60, floor=30, radius=5, height=30, y0=4):
    """Seamless studio backdrop: floor curving up into a wall behind the subject."""
    prof = [(-floor, 0)]
    n = 4 if lp() else 16
    for i in range(n + 1):
        a = -math.pi / 2 + (math.pi / 2) * i / n
        prof.append((y0 + radius * math.cos(a), radius + radius * math.sin(a)))
    prof.append((y0 + radius, height))
    verts, faces = [], []
    for x in (-width / 2, width / 2):
        for y, z in prof:
            verts.append((x, y, z))
    m = len(prof)
    for i in range(m - 1):
        faces.append((i, i + 1, m + i + 1, m + i))
    me = bpy.data.meshes.new('cyc'); me.from_pydata(verts, [], faces); me.update()
    o = _link(bpy.data.objects.new('cyc', me)); o.data.materials.append(material)
    o.data.shade_smooth()
    return o


# ----------------------------------------------------------------------------- props
def empty(name, loc=(0, 0, 0), parent=None):
    e = _link(bpy.data.objects.new(name, None)); e.location = loc
    if parent:
        e.parent = parent
    return e


def pc_tower(loc=(0, 0, 0), scale=1.0, xray=False):
    """Mid-tower PC: bevelled case, front fans with accent rings, glass side, internals (board, RAM, GPU)."""
    root = empty('pc', loc); root.scale = (scale,) * 3
    W, D, H = 1.1, 2.2, 2.4
    # xray=True gives the case its own BLENDED material at alpha 1 so xray_fade() can animate it
    shell_m = mat('primary', alpha=1.0) if xray else mat('primary')
    case = box('case', (W, D, H), (0, 0, H / 2), shell_m, bevel=0.06, parent=root)
    box('front', (W * 0.86, 0.05, H * 0.9), (0, -D / 2 - 0.01, H / 2), mat('dark'), bevel=0.02, parent=root)
    for i, z in enumerate((0.55, 1.2, 1.85)):
        torus('fan%d' % i, 0.3, 0.035, (0, -D / 2 - 0.05, z), mat('accent'), parent=root, rot=(math.radians(90), 0, 0))
        cylinder('hub%d' % i, 0.09, 0.04, (0, -D / 2 - 0.05, z), mat('dark'), parent=root, rot=(math.radians(90), 0, 0), segs=24)
    box('led', (0.06, 0.03, 0.06), (W * 0.33, -D / 2 - 0.05, H * 0.93), mat('secondary', emit=6), bevel=0.01, parent=root)
    # internals visible through glass / x-ray
    box('board', (0.04, D * 0.8, H * 0.8), (-W * 0.38, 0, H / 2), mat('dark'), bevel=0.01, parent=root)
    for j in range(2):
        box('ram%d' % j, (0.05, 0.08, 0.9), (-W * 0.3, 0.2 + j * 0.15, H * 0.62), mat('secondary', emit=2.0), bevel=0.01, parent=root)
    box('gpu', (0.5, D * 0.6, 0.12), (-W * 0.1, -0.15, H * 0.35), mat('dark'), bevel=0.02, parent=root)
    box('gpu_strip', (0.02, D * 0.55, 0.03), (W * 0.15, -0.15, H * 0.38), mat('accent'), bevel=0, parent=root)
    return root


def ram_stick(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    root = empty('ram', loc); root.rotation_euler = rot; root.scale = (scale,) * 3
    box('pcb', (2.6, 0.06, 0.75), (0, 0, 0), mat('dark'), bevel=0.02, parent=root)
    box('heat', (2.5, 0.16, 0.55), (0, 0, 0.12), mat('secondary'), bevel=0.04, parent=root)
    box('strip', (2.3, 0.18, 0.05), (0, 0, 0.36), mat('accent'), bevel=0.01, parent=root)
    pins = box('pins', (0.05, 0.065, 0.12), (-1.2, 0, -0.38), mat('metal', metal=1.0, rough=0.3), bevel=0, parent=root)
    a = pins.modifiers.new('arr', 'ARRAY'); a.count = 30; a.relative_offset_displace = (1.65, 0, 0)
    return root


def cpu_chip(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0, label='K'):
    root = empty('cpu', loc); root.rotation_euler = rot; root.scale = (scale,) * 3
    box('substrate', (1.6, 1.6, 0.1), (0, 0, 0), mat('accent', emit=0.0), bevel=0.03, parent=root)
    box('ihs', (1.15, 1.15, 0.12), (0, 0, 0.1), mat('metal', metal=1.0, rough=0.35), bevel=0.05, parent=root)
    t = text(label, size=0.6, loc=(0, 0, 0.17), material=mat('dark'), extrude=0.01, parent=root, face='up')
    return root


def phone(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0, screen=None):
    root = empty('phone', loc); root.rotation_euler = rot; root.scale = (scale,) * 3
    box('body', (1.0, 0.1, 2.0), (0, 0, 0), mat('dark'), bevel=0.14, parent=root)
    box('screen', (0.9, 0.02, 1.88), (0, -0.05, 0), screen or mat('accent', emit=2.5), bevel=0.1, parent=root)
    return root


def bars(values, loc=(0, 0, 0), width=0.5, gap=0.25, maxh=2.5, roles=('accent', 'secondary', 'primary', 'metal')):
    """Bar chart; each bar's origin is at its base so scale.z animates growth."""
    root = empty('bars', loc); out = []
    n = len(values); x0 = -(n - 1) * (width + gap) / 2; mx = max(values)
    for i, v in enumerate(values):
        b = box('bar%d' % i, (width, width, maxh * v / mx), (x0 + i * (width + gap), 0, 0), mat(roles[i % len(roles)]),
                bevel=0.05, parent=root, origin='bottom')
        out.append(b)
    return root, out


def coin(loc=(0, 0, 0), rot=(math.radians(90), 0, 0), r=0.6, symbol='$'):
    root = empty('coin', loc); root.rotation_euler = rot
    cylinder('disc', r, 0.14, (0, 0, 0), mat('metal', metal=1.0 if L['metal_ok'] else 0.0, rough=0.25), parent=root, bevel=0.03)
    torus('rim', r * 0.82, 0.03, (0, 0, 0.07), mat('metal', metal=1.0 if L['metal_ok'] else 0.0, rough=0.25), parent=root)
    text(symbol, size=r * 1.0, loc=(0, 0, 0.07), material=mat('metal', metal=1.0 if L['metal_ok'] else 0.0, rough=0.25), extrude=0.03, parent=root, face='up')
    return root


def shield_pts(w=1.0, h=1.25, n=12):
    pts = [(-w / 2, h / 2), (0, h / 2 + 0.08), (w / 2, h / 2)]
    for i in range(1, n + 1):           # right side curving to the point
        t = i / n; pts.append((w / 2 * (1 - t ** 1.8), h / 2 - h * t))
    for i in range(n - 1, 0, -1):
        t = i / n; pts.append((-w / 2 * (1 - t ** 1.8), h / 2 - h * t))
    return pts


def shield(loc=(0, 0, 0), size=1.0, role='accent'):
    o = prism('shield', [(x * size, z * size) for x, z in shield_pts()], 0.18 * size, loc, mat(role), bevel=0.04 * size)
    return o


CURSOR = [(0, 0), (0, -1.0), (0.24, -0.76), (0.42, -1.12), (0.55, -1.06), (0.38, -0.7), (0.72, -0.7)]
ARROW = [(-0.5, -0.12), (0.15, -0.12), (0.15, -0.32), (0.55, 0), (0.15, 0.32), (0.15, 0.12), (-0.5, 0.12)]
CHECK = [(-0.5, 0.0), (-0.32, 0.18), (-0.12, -0.02), (0.36, 0.46), (0.54, 0.28), (-0.12, -0.38)]


def cursor(loc=(0, 0, 0), size=1.0):
    return prism('cursor', [(x * size, z * size) for x, z in CURSOR], 0.12 * size, loc, mat('primary'), bevel=0.02 * size)


def arrow(loc=(0, 0, 0), size=1.0, rot=(0, 0, 0), role='secondary'):
    return prism('arrow', [(x * size, z * size) for x, z in ARROW], 0.15 * size, loc, mat(role), bevel=0.03 * size, rot=rot)


def svg_icon(path, loc=(0, 0, 0), size=1.0, depth=0.1, material=None):
    """Import an SVG (io_curve_svg add-on, enabled by default) -> extruded curves joined under an empty."""
    before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=path)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'CURVE']
    root = empty('icon', loc)
    if not new:
        return root
    # normalise size/centre
    mn = Vector((1e9, 1e9, 1e9)); mx = -mn
    for o in new:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c); mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    span = max(mx.x - mn.x, mx.y - mn.y) or 1; ctr = (mn + mx) / 2
    for o in new:
        o.data.extrude = depth / (size / span) / 2
        o.data.bevel_depth = 0.0
        o.data.materials.clear(); o.data.materials.append(material or mat('primary'))
        o.parent = root
        o.matrix_parent_inverse.identity()
        o.location = (o.location - ctr) * (size / span)
        o.scale = (size / span,) * 3
    root.rotation_euler = (math.radians(90), 0, 0)
    return root


# ----------------------------------------------------------------------------- text + labels
FONT_DIR = os.path.join(bpy.utils.system_resource('DATAFILES'), 'fonts')


def font(path=None):
    """Bundled Inter (Blender ships Inter.woff2, OFL). Pass a .ttf/.otf/.woff2 to override; variable font loads Regular."""
    path = path or os.path.join(FONT_DIR, 'Inter.woff2')
    for f in bpy.data.fonts:
        if bpy.path.abspath(f.filepath) == path:
            return f
    return bpy.data.fonts.load(path)


def text(body, size=0.8, loc=(0, 0, 0), material=None, extrude=0.06, bevel=0.012, parent=None, face='camera',
         font_path=None, bold=0.0, align='CENTER'):
    cu = bpy.data.curves.new('txt', 'FONT'); cu.body = body
    cu.font = font(font_path); cu.size = size; cu.extrude = extrude; cu.bevel_depth = bevel; cu.bevel_resolution = 1 if lp() else 3
    cu.align_x = align; cu.align_y = 'CENTER'; cu.offset = bold        # offset > 0 fakes a heavier weight
    o = _link(bpy.data.objects.new('txt', cu)); o.location = loc
    if parent:
        o.parent = parent
    if face == 'front':
        o.rotation_euler = (math.radians(90), 0, 0)
    o.data.materials.append(material or mat('text'))
    if L and L.get('outline') == 'hull' and face != 'up':
        o.data.materials.append(mat('outline'))
        s = o.modifiers.new('hull', 'SOLIDIFY'); s.thickness = 0.02; s.offset = 1; s.use_flip_normals = True; s.material_offset = 1
    return o


def face_camera(obj, cam):
    """Billboard: copy the camera's rotation so text stays parallel to the image plane (no skew)."""
    c = obj.constraints.new('COPY_ROTATION'); c.target = cam
    return obj


def label(body, anchor, cam, offset=(0.9, 0, 0.6), size=0.28, role='dark'):
    """Pill label that faces the camera next to an anchor point. Text is measured from its evaluated
    bounding box so the pill fits and the text is centred (align_y alone does not centre caps)."""
    root = empty('label', Vector(anchor) + Vector(offset))
    face_camera(root, cam)
    t = text(body, size=size, loc=(0, 0, 0.035), material=mat('text', emit=0.0), extrude=0.0, bevel=0, parent=root, face='up')
    bpy.context.view_layer.update()
    xs = [c[0] for c in t.bound_box]; ys = [c[1] for c in t.bound_box]
    t.location.x -= (min(xs) + max(xs)) / 2; t.location.y -= (min(ys) + max(ys)) / 2
    w = (max(xs) - min(xs)) + size * 1.1; h = (max(ys) - min(ys)) + size * 0.9
    pill = box('pill', (w, h, 0.06), (0, 0, 0), mat(role), bevel=h * 0.49, parent=root)
    pill.modifiers['bevel'].limit_method = 'NONE'; pill.modifiers['bevel'].segments = 2 if lp() else 8
    pill.modifiers['bevel'].affect = 'VERTICES'      # round the 4 corners only -> pill shape
    pill.modifiers['bevel'].use_clamp_overlap = False
    return root


# ----------------------------------------------------------------------------- lights + camera
def light_rig(kind='studio'):
    sc = bpy.context.scene
    def area(name, loc, energy, size, color=(1, 1, 1), target=(0, 0, 1.5)):
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy * L.get('light', 1.0); ld.size = size; ld.color = color
        o = _link(bpy.data.objects.new(name, ld)); o.location = loc
        d = Vector(target) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        return o
    if kind == 'toon':
        ld = bpy.data.lights.new('sun', 'SUN'); ld.energy = 3.0; ld.angle = 0.05
        o = _link(bpy.data.objects.new('sun', ld)); o.rotation_euler = (math.radians(50), math.radians(10), math.radians(30))
        return
    if kind == 'neon':
        area('key', (4, -5, 7), 250, 3, (0.8, 0.85, 1.0))
        area('rimL', (-5, 3, 3), 600, 2, (1.0, 0.2, 0.7))
        area('rimR', (5, 3, 3), 600, 2, (0.1, 0.7, 1.0))
        return
    area('key', (4, -6, 7), 1500, 6)
    area('fill', (-6, -4, 3), 400, 6, (0.9, 0.95, 1.0))
    area('rim', (0, 6, 6), 900, 4)


def camera(loc=(0, -11, 3.2), target=(0, 0, 2.0), lens=35, iso=False, ortho_scale=9.0):
    """Camera with a TRACK_TO empty. Returns (cam, target_empty, pivot) - pivot is a parent empty for orbits."""
    sc = bpy.context.scene
    pivot = empty('cam_pivot', target)
    tgt = empty('cam_target', target)
    cd = bpy.data.cameras.new('cam'); cd.lens = lens; cd.sensor_fit = 'AUTO'
    cam = _link(bpy.data.objects.new('cam', cd)); cam.parent = pivot
    cam.location = Vector(loc) - Vector(target)
    if iso:
        cd.type = 'ORTHO'; cd.ortho_scale = ortho_scale
        d = 30; cam.location = (d * math.sin(math.radians(45)), -d * math.cos(math.radians(45)), d * math.tan(math.radians(35.264)))
    tc = cam.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
    sc.camera = cam
    cd.clip_end = 300
    return cam, tgt, pivot


def orbit(pivot, f0, f1, deg=40, interp='SINE'):
    key(pivot, 'rotation_euler', f0, pivot.rotation_euler[:], interp, 'EASE_IN_OUT')
    r = list(pivot.rotation_euler); r[2] += math.radians(deg)
    key(pivot, 'rotation_euler', f1, r)


def push_in(cam, f0, f1, factor=0.6, interp='QUART'):
    """Dolly toward the target (camera is parented to the pivot at the target, so scale its offset)."""
    key(cam, 'location', f0, cam.location[:], interp, 'EASE_IN_OUT')
    key(cam, 'location', f1, (Vector(cam.location) * factor)[:])


def zoom(cam, f0, f1, lens_to, interp='EXPO'):
    key(cam.data, 'lens', f0, cam.data.lens, interp, 'EASE_IN_OUT')
    key(cam.data, 'lens', f1, lens_to)


def retarget(tgt, f0, f1, to, interp='CUBIC'):
    key(tgt, 'location', f0, tgt.location[:], interp, 'EASE_IN_OUT')
    key(tgt, 'location', f1, to)


def hud_text(body, cam, y=2.2, dist=8.0, size=0.7, **kw):
    """3D text parented to the camera so it stays in frame while the camera moves (headline slot)."""
    t = text(body, size=size, loc=(0, 0, 0), **kw)
    t.parent = cam; t.location = (0, y, -dist); t.rotation_euler = (0, 0, 0)
    return t


def screen_anchors(objs, frames):
    """Per-frame 2D positions (0..1, top-left origin) of objects for overlays drawn by the app."""
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene; out = {o.name: [] for o in objs}
    for f in frames:
        sc.frame_set(f)
        for o in objs:
            p = world_to_camera_view(sc, sc.camera, o.matrix_world.translation)
            out[o.name].append([f, round(p.x, 4), round(1 - p.y, 4), round(p.z, 3)])
    return out


# ----------------------------------------------------------------------------- cutaway / x-ray
def xray_fade(obj_or_mat, f0, f1, to_alpha=0.1):
    """X-ray reveal. Principled materials: animate the 'Alpha' socket. Any other shader (toon): insert
    Mix(Transparent, surface) before the output and animate its factor. Material is set to BLENDED."""
    m = obj_or_mat if isinstance(obj_or_mat, bpy.types.Material) else obj_or_mat.active_material
    m.surface_render_method = 'BLENDED'
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    if p:
        sock = p.inputs['Alpha']
    else:
        out = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeOutputMaterial'][0]
        src = out.inputs['Surface'].links[0].from_socket
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mix = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(src, mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs['Surface'])
        sock = mix.inputs['Fac']; sock.default_value = 1.0
    key(sock, 'default_value', f0, sock.default_value, 'CUBIC', 'EASE_IN_OUT')
    key(sock, 'default_value', f1, to_alpha)


def cutaway(obj, f0, f1, axis=0, size=4.0):
    """Boolean cut with an animated (render-hidden) cutter box sliding into the object."""
    c = box('cutter', (size, size, size), Vector(obj.matrix_world.translation) + Vector((size * 1.5 if axis == 0 else 0, 0, 1)))
    c.hide_render = True; c.display_type = 'WIRE'
    b = obj.modifiers.new('cut', 'BOOLEAN'); b.operation = 'DIFFERENCE'; b.object = c; b.solver = 'EXACT'
    end = Vector(c.location); end[axis] -= size * 0.9
    key(c, 'location', f0, c.location[:], 'CUBIC', 'EASE_IN_OUT'); key(c, 'location', f1, end[:])
    return c


# ----------------------------------------------------------------------------- render helpers
def render_still(path, frame=1, twice=True):
    """Render one frame; returns (cold_s, warm_s). Cold includes shader compilation."""
    sc = bpy.context.scene; sc.frame_set(frame); sc.render.filepath = path
    t = time.time(); bpy.ops.render.render(write_still=True); cold = time.time() - t
    warm = None
    if twice:
        t = time.time(); bpy.ops.render.render(write_still=True); warm = time.time() - t
    return cold, warm


def render_anim(dirpath, step=1):
    sc = bpy.context.scene; sc.frame_step = step
    sc.render.filepath = os.path.join(dirpath, 'f_')
    t = time.time(); bpy.ops.render.render(animation=True); el = time.time() - t
    n = len(range(sc.frame_start, sc.frame_end + 1, step))
    return el, n
