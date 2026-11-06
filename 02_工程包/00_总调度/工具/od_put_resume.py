#!/usr/bin/env python3
"""可续传分片上传：python3 od_put_resume.py <本地> <云盘路径> [单次秒数=95]；状态存 <本地>.odstate，重复调用直到打印 DONE"""
import sys, os, json, urllib.parse, subprocess, time
src, dst = sys.argv[1], sys.argv[2]; budget = float(sys.argv[3]) if len(sys.argv) > 3 else 95; t0 = time.time()
G = 'https://graph.microsoft.com/v1.0/me/drive/root:/' + urllib.parse.quote(dst) + ':'
st = src + '.odstate'; size = os.path.getsize(src); CH = 320 * 1024 * 40
if os.path.exists(st): S = json.load(open(st))
else:
    r = subprocess.run(['curl', '-s', '-X', 'POST', G + '/createUploadSession', '-H', 'Content-Type: application/json', '-d', '{"item":{"@microsoft.graph.conflictBehavior":"replace"}}'], capture_output=True)
    S = {'url': json.loads(r.stdout)['uploadUrl'], 'off': 0}; json.dump(S, open(st, 'w'))
with open(src, 'rb') as f:
    while S['off'] < size and time.time() - t0 < budget:
        f.seek(S['off']); buf = f.read(CH); end = S['off'] + len(buf) - 1; tmp = '/tmp/_odr_chunk'; open(tmp, 'wb').write(buf)
        r = subprocess.run(['curl', '-s', '-m', '60', '-w', '\n%{http_code}', '-X', 'PUT', S['url'], '-H', f"Content-Range: bytes {S['off']}-{end}/{size}", '--data-binary', '@' + tmp], capture_output=True)
        code = r.stdout.decode(errors='ignore').rsplit('\n', 1)[-1]
        if code in ('200', '201', '202'): S['off'] = end + 1; json.dump(S, open(st, 'w'))
        else: print('retry', code, r.stdout[-200:]); time.sleep(2)
if S['off'] >= size: os.remove(st); print('DONE', dst, size)
else: print('PROGRESS', S['off'], '/', size)
