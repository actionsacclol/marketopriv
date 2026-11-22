"""Prop gallery: every kit prop in one still (checks the builders incl. SVG import).
blender -b --factory-startup -P props.py -- <look> <out.png>
"""
import bpy, sys, os, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit

argv = sys.argv[sys.argv.index('--') + 1:]
look, out = argv[0], argv[1]
sc = kit.setup(look, res=(1080, 1920))
kit.cyclorama(kit.mat('bg'))
kit.light_rig('toon' if kit.L['shade'] == 'toon' else 'studio')
cam, tgt, pivot = kit.camera(loc=(0, -16, 5.5), target=(0, 0, 3.2), lens=36)
R = math.radians
kit.pc_tower(loc=(-1.9, 1.0, 0), scale=0.8).rotation_euler = (0, 0, R(-25))
kit.ram_stick(loc=(1.6, 0, 0.6), rot=(0, 0, R(-15)), scale=0.6)
kit.cpu_chip(loc=(1.6, 0, 1.9), rot=(R(70), 0, R(-10)), scale=0.7)
kit.phone(loc=(-1.9, -0.5, 3.4), rot=(0, 0, R(18)), scale=0.85)
kit.coin(loc=(0.0, 0, 3.4), rot=(R(80), R(15), 0), r=0.55)
kit.shield(loc=(1.8, 0, 3.4), size=1.0, role='accent')
b, bl = kit.bars([0.4, 0.7, 1.0], loc=(-0.1, 1.5, 0), width=0.4, maxh=1.6)
kit.cursor(loc=(-2.0, -0.5, 5.6), size=0.9)
kit.arrow(loc=(0.0, 0, 5.3), size=1.0, rot=(0, R(-30), 0))
kit.prism('check', [(x * 1.3, z * 1.3) for x, z in kit.CHECK], 0.15, (1.8, 0, 5.2), kit.mat('secondary'), bevel=0.03)
icon = kit.svg_icon(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bolt.svg'), loc=(0, 0, 6.9), size=1.3, depth=0.15, material=kit.mat('metal'))
t = kit.text('PROPS', size=0.8, loc=(0, -0.5, 8.3), extrude=0.1); kit.face_camera(t, cam)
cold, warm = kit.render_still(out, 1)
print(f'RESULT props look={look} cold={cold:.2f}s warm={warm:.2f}s')
