#!/usr/bin/env python3
"""OneDrive 上传：python3 od_put.py <本地文件> <云盘路径，如 暗岩传说/02_工程包/x.zip>  （大文件自动分片，覆盖同名）"""
import sys, os, json, urllib.parse, subprocess
src, dst = sys.argv[1], sys.argv[2]
G = 'https://graph.microsoft.com/v1.0/me/drive/root:/' + urllib.parse.quote(dst) + ':'
def curl(*a):
    r = subprocess.run(['curl', '-s', *a], capture_output=True); return r.stdout
size = os.path.getsize(src)
if size < 4 * 1024 * 1024:
    out = curl('-X', 'PUT', G + '/content', '-H', 'Content-Type: application/octet-stream', '--data-binary', '@' + src)
    j = json.loads(out); print(j.get('name'), j.get('size'), j.get('error')); sys.exit(0 if 'id' in j else 1)
s = json.loads(curl('-X', 'POST', G + '/createUploadSession', '-H', 'Content-Type: application/json', '-d', '{"item":{"@microsoft.graph.conflictBehavior":"replace"}}'))
url = s['uploadUrl']; CH = 320 * 1024 * 50  # 16 MB
with open(src, 'rb') as f:
    off = 0
    while off < size:
        buf = f.read(CH); end = off + len(buf) - 1
        tmp = '/tmp/_od_chunk'; open(tmp, 'wb').write(buf)
        for _ in range(4):
            r = subprocess.run(['curl', '-s', '-w', '\n%{http_code}', '-X', 'PUT', url, '-H', f'Content-Range: bytes {off}-{end}/{size}', '--data-binary', '@' + tmp], capture_output=True)
            code = r.stdout.decode().rsplit('\n', 1)[-1]
            if code in ('200', '201', '202'): break
        else:
            print('FAIL at', off, r.stdout[-300:]); sys.exit(1)
        off = end + 1
print('OK', dst, size)
