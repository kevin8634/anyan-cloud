cd /workspace/work/chars/face1107/std
python3 post.py Mage '{"in":[[250,208],[395,208],[322,335]],"out":[[190,225],[330,225],[260,370]],"nin":[322,275],"nout":[258,318]}'
python3 post.py Hunter '{"in":[[275,230],[425,228],[350,350]],"out":[[218,215],[368,215],[290,370]],"nin":[350,292],"nout":[290,300]}'
python3 post.py Chrono '{"in":[[286,232],[393,232],[340,330]],"out":[[200,268],[315,268],[258,375]],"band":[60,298],"bgcut":1}'
cd ..
for c in Mage Hunter Chrono; do node std/geo.mjs apply ../tex1106/整套_7c662c9/LUX_$c.glb std/w/$c view/v6/LUX_$c.glb std/w/${c}_decal2.webp; done
