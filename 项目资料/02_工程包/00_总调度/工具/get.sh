#!/bin/bash
# get.sh <cloudpath under 暗岩传说/> <localfile>
p=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "暗岩传说/$1")
for i in 1 2 3; do curl -sfL --retry 3 "https://graph.microsoft.com/v1.0/me/drive/root:/$p:/content" -o "$2" && break; sleep 3; done
echo "$(stat -c %s "$2") $2"
