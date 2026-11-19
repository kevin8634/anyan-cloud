export LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu
cd /workspace/work/fine
for x in intro:4.0 basic:2.2 oar:4.0 death:6.5 life:3.8 kick:3.6 phase2:4.6 ferry:4.2 die:4.0; do
 n=${x%%:*}; d=${x##*:}; rm -rf sim_$n; node sim_shoot.mjs sim_$n $n $d 0.1 > sim_$n.log 2>&1; echo $n $(tail -1 sim_$n.log)
done
