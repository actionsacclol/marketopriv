#!/bin/sh
# usage: run.sh <name> <look> [json]   -> out/<name>.png, prev/<name>.png, appends RESULT to results.log
cd "$(dirname "$0")"
D="$(cygpath -w "$PWD")"
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
name="$1"; look="$2"; js="${3:-{\}}"
start=$(date +%s%N)
"$B" -b --factory-startup -P looks.py -- "$look" "$D\\out\\$name.png" "$js" > "logs/$name.txt" 2>&1
end=$(date +%s%N)
r=$(grep RESULT "logs/$name.txt")
[ -z "$r" ] && { echo "FAIL $name"; grep -E "Error|Traceback|File \"" "logs/$name.txt" | head -12; exit 1; }
echo "$name | $r | wall=$(( (end - start) / 1000000 ))ms" | tee -a results.log
[ -f "out/$name.png" ] && ffmpeg -y -loglevel error -i "out/$name.png" -vf scale=540:-1 "prev/$name.png"
