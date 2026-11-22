# Blender 3D explainer pipeline: technical research and tests (2026-11-21)

**Scope.** This is the technical side of a "3D explainer" reel style:
- The app ships a Python scene kit.
- The AI writes a short JSON plan.
- The app runs `blender -b --factory-startup -P kit.py -- plan.json`.
- The app adds narration, captions and music itself.

What content performs is covered in a separate report.

**Test machine.** Blender 5.2.2 LTS (Windows, OpenGL backend unless noted), RTX 3080, i7-10700K, ffmpeg 9.0. Every timing below was measured here unless it is marked as an estimate or as sourced.

**Durable copies.** The scripts, the best previews and the demo mp4s are copied to `C:\Users\Krypt\Desktop\marketo\docs\research\blender-pipeline-2026-11-21\`. The working folder below is in the temp scratchpad and can be cleared by a reboot.

**Working folder.** `C:\Users\Krypt\AppData\Local\Temp\claude\de4208d6039045e2\0b5ae803-ce15-43dd-b57a-60a7f24f5712\scratchpad\blender-tech\`

| File | What it is |
|---|---|
| `kit.py` | Prototype scene kit (~690 lines): looks, materials, bloom, easing keys, props, text, labels, camera rigs, x-ray, cutaway, SVG icons, 2D anchors |
| `looks.py` | One comparison scene rendered in any look. Options: `anim` (orbit animation), `fmt` (PNG/JPEG/FFMPEG), `lines` (freestyle/lineart), `res` |
| `demo.py` + `demo.sh` | The 4 s demo shot, then ffmpeg to mp4 |
| `props.py` | Gallery of every prop, including the SVG import |
| `run.sh` | Timing runner |
| `results.log`, `demo_results.log` | Raw timings |
| `logs/` | Per-run Blender logs |
| `out/` | Full-size renders |
| `prev/` | 540-wide previews and contact sheets |
| `probe.py`, `probe2.py` | API probes |

---

## 0. Summary

- **Feasible and fast on a good GPU.** With EEVEE at 1080x1920, a 4-second (120-frame) shot takes **50 to 75 s end to end** on the RTX 3080. That covers process start, scene build, shader warm-up, render and ffmpeg encode. Per frame, the looks run **0.23 to 0.55 s**.
- **Recommended default look: "soft plastic"** (EEVEE, 16 samples, Khronos PBR Neutral view transform). Measured 0.49 s/frame.
  - **Cheaper alternative:** "toon with inverted-hull outlines", the most distinctive and cheapest real look at 0.29 s/frame.
  - **Fallback for weak GPUs:** Workbench, 0.23 s/frame, or 0.14 s/frame at 720p.
- **Cycles is not a fallback.** Cycles on the CPU took 28 s per frame at 1080p (32 samples).
- **Shader compilation is the hidden cost.**
  - The very first EEVEE render on a machine took 20 s for compiling alone.
  - Each new material or setting variant costs 3 to 14 s more the first time.
  - After that, the driver's shader cache makes later runs warm (1.1 to 1.9 s).
  - Plan a one-time "warm-up render" when Blender is set up, and keep the kit's material set small and fixed.
- **Weak PCs (estimates).** A GTX 1650 should land around 2 to 2.5 s per frame at 1080p, and Iris Xe or other integrated graphics around 4 to 6 s. Render at 720x1280 with 8 samples and upscale with ffmpeg, keep 3D to short shots, and let the app draw all flat text.
- **Draw flat text in the app.** The kit should export per-frame 2D anchor positions (done in the demo) so the app can draw labels, numbers and captions as crisp 2D overlays. 3D text should be kept for one hero word at most.
- **Licences.**
  - Blender stays a separate program found on the user's PC. Do not bundle it: about 400 MB and GPL obligations.
  - `kit.py` imports bpy, so per Blender's FAQ it should be published under the GPL. The Electron app calling Blender on the command line is a separate program.
  - Fonts: Inter (OFL) ships inside Blender. Assets: Poly Haven, Kenney, Quaternius and ambientCG are all CC0.
- **Minimum version.** Require **Blender 5.0+**, recommend 5.2 LTS (supported to 2028-07). Supporting 4.5 LTS (needed for Intel Macs) would take about three small shims and is untested.

---

## 1. Looks: renders and measured cost

### 1.1 Method

- **Scene.** One comparison scene, built only from kit props: PC tower, RAM stick, CPU chip, coin, bars, shield, arrow, 3D headline and a camera-facing label, on a curved cyclorama backdrop. Rendered at 1080x1920.
- **Stills.** Each still was rendered twice in one process. "Cold" includes shader compilation; "warm" is the true per-frame cost plus about 0.1 s of single-render overhead.
- **Animated runs.** A 30-frame orbit animation after a warm-up frame gives the real per-frame rate, PNG writing included.
- **Command.** `run.sh <name> <look> '<json overrides>'`

### 1.2 Results

All rows at 1080x1920. Preview paths are relative to `...\scratchpad\blender-tech\prev\`.

| Look | Engine / key settings | Still warm (s) | **Anim s/frame** | Preview |
|---|---|---|---|---|
| **Soft plastic** (recommended) | EEVEE, 16 spp, raytracing on, Khronos PBR Neutral, coat 0.8, rough 0.22 | 0.58 | **0.49** | `look_plastic.png` |
| Clay / toy | EEVEE, 16 spp, raytracing, PBR Neutral, rough 0.75, pastel | 0.51 | **0.45** | `look_clay.png` |
| Toon, inverted-hull outline | EEVEE, 8 spp, Shader-to-RGB + constant ColorRamp, Solidify hull, Standard view | 0.37 | **0.29** (4 spp: 0.27) | `look_toon.png` |
| Toon + Freestyle lines | as above, Freestyle 2.2 px instead of hull | 1.16 | **1.09** | `look_toon_freestyle.png` |
| Toon + Line Art (Grease Pencil) | as above, LINEART_SCENE object | 0.83 | not timed | `look_toon_lineart.png` (lines too faint, needs tuning) |
| Low-poly | EEVEE, 16 spp, raytracing off, flat shading, 10-segment cylinders | 0.42 | **0.37** | `look_lowpoly.png` |
| Isometric | EEVEE, orthographic camera at 35.264°/45° | 0.52 | **0.46** | `look_iso.png` (this layout doesn't suit iso) |
| Neon on dark | EEVEE, 16 spp, raytracing (glossy floor reflections), emission 14, Glare bloom | 0.66 | **0.55** | `look_neon.png` |
| Workbench | Studio light, cavity, outline, shadows, 16x AA | 0.29 | **0.23** (720p still: 0.14) | `look_workbench.png` |
| Cycles CPU (fallback test) | 32 spp + OIDN denoise | 27.9 | n/a | `cycles_cpu_32.png` |
| Cycles CPU 720p | 16 spp + denoise | 7.3 | n/a | `cycles_cpu_16_720.png` |

**Contact sheet of all looks:** `prev\all_looks.png`. A durable copy is in `docs\research\blender-pipeline-2026-11-21\previews\`.

### 1.3 Settings that matter

Measured on the plastic look, 30-frame animations, s/frame.

| Setting | s/frame | Note |
|---|---|---|
| 1 sample | 0.42 (still) | Too noisy |
| 4 samples | 0.35 | Slightly grainy on soft shadows |
| **8 samples** | **0.41** | Fine for 720p and weak PCs |
| **16 samples** | **0.49** | Default |
| 32 samples | 0.72 | |
| 64 samples | 1.01 (still) | |
| Raytracing off | 0.42 | Saves about 15%. Loses glossy floor reflections and contact-shadow detail; fine for clay and toon |
| Shadows off | 0.43 (still) | Small saving. **Triggered a fresh 13.6 s shader compile**, because every new setting combination is a new shader variant |
| Fast GI on | 0.51 (still) | No visible win for these scenes |
| **Bloom** (compositor Glare, "Bloom", Medium quality) | 0.506 vs 0.493 | About +0.01 s, effectively free. The neon look without bloom: 0.56 still vs 0.66 with |
| **Motion blur** (`render.use_motion_blur`, 1 or 4 steps) | 0.46 | **No measurable cost**. EEVEE 4.2+ spreads the shutter across its samples. Visible blur on moving parts: `prev\mb_compare.png` (left off, right on). Recommended on |
| AgX vs Khronos PBR Neutral vs Standard | same | **AgX (even "Punchy") washes out saturated brand colours**; PBR Neutral keeps them (`prev\sheet3.png`: AgX Punchy, PBR Neutral, Standard, AgX Very High Contrast). Use PBR Neutral for PBR looks and Standard for toon (exact palette colours) |
| Output: PNG / JPEG q92 / **direct FFMPEG H.264** | 0.48 / 0.39 / **0.36** | PNG compression and writing cost about 0.1 s/frame and 1.8 MB/frame (218 MB of PNGs for 4 s). Writing mp4 straight from Blender saves 25% and the disk churn |
| 720x1280 | 0.28 | 0.32 in the demo, about 40% less. ffmpeg lanczos upscale to 1080x1920 is in the encode pass at no extra cost |
| Every other frame (`frame_step=2`) | 0.47 per rendered frame | Half the frames. Then ffmpeg `framerate=fps=30` (blend, 1.7 s) or `minterpolate=mci` (smooth but **24.7 s** CPU for 4 s, too slow) |
| **Vulkan backend** (`--gpu-backend vulkan`) | **0.40** vs 0.52 (OpenGL), demo | About 24% faster per frame. First run spent 9.8 s building pipelines, 0.5 s after that |

**Vulkan caveat.** Vulkan is not the default in 5.x and is riskier on old or iGPU drivers. Try it only after a test render, and fall back to OpenGL on failure.

**Fixed overhead per run:**
- Blender process start and exit: **about 2.3 s**.
- Scene build: **0.12 to 0.25 s**.
- First frame (shader warm-up): **1.1 to 1.9 s** when the driver cache is warm.
- First frame on a cold driver cache: **up to 20 s**. Measured 20.4 s on the very first EEVEE render, 13.6 s for a new setting variant, 5.2 s for the first BLENDED (x-ray) material.

**The shader cache is the driver's** (NVIDIA GLCache/DXCache). Blender 5.2 does not appear to keep its own persistent EEVEE cache, and a driver update can wipe it. So:
- Ship a fixed, small set of material recipes per look.
- Run a 1-frame warm-up render of a "kitchen-sink" scene (every material of every enabled look) when the user sets Blender up.
- Never generate shaders from AI input. The AI picks palette tokens only.

### 1.4 What each look needs (lessons from the renders)

**Soft plastic / clay**
- Lights: a three-light area rig (key 1500 W·0.6, fill, rim), with world strength 0.35 to 0.4.
- Backdrop: a **seamless cyclorama** (floor curving into the wall). Parent it to the camera pivot during orbits, or its edge comes into shot. The demo hit this and fixed it with `view_layer.update()` before setting `matrix_parent_inverse`.
- The "toy" read comes from bevels with `harden_normals` plus a coat layer. Plastic uses Coat Weight 0.8 and roughness 0.22; clay uses roughness 0.75 with no coat.

**Toon**
- Shader: Diffuse BSDF → Shader to RGB → 3-stop constant ColorRamp → Emission. A sun lamp gives crisp cel shadows.
- Outline: inverted hull, i.e. a Solidify modifier with `use_flip_normals`, `offset=1`, `material_offset` pointing to a black emission material with `use_backface_culling=True`.
- It is cheap, readable on phones, and the palette stays exact under the Standard view transform.
- Gotchas:
  - Add the hull **after** Array modifiers (the RAM pins showed a hull drawn before the array).
  - When x-raying a hulled object, also hide the hull: `modifier.show_render` keyed off. Otherwise the inner shell shows as a grey box (`prev\demo_toon_clay.png`).
  - The text hull doubles letters a little. Give 3D text no hull, or a thinner one.
- Shader-to-RGB is EEVEE-only. Neither Workbench nor Cycles can render this look.

**Freestyle**
- Cleaner, more complete lines (inner edges and creases) at **3.8 times the frame cost** (1.09 vs 0.29 s/frame).
- In 5.x the line set has no linestyle by default; create one with `bpy.data.linestyles.new()`.

**Line Art (GP v3)**
- `bpy.ops.object.grease_pencil_add(type='LINEART_SCENE')` works in background mode.
- The first try gave faint lines. Its `radius` property is in metres, and the GP material needs work.
- Skip it; the inverted hull is cheaper and good enough.

**Neon**
- Needs raytracing for the glossy floor (`floor_rough 0.12`), emissive accents at strength 8 to 14, emissive text, and Glare bloom.
- Dark world at (0.004, 0.003, 0.012).
- Coloured rim lights reflect on the floor as big blobs. Use smaller rim lights.

**Isometric**
- Use an orthographic camera at rotation (54.736°, 0, 45°), which the kit's `camera(iso=True)` does.
- It needs its own layout (props on tiles or a platform, labels as flat 2D overlays). A free-camera layout seen through an iso camera looks random (`look_iso.png`).
- 3D text that faces the camera loses the iso feel. Use app overlays instead.

**Workbench**
- Gets no emission, toon shader, alpha or bloom. Colour comes from `material.diffuse_color`, which the kit sets for every material.
- Looks like a clean clay render with cavity and outlines, which is fine as a weak-PC fallback.

**Camera-facing labels**
- Text `align_y='CENTER'` does not centre the glyph box.
- The kit measures the evaluated text `bound_box` after `view_layer.update()`, then centres the text and sizes the pill to it (`out\dbg_label.png`).

**Fake bold**
- Faking bold with `curve.offset` makes broken glyphs ("HIDES" in the first demo).
- Use a real bold font file instead. The bundled Inter is a variable font, but Blender loads it as Regular only.

**Always pass absolute output paths**
- A relative `render.filepath` such as `out/x.png` rendered fine and wrote **nothing**, with no error.

---

## 2. Speed on weak PCs

### 2.1 Requirements (sourced)

**Minimums for Blender 5.0+** (https://devtalk.blender.org/t/system-requirements-for-blender-5-0/41457, text read via blenderartists):
- GPU: NVIDIA GeForce 900+, AMD GCN 4th gen+, or Intel Kaby Lake+.
- OpenGL 4.3 with ARB_shader_draw_parameters and ARB_clip_control, or Vulkan 1.3.
- macOS: Apple Silicon on macOS 13+.
- **Intel Macs top out at 4.5 LTS** (https://devtalk.blender.org/t/deprecation-and-removal-of-macos-intel-builds-in-blender-5-0/38835).
- 2 GB VRAM minimum, 8 GB recommended. This comes from a third-party copy (https://www.renderahouse.com/blog/blender-system-requirements).

**Engines**
- EEVEE is GPU-only with no CPU fallback (https://docs.blender.org/manual/en/latest/render/eevee/limitations/index.html).
- Workbench is also a GPU rasteriser, but its shaders are tiny. This is my inference: it compiled in under 1 s here.

**Headless**
- The current manual says "headless rendering is not supported on headless Windows systems" (same page).
- Linux uses EGL in background mode.
- **This matters for autopilot.** `blender -b` launched from the Electron app inside the logged-in desktop session works, as tested here. A Task Scheduler task set to "run whether the user is logged on or not" runs in session 0 with no desktop/GPU context, and EEVEE may fail there.
  - Extra runs start through Task Scheduler on Windows (see the extra-runs memory). Those tasks must be "run only when user is logged on", or the render must be deferred to the app's own session.

**Known iGPU and driver problems**
- EEVEE Next 4.2 notes list Intel HD 5000 failing to render dithered materials and Apple Intel iGPU artefacts with raytracing (https://developer.blender.org/docs/release_notes/4.2/eevee/).
- Intel Arc froze during shader compilation (https://projects.blender.org/blender/blender/issues/111556).

**Shader compile on mid GPUs**
- Users reported about **3 minutes** for a scene on a GTX 1660 (https://devtalk.blender.org/t/blender-4-2-eevee-next-feedback/31813?page=21).
- 5.0 made simple materials compile about 4 times faster (https://developer.blender.org/docs/release_notes/5.0/eevee/).
- "Shader Compilation Method: Subprocess" (Windows/Linux, OpenGL only) speeds it up but uses more RAM (https://docs.blender.org/manual/en/latest/editors/preferences/system.html).
- `--factory-startup` ignores user preferences, so the kit would have to set this via Python if wanted.

### 2.2 Rough speed on weak hardware

These are estimates. Nobody publishes EEVEE benchmarks. Blender Open Data covers Cycles only; its medians are:

| Device | Cycles median score |
|---|---|
| RTX 3080 | 4785 |
| GTX 1650 | 436 |
| Apple M2 10-core GPU | 354 |
| Apple M1 8-core GPU | 261 |
| Radeon 680M | 233 |
| i7-10700K CPU | 178 |
| Iris Xe | 101 |

Sources: https://opendata.blender.org/devices/... (one page per device; see the URLs in the source notes).

EEVEE is a rasteriser, so it scales more like games than like Cycles. With typical raster ratios (GTX 1650 about 1/4 to 1/5 of a 3080; 680M about 1/6; Iris Xe about 1/8 to 1/10) and about 0.1 s/frame of fixed CPU and IO overhead:

| Machine (estimate) | Plastic 1080p 16 spp | Plastic 720p 8 spp | Toon 720p | Workbench 720p | 4 s shot at 720p, toon |
|---|---|---|---|---|---|
| RTX 3080 (measured) | 0.49 s | ~0.27 s | ~0.2 s | 0.14 s | ~45 s total |
| GTX 1650 | ~2 to 2.5 s | ~1 s | ~0.7 s | ~0.4 s | ~1.5 to 2 min |
| Radeon 680M / Apple M1 | ~3 to 4 s | ~1.3 to 1.8 s | ~1 s | ~0.5 s | ~2.5 min |
| Iris Xe / old Intel iGPU | ~4 to 6 s | ~2 to 3 s | ~1.5 s | ~0.7 s | ~4 min, or fails |

Plus a one-time compile of 1 to 3 minutes on the first run on weak GPUs, from the sourced reports above.

**A typical 3D reel** has about 20 s of 3D, or 600 frames. That means about **5 min on the 3080, about 10 to 25 min on a GTX 1650, and 30 to 60 min on iGPUs**. Acceptable for unattended autopilot on mid GPUs; borderline on iGPUs.

### 2.3 Strategy for weak PCs (recommended)

1. **Calibrate once.** When Blender is set up, run the warm-up scene and then 10 frames of the default look. Store the measured s/frame, pick a tier (below), and show the user an estimate ("about 4 min per 3D reel").

   | Tier | When | Settings |
   |---|---|---|
   | Full | under 0.8 s/frame | 1080p, 16 spp |
   | Lite | 0.8 to 3 s/frame | 720p, 8 spp, raytracing off, ffmpeg lanczos upscale |
   | Flat | over 3 s/frame, or EEVEE fails | Workbench at 720p, or toon 720p with 4 spp |
   | Off | Blender missing or the test render fails | 3D style switched off |

2. **Fallback engines.** Workbench is the real fallback. Cycles CPU is not (28 s/frame at 1080p, 7.3 s/frame even at 720p with 16 spp). Cycles GPU (OptiX) took 7.7 s/frame here, as configured, with no gain over EEVEE.
3. **720p + upscale.** About 40% less render time. With these flat-shaded, low-detail scenes the lanczos upscale is hard to tell apart on a phone. The app overlays text at full 1080p, so the text stays sharp.
4. **Every other frame.** Halves render time. Use ffmpeg `framerate=fps=30` (blend, 1.7 s) or plain frame doubling, which suits the "15 fps stepped" look common in motion design. **Avoid `minterpolate`**: 25 s of CPU for 4 s of video, as slow as rendering.
5. **Background-only 3D plus flat overlays from the app.** All words, numbers, labels and captions are drawn by the app (or the existing Krypt Editor) from the kit's `anchors.json`. That file gives per-frame screen positions of named 3D points: demo output `out\demo_plastic\anchors.json`, entries `[frame, x, y, depth]`, 0 to 1 from the top-left. This:
   - removes 3D text cost (text extrudes and bevels are heavy meshes);
   - removes font issues;
   - keeps text crisp after upscaling;
   - lets the app retime or translate words without re-rendering.
6. **Bake to mp4 inside Blender.** Set `image_settings.media_type='VIDEO'` before `file_format='FFMPEG'` (5.x rule). Use a high CRF; the app's ffmpeg does the final encode with audio. This saves about 25% and avoids 200+ MB of PNGs per shot.
7. **Render all shots of a reel in one Blender process.** Saves 2.3 s startup plus about 1 to 2 s warm-up per shot. Use one scene per shot, or rebuild between shots, and write one mp4 per shot.

---

## 3. Scene-kit building blocks (bpy 5.x)

The prototype is `scratchpad\blender-tech\kit.py`; a durable copy is in `docs\research\blender-pipeline-2026-11-21\scripts\kit.py`. Everything below was run on 5.2.2.

### 3.1 API changes from 4.x that bite (verified by probe, plus release notes)

**Engine id**
- `'BLENDER_EEVEE'` in 5.x. Only that id is listed. It was `BLENDER_EEVEE_NEXT` in 4.2 to 4.5.
- Use `sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in ids else 'BLENDER_EEVEE_NEXT'`.

**Compositor**
- No `scene.node_tree`. Create `bpy.data.node_groups.new('post','CompositorNodeTree')`, then `ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')`.
- The output is a `NodeGroupOutput` node; there is no Composite node. Assign the group to `scene.compositing_node_group`.
- **Node options are now input sockets.** For example `glare.inputs['Type'].default_value = 'Bloom'` (menu socket, display names: 'Bloom', 'Fog Glow', 'Streaks', 'Simple Star', 'Ghosts', 'Sun Beams', 'Kernel'), `inputs['Quality'] = 'Medium'`, and `Threshold`, `Strength`, `Size`.
- EEVEE's own bloom was removed in 4.2.

**Image output**
- Set `image_settings.media_type = 'VIDEO'` before `file_format = 'FFMPEG'`.
- A video format cannot write a single still ("Cannot write a single file with an animation format selected"), so do the warm-up render without writing.

**Principled BSDF socket names (4.0+)**
- 'Base Color', 'Metallic', 'Roughness', 'IOR', 'Alpha', 'Coat Weight', 'Coat Roughness', 'Emission Color', 'Emission Strength', 'Specular IOR Level', 'Transmission Weight', 'Sheen Weight', 'Subsurface Weight', 'Thin Film Thickness'.
- Old names ('Emission', 'Specular', 'Subsurface') raise KeyError.

**Materials**
- `material.use_nodes` is effectively always on.
- Transparency is `material.surface_render_method = 'BLENDED'` (or 'DITHERED'). `blend_method` is legacy.
- Workbench reads `material.diffuse_color`.

**Keyframes: layered actions (4.4+); legacy access removed in 5.0**
- `action.fcurves` raises AttributeError in 5.x.
- Use `anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot).fcurves` from `bpy_extras`.
- `obj.keyframe_insert(path, frame=f)` still works and creates the action and slot.
- For nested data (node sockets, camera lens), insert on the struct, and look up the fcurve by `struct.path_from_id(path)` on the owning ID's channelbag. The kit's `key()` does this.

**Interpolation and easing per key**
- `kp.interpolation`: CONSTANT LINEAR BEZIER SINE QUAD CUBIC QUART QUINT EXPO CIRC BACK BOUNCE ELASTIC.
- `kp.easing`: AUTO / EASE_IN / EASE_OUT / EASE_IN_OUT.
- Both apply to the segment after the key. BACK + EASE_OUT gives a pop with overshoot; EXPO + EASE_OUT a fast slide-in.
- An F-curve Noise modifier (`fc.modifiers.new('NOISE')`) gives handheld shake.

**Fonts**
- Blender 5.2 ships `datafiles/fonts/Inter.woff2` (OFL) and `bpy.data.fonts.load()` reads woff2 fine. The variable font loads as "Inter Variable Regular" only.
- The default 3D text font is "Bfont Regular <builtin>".
- For bold, ship a static OFL bold TTF (Inter Bold, Montserrat ExtraBold, Poppins Bold…) with the kit.

**View transforms**
- 'AgX', 'Standard', 'Filmic', 'Khronos PBR Neutral'.
- AgX looks: 'AgX - Punchy', 'AgX - Base Contrast', 'AgX - Medium High Contrast', 'AgX - High Contrast', 'AgX - Very High Contrast', and others.
- Enum listing in background mode returns only 'NONE' without context, so set the value and catch errors rather than listing.

**EEVEE settings that exist in 5.2**
- `taa_render_samples`, `use_raytracing`, `ray_tracing_method`, `use_shadows`, `shadow_ray_count`, `shadow_step_count`, `use_fast_gi`, `motion_blur_steps`.
- Motion blur switches live on `scene.render` (`use_motion_blur`, `motion_blur_shutter`).
- `use_gtao` and `use_bloom` are gone.

**Other**
- Smooth shading: `mesh.shade_smooth()` / `shade_flat()`. Auto-smooth is gone (4.1); bevel `harden_normals` works without it.
- SVG import add-on `io_curve_svg` is enabled under `--factory-startup`: `bpy.ops.import_curve.svg(filepath=...)`.
- glTF and FBX importers are enabled too, which matters if CC0 models are ever used.
- 5.0 `mathutils` uses float32. Irrelevant here.

### 3.2 Blocks in the prototype (all exercised in renders)

**Looks and setup**
- `LOOKS` dict: engine, samples, raytrace, view transform/look, world colour, light scale, palette roles (bg / primary / secondary / accent / dark / metal / text), roughness, coat, emission.
- `setup(look, res, fps, frames, **overrides)`.
- `add_bloom()` builds the 5.x compositor.

**Materials**
- `mat(role, …)` is cached per role, so a look always has the same few shaders, which keeps compilation predictable.
- The toon builder is `_toon()`; it also builds the outline material.

**Easing and animation**
- `key(target, path, frame, value, interp, easing)`
- `pop_in` (BACK overshoot), `slide_in` (EXPO), `float_idle` (SINE bob), `add_noise` (shake)

**Geometry**
- `box` (with bottom origin, so `scale.z` grows bars), `cylinder`, `torus`
- `prism(points2d, depth)`: any 2D outline extruded. It is the base for the arrow, cursor, check mark and shield.
- `cyclorama()`
- `svg_icon(path)`: imports, normalises size and centre, extrudes.

**Props**, all procedural, each a few dozen lines, parented under an empty so the plan can move, scale and animate them as one unit:
- `pc_tower` (fans, LED, internals, x-ray-able case), `ram_stick` (pins via Array), `cpu_chip`, `phone`
- `bars(values)`, `coin(symbol)`, `shield`, `cursor`, `arrow`, check mark, SVG icon

Gallery: `prev\props.png` (plastic and toon).

**Text**
- `text()`: 3D text in bundled Inter, extrude and bevel.
- `face_camera()`: COPY_ROTATION from the camera, so the text stays parallel to the screen with no skew.
- `label()`: pill plus text, auto-sized from the measured bbox.
- `hud_text()`: 3D text parented to the camera, a headline that stays put while the camera moves.

**Camera rigs**
- `camera()` returns the camera, a TRACK_TO target empty, and a pivot empty at the target.
- `orbit` (pivot rotation), `push_in` (dolly the parented camera's local offset), `zoom` (lens), `retarget` (move the look-at target). Iso mode is an orthographic camera at the true isometric angle.

**X-ray and cutaway**
- `xray_fade()`: animates Principled Alpha, or for non-Principled (toon) shaders inserts Mix(Transparent, surface) and animates Fac. The material is set to BLENDED.
- `cutaway()`: Boolean DIFFERENCE (EXACT solver) with a render-hidden animated cutter box. Built but not rendered in the demo.

**2D anchors**
- `screen_anchors(objs, frames)`: `world_to_camera_view` per frame, giving JSON for app overlays.

**Rendering**
- `render_still()` returns (cold, warm).
- `render_anim(dir, step)`.

### 3.3 Demo shot: ~4 s, rendered and timed

`demo.py` builds a "where the FPS hides" shot from the blocks:
1. The PC tower pops in with a BACK overshoot and an EXPO spin.
2. The camera orbits 55° with a QUART push-in and slight noise shake.
3. The case fades to glass (alpha 1 to 0.12).
4. The RAM emission ramps 2 to 9.
5. A camera-facing "32 GB RAM" label pops in.
6. A camera-parented 3D headline runs throughout.
7. `anchors.json` is written for overlays.

Encode: ffmpeg `libx264 -crf 18 yuv420p`.

| Variant | Blender s/frame | Blender wall (start → done) | ffmpeg | **Total for 4 s** | Output |
|---|---|---|---|---|---|
| **Plastic 1080p (recommended)** | 0.50 to 0.54 | 64 to 73 s | 1.9 s | **66 to 75 s** | `out\demo_plastic.mp4` |
| Plastic 1080p, Vulkan backend | 0.40 | 51 s (61 s on first run) | 1.9 s | **53 s** | `out\demo_plastic_vulkan2.mp4` |
| Plastic 720p + upscale | 0.32 | 42 s | 1.9 s | **44 s** | `out\demo_plastic_720.mp4` |
| Plastic, every other frame | 0.52 × 60 frames | 35 s | 24.7 s minterpolate / 1.7 s blend | 60 s / **37 s** | `out\demo_plastic_step2.mp4`, `out\demo_plastic_step2_blend.mp4` |
| Toon 1080p | 0.34 | 48 s | 1.3 s | **50 s** | `out\demo_toon.mp4` |
| Clay 1080p | 0.54 | 69 s | 1.8 s | **71 s** | `out\demo_clay.mp4` |

**Contact sheets** (frames 8 / 30 / 55 / 80 / 120):
- `prev\demo_plastic_sheet.png`
- `prev\demo_toon_clay.png`

**Durable copies:** `docs\research\blender-pipeline-2026-11-21\demo_*.mp4`.

**What the demo taught:**
- The backdrop must turn with the orbit.
- Parent inverse needs `view_layer.update()` first.
- Toon x-ray must also hide the hull.
- Keep the push-in factor at or above 0.75 so the hero stays in frame.
- The camera-parented headline is stable. For final reels it still belongs in the app's overlay layer.

---

## 4. Free assets (commercial use)

| Source | Licence | Bundling in our app | Notes |
|---|---|---|---|
| **Poly Haven** (HDRIs, textures, models) | CC0. "You can redistribute them… even in a product you sell" (https://polyhaven.com/license) | Yes | **API** (https://api.polyhaven.com) is free for commercial use. **Every call needs a unique Referer or User-Agent naming our software**, and live API use must show where the content comes from, e.g. "Powered by Poly Haven" (ToS §2.4, §2.5: https://github.com/Poly-Haven/Public-API/blob/master/ToS.md). Bundled CC0 files need no credit. Logos and example renders are not CC0. Sizes: 1k HDRI about 1.3 to 1.6 MB (2k 4.9 to 6.3 MB, 4k 18.5 to 24.7 MB); small model with 1k textures about 2.3 MB glTF |
| **Kenney** | CC0, commercial OK, no attribution (https://kenney.nl/support) | Yes | Don't use the Kenney logo. Low-poly packs match the low-poly look. Pack sizes not checked |
| **Quaternius** | CC0 (https://quaternius.com/faq.html) | Yes | Low-poly characters and props |
| **ambientCG** | CC0 1.0, may "include the raw files in your project" (https://docs.ambientcg.com/license/) | Yes | PBR textures. Mostly unneeded for these flat looks |
| **Fonts** | Inter (OFL 1.1, already inside Blender); Montserrat, Poppins, Space Grotesk (all OFL 1.1, no Reserved Font Name) | Yes | OFL allows bundling with commercial software; include the copyright and licence text; don't sell the fonts alone; rendered videos are not covered by the OFL (https://openfontlicense.org/ofl-faq/). DejaVu (Bitstream Vera licence) can also be bundled with notices |

**Recommendation:**
- The procedural kit needs **no assets at all**. Looks come from palette, lights and the cyclorama.
- Bundle **one or two small 1k studio HDRIs**, about 1.5 MB each, for nicer plastic reflections later, plus **one bold OFL font** (Inter Bold or similar).
- Fetch anything bigger from the Poly Haven API on demand, with a proper User-Agent and a visible source line.
- Avoid letting the AI pick arbitrary models: unpredictable scale, poly count and shader compile cost.

---

## 5. Blender MCP (hand-made one-offs only, not autopilot)

**ahujasid "blender-mcp"** (now `mcp-for-blender`, https://github.com/ahujasid/blender-mcp)
- **Licence:** MIT.
- **How it works:** a Blender add-on opens an **unauthenticated socket on localhost:9876**, and the MCP server runs via `uvx mcp-for-blender`.
- **Tools:** `execute_blender_code` (arbitrary Python, flagged "potentially dangerous"), `look` (viewport or render images), `get_scene_info`, asset search/import (Poly Haven, Sketchfab), AI 3D generators (Hyper3D Rodin, Hunyuan3D, Meshy, Tripo…).
- **Telemetry:** **on by default** (anonymous tool name, success, duration, versions, OS; content only on opt-in). Turn it off with `DISABLE_TELEMETRY=true` or the `disable_telemetry` tool.
- **Status:** about 35k stars, very active (commits 2026-11-18).
- **Reliability** (README plus issues):
  - The first command sometimes fails.
  - Timeouts on big requests.
  - Poly Haven downloads freeze Blender because they run on the main thread.
  - The socket dies after a preferences reset or on Blender 5.3 errors (#429, #437).
  - A 5.2 to 5.3 upgrade silently doesn't load the add-on (#431).
  - Long code has no cancel (#430).
  - Windows Defender flagged the installer (#401).
- **Token cost:** not documented. In practice the cost is dominated by `look` screenshots (images) and scene dumps. Each iteration costs a few thousand tokens; inference.

**Official Blender Lab MCP** (https://projects.blender.org/lab/blender_mcp; read via secondary sources because the site refused automated fetches)
- GPL-3.0-or-later, needs Blender 5.1+.
- v1.0.3 (2026-09). 26 tools: code execution, scene summaries, screenshots, docs and manual search.
- No outside services; labelled experimental.
- **Same default port 9876**, so it clashes with ahujasid's if both are installed.

**Others**
- blender-open-mcp (MIT, local Ollama).
- Paid: Blender MCP Pro, StraySpark.

**Verdict**
- Useful for Krypt to hand-build a new prop or shot template *once*, interactively. The result is then frozen into the kit as Python.
- Not for autopilot or end users: open code-execution socket, telemetry default, flaky connection, and a much higher token cost than a 1 to 2 KB JSON plan.
- If used, prefer the official Lab server (GPL, no third-party services), or ahujasid's with `DISABLE_TELEMETRY=true` and `BLENDER_MCP_SAFE_MODE=1`.

---

## 6. Shipping

### 6.1 Licence (not legal advice)

- **Blender:** GPL v2-or-later source; binaries are distributed under GPL v3 (https://www.blender.org/about/license/, via search snippets because the site returned 403). "What you create with Blender is your sole property"; renders are ours.
- **Calling Blender as a separate program.** The GNU GPL FAQ treats "pipes, sockets and command-line arguments" as communication between separate programs. The Electron app that runs `blender.exe -b -P kit.py -- plan.json` and reads back an mp4 stays separately licensed.
- **kit.py itself.** Blender's FAQ says published scripts using the Blender Python API must be GPL. **Ship `kit.py` and the kit folder under GPL-3.0-or-later**: a LICENSE file in the kit folder, with the source visible, which it is anyway as `.py`.
  - The kit holds no secrets; plans come from the AI and contain no code.
  - The app's packaged-protection hash-check can still verify the kit file's integrity; GPL doesn't forbid that.
  - Do not obfuscate `kit.py`.
- **Bundling Blender** is allowed under the GPL (with licence text plus source offer or link, and no added restrictions), but it is **not recommended**: 366 to 425 MB per platform, per release (5.2.4 msi 366 MB, dmg 346 MB; 5.3.0 msi 384 MB), plus update churn.
  - Better: detect the user's install, and when missing, link to blender.org (5.2 LTS) or suggest `winget install BlenderFoundation.Blender`.

### 6.2 Finding Blender

**Windows, in order:**
1. A user-set path saved in Setup.
2. Glob `C:\Program Files\Blender Foundation\Blender */blender.exe`, plus `%ProgramFiles(x86)%`. Pick the highest version: versioned folders like `Blender 5.2` exist here.
3. `where blender` on PATH.
4. Steam (`<Steam>\steamapps\common\Blender\blender.exe`; read libraryfolders.vdf for extra libraries).
5. Registry: the uninstall keys' `InstallLocation` (best-effort), and the `.blend` file association (`HKCR\blendfile\shell\open\command`).

**Microsoft Store installs** live in WindowsApps, and the `blender-launcher` alias reportedly takes no arguments. Flag these as unsupported, or ask the user to install the MSI.

**macOS:**
- `/Applications/Blender.app/Contents/MacOS/Blender`, then `~/Applications/…`.
- `mdfind "kMDItemCFBundleIdentifier == 'org.blenderfoundation.blender'"` finds other copies.
- Steam path not documented.

**Always verify the found binary:**
1. Run `blender --version` and parse "Blender 5.2.2".
2. Then run a **10-frame calibration render** (section 2.3). It proves EEVEE works in the user's session, warms the shader cache and sets the tier.

### 6.3 Minimum version

- **Require 5.0+, recommend 5.2 LTS** (released 2026-07-14, supported to 2028-07-14; https://endoflife.date/blender). 5.3 is current (2026-11-10). Its breaking changes (`PropertyGroup.name` read-only, gpu batch) don't touch the kit.
- **Why not 4.x:**
  - The 5.0 Python API breaks (EEVEE id, compositor node groups, removed legacy `action.fcurves`, `media_type`) need shims.
  - 4.2 LTS support ended 2026-07.
- **The one reason to support 4.5 LTS (to 2027-07) is Intel Macs**, which cannot run 5.x. A compat layer would be three small branches:
  - Engine id `BLENDER_EEVEE_NEXT`.
  - Compositor via `scene.use_nodes` + `scene.node_tree` + a Composite node.
  - Video output without `media_type`.

  4.5 already has channelbags (4.4+). **Untested here**; decide after checking how many Mac users are on Intel.
- **Python** is 3.13 in 5.1+. The kit uses only stdlib plus bpy.

---

## 7. Recommended design

### 7.1 Default look and settings

**"Soft plastic"** (EEVEE)

| Setting | Value |
|---|---|
| Samples | `taa_render_samples=16` |
| Raytracing | `use_raytracing=True` (screen-space) |
| Shadows | `use_shadows=True`, `shadow_ray_count=1`, `shadow_step_count=6` |
| Motion blur | on (free) |
| Colour | view transform **Khronos PBR Neutral**, look None |
| World | dark brand colour at strength ~0.4 |
| Lights | 3 area lights (key/fill/rim at ×0.6) |
| Backdrop | seamless cyclorama in the brand colour, parented to the camera pivot |
| Materials | Principled, roughness 0.22, Coat 0.8 / coat roughness 0.08; emission 1.5 on the accent role only; bevel 0.04 to 0.06 with harden normals |
| Bloom | off by default; on for neon (Glare Bloom, Medium, strength 0.5 to 0.6, threshold 1) |
| Resolution | 1080x1920 at 30 fps |
| Output | Blender writes H.264 mp4 directly (CRF HIGH); the app's ffmpeg does the final mix |

**Styles to offer:**
- **Toon** (cheapest, 0.29 s/frame, crisp on phones; Standard view transform, 8 spp, hull outline). The best second style.
- **Clay** (0.45).
- **Neon** (0.55, for dark "hacker" topics).
- **Workbench** as the automatic weak-PC fallback.

**Tier presets:** Full / Lite (720p, 8 spp, raytracing off, upscale) / Flat (Workbench 720p), picked by the calibration render.

### 7.2 Kit design

**Plan (the AI's whole output, about 1 to 2 KB):**

```json
{
  "look": "plastic", "palette": "krypt", "fps": 30,
  "shots": [
    {"type": "reveal",      "dur": 3.2, "prop": "pc_tower", "move": "orbit_push", "anchors": ["ram"]},
    {"type": "zoom_inside", "dur": 4.0, "prop": "pc_tower", "focus": "ram", "xray": true},
    {"type": "versus",      "dur": 3.5, "left": {"prop": "phone"}, "right": {"prop": "pc_tower"}, "winner": "right"},
    {"type": "stat_bars",   "dur": 3.0, "values": [32, 58, 100], "highlight": 2},
    {"type": "steps",       "dur": 5.0, "items": ["cursor", "check", "shield"]},
    {"type": "iso_diagram", "dur": 4.0, "nodes": ["phone", "cloud", "pc_tower"], "links": [[0,1],[1,2]]}
  ]
}
```

- **Durations** come from the app (narration word timings), not from the AI's guesses.
- **Words** never go into the plan as 3D text by default. The plan names anchors, and the app places the narration's key words, numbers and labels on them as 2D overlays.
- An optional `"hero_text"` (≤ 3 words) per reel may be 3D.

**Validation in the app before Blender runs:**
- JSON schema.
- Whitelisted shot types, props, palette roles and moves.
- Clamped numbers (durations 1.5 to 8 s, at most 6 bars, at most 5 steps).
- Unknown props map to a generic rounded box with an SVG icon from a bundled icon set.
- No free text in the plan except overlay strings, which never reach Python as code.

**Kit structure:**
- `kit/core.py`: setup, looks, materials, easing, camera rigs, anchors, render.
- `kit/props.py`: one function per prop, each returning a root empty with named anchor empties (`ram`, `gpu`, `screen`…).
- `kit/shots.py`: one function per shot type, `(scene, shot, t0) -> anchors`.
- `kit/main.py`:
  - Reads the plan.
  - Builds each shot in its own scene with the same look.
  - Renders each to `shot_N.mp4`.
  - Writes `anchors.json` and a `report.json` (timings, errors).
  - Exits non-zero on failure, so the app can fall back.

**Shot catalogue** (all doable from the tested blocks):

| Shot | Built from |
|---|---|
| reveal | pop-in + orbit/push-in |
| this-vs-that | two props on split pedestals, winner scales up, loser greys out (material swap) |
| zoom inside | push-in + x-ray fade or boolean cutaway + emission ramp |
| stat bars | `bars()` with BACK scale.z growth |
| step-by-step | props slide in one by one along a path; the camera retargets per step |
| isometric diagram | orthographic camera, tiles, prism arrows between nodes |
| object swap / transform | scale-out/in with overshoot |
| idle loop | float + slow orbit, for under narration |

**Performance rules built into the kit:**
- Fixed material set per look (warm cache).
- Bevel segments ≤ 3.
- Cylinders ≤ 64 segments (≤ 10 in low-poly).
- No subdivision surfaces.
- No volumetrics.
- No Freestyle in the default tiers.
- One Blender process per reel.

**First-run flow in the app:**
1. Find Blender.
2. Check the version.
3. Warm-up render of every material (absorbs the 5 to 20 s compiles, or minutes on weak GPUs).
4. 10-frame calibration render.
5. Pick the tier and show the estimate.

Re-run the calibration when the Blender version changes or a render fails.

**Autopilot:** render only inside the logged-in user session. EEVEE is unsupported headless on Windows, so check that the Task Scheduler extra runs are "run only when user is logged on".

### 7.3 Open questions / not yet tested

- Blender 4.5 compat shims and Intel Macs.
- Real weak-PC numbers. The table in 2.2 is an estimate; one run on a GTX 1650 laptop or an Iris Xe would settle the tiers.
- macOS (Metal backend) timings and shader compile.
- Line Art tuning.
- `cutaway()` (boolean) cost while animating.
- A full multi-shot reel through one process.
- Whether 720p upscaled holds up for detailed scenes (it did for these flat ones).
