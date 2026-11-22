"""Render the same comparison scene in one look.
blender -b --factory-startup -P looks.py -- <look> <out.png> [json overrides]
"""
import bpy, sys, os, json, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit

argv = sys.argv[sys.argv.index('--') + 1:]
look, out = argv[0], argv[1]
over = json.loads(argv[2]) if len(argv) > 2 else {}
res = tuple(over.pop('res', (1080, 1920)))
frame = over.pop('frame', 1)
lines = over.pop('lines', None)          # 'freestyle' | 'lineart' | None
anim = over.pop('anim', 0)               # >0: render that many frames of a camera orbit instead of a still
step = over.pop('step', 1)
fmt = over.pop('fmt', 'PNG')

t_all = time.time()
sc = kit.setup(look, res=res, frames=(1, 30), **over)
L = kit.L
kit.cyclorama(kit.mat('bg'))
cam, tgt, pivot = kit.camera(loc=(3.2, -12, 4.0), target=(0, 0, 2.5), lens=38, iso=L.get('camera') == 'iso', ortho_scale=12.5)
kit.light_rig('toon' if L['shade'] == 'toon' else ('neon' if look == 'neon' else 'studio'))

pc = kit.pc_tower(loc=(0.3, 0.8, 0), scale=1.15)
pc.rotation_euler = (0, 0, math.radians(-28))
kit.ram_stick(loc=(-1.0, -2.2, 1.0), rot=(math.radians(8), 0, math.radians(20)), scale=0.75)
kit.cpu_chip(loc=(1.7, -2.4, 0.9), rot=(math.radians(62), math.radians(-12), math.radians(12)), scale=0.9)
kit.coin(loc=(-1.6, -1.0, 3.6), rot=(math.radians(75), math.radians(20), 0), r=0.55)
broot, bl = kit.bars([0.35, 0.6, 1.0], loc=(2.6, 1.2, 0), width=0.45, maxh=2.2)
kit.shield(loc=(-2.2, 0.6, 2.3), size=1.0, role='secondary')
kit.arrow(loc=(1.9, -0.6, 3.5), size=0.9, rot=(0, math.radians(-35), 0), role='accent')
head = kit.text('+40% FPS', size=0.95, loc=(0, -1.5, 5.6), extrude=0.12, bevel=0.02, bold=0.01)
kit.face_camera(head, cam)
kit.label('RAM 32 GB', (-1.0, -2.2, 1.0), cam, offset=(0.2, -0.4, -0.55), size=0.26)

if lines == 'freestyle':
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = 'ABSOLUTE'; sc.render.line_thickness = 2.2
    vl = bpy.context.view_layer
    ls = vl.freestyle_settings.linesets[0] if vl.freestyle_settings.linesets else vl.freestyle_settings.linesets.new('ls')
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new('line')
    ls.linestyle.color = (0.03, 0.03, 0.05)
elif lines == 'lineart':
    bpy.ops.object.grease_pencil_add(type='LINEART_SCENE')
    la = bpy.context.object
    la.modifiers[0].radius = 0.004
    la.modifiers[0].use_intersection = True

print('BUILD', round(time.time() - t_all, 2))
if anim:
    sc.frame_start, sc.frame_end = 1, anim
    kit.orbit(pivot, 1, anim, deg=30)
    kit.key(pc, 'rotation_euler', 1, pc.rotation_euler[:], 'LINEAR')
    kit.key(pc, 'rotation_euler', anim, (0, 0, pc.rotation_euler[2] + 0.6))
    if fmt == 'FFMPEG':   # 5.x: media_type must be set before file_format
        ims = sc.render.image_settings; ims.media_type = 'VIDEO'; ims.file_format = 'FFMPEG'
        sc.render.ffmpeg.format = 'MPEG4'; sc.render.ffmpeg.codec = 'H264'; sc.render.ffmpeg.constant_rate_factor = 'HIGH'
    if fmt == 'JPEG':
        sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 92
    d = out[:-4]
    os.makedirs(d, exist_ok=True)
    # warm-up: compile shaders on frame 1 first so the timing is per-frame cost only
    t = time.time(); sc.frame_set(1); bpy.ops.render.render(); cold = time.time() - t
    el, n = kit.render_anim(d, step)
    print(f'RESULT look={look} over={json.dumps(over)} lines={lines} res={res} ANIM frames={n} step={step} fmt={fmt} first={cold:.2f}s per_frame={el/n:.3f}s anim_total={el:.1f}s')
    sys.exit(0)
cold, warm = kit.render_still(out, frame)
print(f'RESULT look={look} over={json.dumps(over)} lines={lines} res={res} cold={cold:.2f}s warm={warm:.2f}s total={time.time()-t_all:.1f}s')
