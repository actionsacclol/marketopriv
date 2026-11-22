"""~4 s demo shot built from kit blocks: pop-in reveal, orbit + push-in camera rig, x-ray case fade,
glowing internals, camera-facing label, camera-parented 3D headline, idle float, handheld noise.
blender -b --factory-startup -P demo.py -- <look> <outdir> [json overrides]
Writes PNG frames + anchors.json (2D positions for app-drawn overlays) and prints timings.
"""
import bpy, sys, os, json, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
from mathutils import Vector

T0 = time.time()
argv = sys.argv[sys.argv.index('--') + 1:]
look, outdir = argv[0], argv[1]
over = json.loads(argv[2]) if len(argv) > 2 else {}
res = tuple(over.pop('res', (1080, 1920)))
step = over.pop('step', 1)
headline = over.pop('headline', True)
os.makedirs(outdir, exist_ok=True)

FPS, N = 30, 120
sc = kit.setup(look, res=res, fps=FPS, frames=(1, N), **over)
L = kit.L
cyc = kit.cyclorama(kit.mat('bg'))
kit.light_rig('toon' if L['shade'] == 'toon' else ('neon' if look == 'neon' else 'studio'))
cam, tgt, pivot = kit.camera(loc=(3.0, -10.5, 3.6), target=(0, 0, 1.5), lens=36)
bpy.context.view_layer.update(); cyc.parent = pivot; cyc.matrix_parent_inverse = pivot.matrix_world.inverted()   # backdrop turns with the orbit: no edge in shot

# --- hero: PC tower with an x-ray-able case
pc = kit.pc_tower(loc=(0, 0, 0), scale=1.15, xray=True)
pc.rotation_euler = (0, 0, math.radians(-20))
case = [o for o in pc.children if o.name.startswith('case')][0]
kit.pop_in(pc, 1, dur=14)                                         # BACK ease-out overshoot
kit.key(pc, 'rotation_euler', 1, (0, 0, math.radians(-80)), 'EXPO', 'EASE_OUT')
kit.key(pc, 'rotation_euler', 22, (0, 0, math.radians(-20)), 'LINEAR')
kit.key(pc, 'rotation_euler', N, (0, 0, math.radians(-8)))

# --- camera: slow orbit round to the side + push-in, small handheld noise
kit.orbit(pivot, 10, 100, deg=55)
kit.push_in(cam, 25, 95, factor=0.78)
kit.retarget(tgt, 25, 95, (0, 0, 1.75))
kit.add_noise(pivot, 'rotation_euler', strength=0.006, scale=25)

# --- x-ray: case fades to glass, internals glow brighter
kit.xray_fade(case, 40, 62, to_alpha=0.12)
ram = [o for o in pc.children if o.name.startswith('ram')]
for r in ram:
    if 'Principled BSDF' not in r.active_material.node_tree.nodes:
        break   # toon shader: no emission ramp
    em = r.active_material.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
    kit.key(em, 'default_value', 50, 2.0, 'CUBIC', 'EASE_IN_OUT'); kit.key(em, 'default_value', 70, 9.0)
    break   # RAM sticks share one material

# --- label that faces the camera, pops in once the RAM is visible
anchor = ram[0]
bpy.context.view_layer.update()
lab = kit.label('32 GB RAM', anchor.matrix_world.translation, cam, offset=(1.0, -0.8, 1.3), size=0.26, role='dark')
kit.pop_in(lab, 68, dur=10)

# --- headline: 3D text parented to the camera (alternative: app-drawn 2D text using anchors.json)
if headline:
    h = kit.hud_text('WHERE THE FPS HIDES', cam, y=2.55, dist=9.0, size=0.42, extrude=0.05, bevel=0.006)
    kit.pop_in(h, 6, dur=10)


# 2D anchors for overlays the app draws (labels/arrows/captions that must follow 3D objects)
anchors = kit.screen_anchors([anchor, pc], range(1, N + 1, 1))
json.dump({'fps': FPS, 'res': res, 'anchors': anchors}, open(os.path.join(outdir, 'anchors.json'), 'w'))

T_build = time.time() - T0
t = time.time(); sc.frame_set(1); sc.render.filepath = os.path.join(outdir, 'warm'); bpy.ops.render.render(write_still=False)
T_first = time.time() - t
el, n = kit.render_anim(outdir, step)
print(f'RESULT demo look={look} res={res} step={step} frames={n} build={T_build:.2f}s first(compile)={T_first:.2f}s '
      f'anim={el:.1f}s per_frame={el/n:.3f}s blender_total={time.time()-T0:.1f}s')
