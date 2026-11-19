# 第二步（不带 microsoft credentials 运行！带了代理会往 personalcontent 注入令牌 → 401）
F=/workspace/work/electron1109/desktop/out/DarkRock-win-x64_1116.zip; U=$(cat /tmp/uurl_1116)
S=$(stat -c %s $F); C=62914560; o=0
while [ $o -lt $S ]; do
  e=$((o+C-1)); [ $e -ge $S ] && e=$((S-1)); l=$((e-o+1))
  for t in 1 2 3 4; do
    code=$(tail -c +$((o+1)) $F | head -c $l | curl -s -m 300 -o /tmp/up.json -w "%{http_code}" -X PUT "$U" -H "Content-Length: $l" -H "Content-Range: bytes $o-$e/$S" --data-binary @-)
    [ "$code" = 202 -o "$code" = 200 -o "$code" = 201 ] && break; echo "retry $o code $code"; sleep 5
  done
  echo "$o-$e $code"; o=$((e+1))
done
python3 -c 'import json;d=json.load(open("/tmp/up.json"));print("ID",d.get("id"),"SIZE",d.get("size"))'
