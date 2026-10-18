const BASE=process.argv[2]; const url=process.argv[3];
const cookies={};
async function req(m,p,b){const res=await fetch(BASE+p,{method:m,headers:{cookie:Object.entries(cookies).map(([k,v])=>`${k}=${v}`).join('; ')+'; penlight_tz=America/Indianapolis',...(b?{'content-type':'application/json'}:{})},body:b?JSON.stringify(b):undefined});for(const c of res.headers.getSetCookie?.()||[]){const [kv]=c.split(';');const i=kv.indexOf('=');cookies[kv.slice(0,i)]=kv.slice(i+1)}return res.json()}
const r=await req('POST','/api/ingest',{kind:'url',url});
for(let i=0;i<120;i++){const j=await req('GET','/api/jobs/'+r.jobId); if(j.status==='done'||j.status==='error'){console.log(url,j.status,j.error_code||'',(j.error||'').slice(0,200));break} await new Promise(s=>setTimeout(s,2000))}
