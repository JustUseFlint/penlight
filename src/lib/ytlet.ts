/**
 * "Send to Penlight" bookmarklet.
 *
 * YouTube refuses caption requests that come from a hosting provider's IP address, but it happily serves the same
 * captions to a person's own browser. The bookmarklet runs INSIDE the student's YouTube tab (so the request comes from
 * their home/phone network and their normal session), reads the transcript the same way YouTube's own "Show transcript"
 * panel does, and hands it to Penlight in the URL fragment (#...), which browsers never send to any server.
 *
 * Strategy order inside the YouTube tab: (1) innertube get_transcript (what the Show-transcript panel calls),
 * (2) the caption track's json3 file, (3) open the transcript panel and read the rows on screen.
 */
export const BOOKMARKLET_SRC = String.raw`(async function(){
var O="__ORIGIN__";
function say(m,bad){var d=document.getElementById("pl-say");if(!d){d=document.createElement("div");d.id="pl-say";document.body.appendChild(d)}d.style.cssText="position:fixed;z-index:2147483647;top:16px;left:50%;transform:translateX(-50%);max-width:92vw;background:"+(bad?"#b91c1c":"#0f766e")+";color:#fff;font:600 15px/1.35 system-ui,sans-serif;padding:12px 18px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.35)";d.textContent=m}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
function esc(s){try{return JSON.parse('"'+s+'"')}catch(e){return s}}
function balanced(str,from){var o=str[from],c=o==="["?"]":"}",d=0,q=false,i=from;for(;i<str.length;i++){var ch=str[i];if(q){if(ch==="\\")i++;else if(ch==='"')q=false}else if(ch==='"')q=true;else if(ch===o)d++;else if(ch===c){d--;if(d===0)return str.slice(from,i+1)}}return null}
function fromRenderer(j){var out=[];(function w(o){if(!o||typeof o!=="object")return;if(o.transcriptSegmentRenderer){var t=o.transcriptSegmentRenderer;var tx=t.snippet&&(t.snippet.simpleText||(t.snippet.runs||[]).map(function(x){return x.text}).join(""));if(tx)out.push([Number(t.startMs)/1000,tx])}else for(var k in o)w(o[k])})(j);return out}
try{
if(!/(^|\.)youtube\.com$/.test(location.hostname)){say("Open a YouTube video first, then click this again.",1);return}
var u=new URL(location.href),id=u.searchParams.get("v");
if(!id){var p=u.pathname.split("/").filter(Boolean);if(["shorts","live","embed"].indexOf(p[0])>-1)id=p[1]}
if(!id||!/^[A-Za-z0-9_-]{11}$/.test(id)){say("Open a YouTube video page first, then click this again.",1);return}
say("Penlight: reading the transcript...");
var title=(document.title||"").replace(/^\(\d+\)\s*/,"").replace(/\s*-\s*YouTube$/,"")||"YouTube lecture";
var segs=[],html="",ctx=null,key=null;
try{ctx=ytcfg.get("INNERTUBE_CONTEXT");key=ytcfg.get("INNERTUBE_API_KEY")}catch(e){}
try{html=await (await fetch("/watch?v="+id,{credentials:"include"})).text()}catch(e){}
var m=html.match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/);
if(m&&ctx){try{var r=await fetch("/youtubei/v1/get_transcript?prettyPrint=false"+(key?"&key="+key:""),{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({context:ctx,params:esc(m[1])})});segs=fromRenderer(await r.json())}catch(e){}}
if(segs.length<5&&html){try{var i=html.indexOf('"captionTracks":');if(i>-1){var arr=JSON.parse(balanced(html,html.indexOf("[",i)));arr.sort(function(a,b){var x=(a.languageCode||"").indexOf("en")===0?0:1,y=(b.languageCode||"").indexOf("en")===0?0:1;if(x!==y)return x-y;return (a.kind==="asr"?1:0)-(b.kind==="asr"?1:0)});var t=arr[0];if(t&&t.baseUrl){var j=await (await fetch(t.baseUrl.replace(/\\u0026/g,"&")+"&fmt=json3",{credentials:"include"})).json();var s2=[];(j.events||[]).forEach(function(e){if(e.segs){var tx=e.segs.map(function(z){return z.utf8}).join("").replace(/\s+/g," ").trim();if(tx)s2.push([(e.tStartMs||0)/1000,tx])}});if(s2.length>segs.length)segs=s2}}}catch(e){}}
if(segs.length<5){try{var btn=[].slice.call(document.querySelectorAll("button")).filter(function(b){return /show transcript/i.test((b.getAttribute("aria-label")||"")+" "+b.textContent)})[0];if(btn)btn.click();for(var n=0;n<16&&!document.querySelector("ytd-transcript-segment-renderer");n++)await sleep(300);var rows=[].slice.call(document.querySelectorAll("ytd-transcript-segment-renderer")),s3=[];rows.forEach(function(el){var ts=(el.querySelector(".segment-timestamp")||{}).textContent||"",tx=((el.querySelector(".segment-text")||{}).textContent||"").replace(/\s+/g," ").trim();var a=ts.trim().split(":").map(Number).reduce(function(x,y){return x*60+y},0);if(tx)s3.push([a,tx])});if(s3.length>segs.length)segs=s3}catch(e){}}
if(segs.length<5){say("Penlight could not find captions on this video. Open the transcript panel (...more > Show transcript), copy it, and paste it into Penlight.",1);return}
var payload=JSON.stringify({v:1,t:title,u:"https://www.youtube.com/watch?v="+id,s:segs.map(function(x){return [Math.round(x[0]),x[1]]})});
var b64=btoa(unescape(encodeURIComponent(payload))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
say("Got "+segs.length+" lines. Opening Penlight...");
var win=window.open(O+"/import#"+b64,"_blank");
if(!win){location.href=O+"/import#"+b64}
}catch(err){say("Penlight hit a snag: "+(err&&err.message||err),1)}
})();`;

/** javascript: URL for the bookmark. Origin is the Penlight site the student is on right now. */
export function bookmarkletHref(origin: string): string {
  return 'javascript:' + encodeURIComponent(BOOKMARKLET_SRC.replace('__ORIGIN__', origin.replace(/\/$/, '')));
}
export function bookmarkletCode(origin: string): string {
  return 'javascript:' + BOOKMARKLET_SRC.replace('__ORIGIN__', origin.replace(/\/$/, '')).replace(/\n/g, '');
}

export function decodeImportHash(hash: string): { title: string; url: string; segments: { start: number; text: string }[] } | null {
  try {
    const b64 = hash.replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const json = decodeURIComponent(escape(bin));
    const d = JSON.parse(json) as { v: number; t?: string; u?: string; s?: [number, string][] };
    if (d.v !== 1 || !Array.isArray(d.s)) return null;
    const segments = d.s.filter((x) => Array.isArray(x) && typeof x[1] === 'string' && x[1].trim()).map((x) => ({ start: Math.max(0, Number(x[0]) || 0), text: String(x[1]).trim() }));
    return { title: (d.t || 'YouTube lecture').slice(0, 200), url: d.u || '', segments };
  } catch { return null; }
}
/** Segments → the "m:ss text" lines Penlight's paste parser understands (keeps timestamps so key points link back to the video). */
export function segmentsToStampedText(segs: { start: number; text: string }[]): string {
  const f = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60); return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(x).padStart(2, '0')}`; };
  return segs.map((s) => `${f(s.start)} ${s.text}`).join('\n');
}
