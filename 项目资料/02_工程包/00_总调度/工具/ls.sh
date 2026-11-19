#!/bin/bash
p=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1")
curl -s "https://graph.microsoft.com/v1.0/me/drive/root:/$p:/children?\$top=200&\$select=id,name,size,file,lastModifiedDateTime" | jq -r '.value[]|"\(.id)\t\(.size)\t\(.file.hashes.sha1Hash // "-")\t\(.name)"'
