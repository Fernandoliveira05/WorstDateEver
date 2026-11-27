import sys,re,json,subprocess,os
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/156.0 Safari/537.36'
def get(url):
    return subprocess.check_output(['curl','-L','-s','-A',UA,url])
for public in sys.argv[1:]:
    url='https://poly.pizza/m/'+public
    html=get(url).decode('utf-8','ignore')
    state=re.search(r'window\.__SERVER_APP_STATE__\s*=\s*(\{.*?\})</script>',html,re.S)
    meta={}
    if state:
        try:
            data=json.loads(state.group(1)); m=data.get('initialData',{}).get('model',{})
            meta={k:m.get(k) for k in ['Title','Licence','Type','Tris']}
            meta['creator']=m.get('Creator',{}).get('Username')
        except Exception as e: meta={'err':str(e)}
    src=re.search(r'<model-viewer[^>]+src="([^"]+)"',html)
    if not src:
        print(public,'NO SRC',meta); continue
    src=src.group(1)
    ext='.glb.br' if src.endswith('.glb.br') else '.glb'
    out=f'{public}{ext}'
    data=get(src)
    open(out,'wb').write(data)
    print(json.dumps({'public':public,'file':out,'bytes':len(data),**meta},ensure_ascii=False))
