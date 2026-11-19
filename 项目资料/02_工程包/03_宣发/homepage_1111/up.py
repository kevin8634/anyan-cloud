import sys,os,json,subprocess,urllib.parse
G="https://graph.microsoft.com/v1.0/me/drive/root:"
def cj(args):
    r=subprocess.run(["curl","-s"]+args,capture_output=True,text=True).stdout
    try: return json.loads(r)
    except: return {"raw":r[:300]}
def up(local,remote):
    q=urllib.parse.quote(remote)
    sz=os.path.getsize(local)
    if sz<4*1024*1024:
        d=cj(["-X","PUT",f"{G}{q}:/content","-H","Content-Type: application/octet-stream","--data-binary","@"+local])
    else:
        s=cj(["-X","POST",f"{G}{q}:/createUploadSession","-H","Content-Type: application/json","-d",'{"item":{"@microsoft.graph.conflictBehavior":"replace"}}'])
        url=s["uploadUrl"]; ch=320*1024*10; f=open(local,'rb'); off=0; d={}
        while off<sz:
            b=f.read(ch); open('/tmp/chunk','wb').write(b); e=off+len(b)-1
            r=subprocess.run(["curl","-s","-X","PUT",url,"-H",f"Content-Range: bytes {off}-{e}/{sz}","--data-binary","@/tmp/chunk"],capture_output=True,text=True).stdout
            d=json.loads(r) if r.strip() else {}
            off=e+1
    # verify
    m=cj([f"{G}{q}?$select=size,name"])
    print("OK" if m.get("size")==sz else "MISMATCH", sz, m.get("size"), remote)
for a in sys.argv[1:]:
    l,r=a.split("=>"); up(l,r)
