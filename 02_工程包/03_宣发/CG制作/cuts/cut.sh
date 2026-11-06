set -e
R=/workspace/projects/d4bb0e99-c32a-4fa3-801b-770702e4a9d6/cloud/CG制作/renders/cg2_v1
SF=/workspace/projects/d4bb0e99-c32a-4fa3-801b-770702e4a9d6/anyan/docs/设计/未来开发报告/img/story_frame1.jpg
FONT=/home/sandbox/.fonts/NotoSansSC-Bold.otf
ENC="-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 24 -c:a aac -b:a 192k -ar 48000 -ac 2"
# clip <in> <out> <speed> <trim_end> <extra_vf>
clip(){ in=$1; out=$2; sp=$3; te=$4; vf=$5
  d=$(python3 -c "print(round($te*$sp,3))")
  ffmpeg -v error -y -t $te -i $in -filter_complex "[0:v]${vf}scale=1280:720,setsar=1,setpts=$sp*PTS,fps=24,fade=in:0:6,fade=out:st=$(python3 -c "print($d-0.25)"):d=0.25[v];[0:a]aresample=48000,atempo=$(python3 -c "print(round(1/$sp,4))"),afade=in:st=0:d=0.2,afade=out:st=$(python3 -c "print($d-0.3)"):d=0.3[a]" -map "[v]" -map "[a]" $ENC $out; }
# film1
ffmpeg -v error -y -loop 1 -i $SF -f lavfi -i "anoisesrc=c=brown:a=0.015:r=48000" -t 8 -filter_complex "[0:v]scale=2752:-2,zoompan=z='1+0.12*on/192':x='iw/2-(iw/zoom/2)':y='ih*0.62-(ih/zoom/2)':d=192:s=1280x720:fps=24,fade=in:0:12,fade=out:st=7.6:d=0.4[v];[1:a]lowpass=f=600,afade=in:st=0:d=1,afade=out:st=7:d=1[a]" -map "[v]" -map "[a]" -frames:v 192 $ENC a1.mp4
clip $R/f1s2_clocktower.mp4 a2.mp4 1.5 5.08 "crop=1120:630:160:0,"
clip $R/f1s3_clockstop.mp4 a3.mp4 1.5 5.08 ""
clip $R/f1s4_bridge.mp4 a4.mp4 1.5 5.08 ""
clip $R/f1s5_morveth.mp4 a5.mp4 1.5 5.08 ""
clip $R/f1s6_aethelon.mp4 a6.mp4 1.5 5.08 ""
clip $R/f1s7_moyan.mp4 a7.mp4 1.5 5.08 ""
T=$(python3 -c "
import subprocess
s=sum(float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f'a{i}.mp4']).decode()) for i in range(1,8))
print(round(60-s,3))")
ffmpeg -v error -y -f lavfi -i "color=c=black:s=1280x720:r=24:d=$T" -t 3 -i $R/f1s2_clocktower.mp4 -filter_complex "[0:v]drawtext=fontfile=$FONT:text='深渊回响':fontsize=96:fontcolor=0xD9A85B:x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(lt(t,0.8),0,if(lt(t,2),(t-0.8)/1.2,if(lt(t,$T-1),1,max(0,($T-t)))))'[v];[1:a]aresample=48000,lowpass=f=350,atempo=0.75,volume=1.6,apad,atrim=0:$T,afade=out:st=$(python3 -c "print($T-1.5)"):d=1.5[a]" -map "[v]" -map "[a]" -t $T $ENC a8.mp4
printf "file '%s'\n" a1.mp4 a2.mp4 a3.mp4 a4.mp4 a5.mp4 a6.mp4 a7.mp4 a8.mp4 > l1.txt
ffmpeg -v error -y -f concat -safe 0 -i l1.txt -c copy film1_clock_stopped_v01.mp4
# film5
clip $R/f5s1_cellar.mp4 b1.mp4 1.2 5.08 ""
clip $R/f5s2_iola.mp4 b2.mp4 1.2 4.3 ""
clip $R/f5s3_charon.mp4 b3.mp4 1.2 5.08 ""
clip $R/f5s4_reflection.mp4 b4.mp4 1.2 4.2 ""
T5=$(python3 -c "
import subprocess
s=sum(float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f'b{i}.mp4']).decode()) for i in range(1,5))
print(round(30-s-6.07,3))")
ffmpeg -v error -y -i $R/f5s5_crossroads.mp4 -filter_complex "[0:v]scale=1280:720,setsar=1,setpts=1.2*PTS,fps=24,fade=in:0:6,tpad=stop_mode=clone:stop_duration=$T5[v];[0:a]aresample=48000,atempo=0.8333,apad,afade=out:st=$(python3 -c "print(6.07+$T5-2)"):d=2[a]" -map "[v]" -map "[a]" -t $(python3 -c "print(6.07+$T5)") $ENC b5.mp4
ffmpeg -v error -y -sseof -0.05 -i b5.mp4 -frames:v 1 -update 1 film5_last_frame.png
printf "file '%s'\n" b1.mp4 b2.mp4 b3.mp4 b4.mp4 b5.mp4 > l2.txt
ffmpeg -v error -y -f concat -safe 0 -i l2.txt -c copy film5_crossroads_v01.mp4
for f in film1_clock_stopped_v01.mp4 film5_crossroads_v01.mp4; do ffprobe -v error -show_entries format=duration:stream=codec_type -of csv=p=0 $f; done
