#!/bin/sh
# usage: demo.sh <name> <look> [json] [extra blender args]  -> out/<name>/f_####.png + out/<name>.mp4, timings in demo_results.log
cd "$(dirname "$0")"
D="$(cygpath -w "$PWD")"
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
name="$1"; look="$2"; js="${3:-{\}}"; extra="$4"
rm -rf "out/$name"; mkdir -p "out/$name"
s=$(date +%s%N)
"$B" -b --factory-startup $extra -P demo.py -- "$look" "$D\\out\\$name" "$js" > "logs/demo_$name.txt" 2>&1
m=$(date +%s%N)
r=$(grep RESULT "logs/demo_$name.txt")
[ -z "$r" ] && { echo "FAIL $name"; grep -E "Error|Traceback|File \"" "logs/demo_$name.txt" | head -12; exit 1; }
step=$(echo "$r" | sed -n 's/.*step=\([0-9]*\).*/\1/p')
if [ "$step" = "2" ]; then
  i=1; for f in out/$name/f_*.png; do cp "$f" "out/$name/s_$(printf %04d $i).png"; i=$((i+1)); done
  # every other frame rendered: interpolate back to 30 fps (blend = cheap; minterpolate = motion-compensated)
  ffmpeg -y -loglevel error -framerate 15 -start_number 1 -i "out/$name/s_%04d.png" -vf "minterpolate=fps=30:mi_mode=mci,scale=1080:1920:flags=lanczos,format=yuv420p" -c:v libx264 -crf 18 -preset medium "out/$name.mp4"
else
  ffmpeg -y -loglevel error -framerate 30 -start_number 1 -i "out/$name/f_%04d.png" -vf "scale=1080:1920:flags=lanczos,format=yuv420p" -c:v libx264 -crf 18 -preset medium "out/$name.mp4"
fi
e=$(date +%s%N)
echo "$name | $r | blender_wall=$(( (m - s) / 1000000 ))ms ffmpeg=$(( (e - m) / 1000000 ))ms total=$(( (e - s) / 1000000 ))ms" | tee -a demo_results.log
