// Прототип: достаёт логи, лежащие внутри базы IndexedDB приложения (файлы .ldb и .log). Пути правятся под свою папку.
const fs=require('fs'),unsnappy=require('/tmp/idb/snappy.js'),parse=require('/tmp/idb/v8parse.js');
const D='/mnt/user-data/uploads/Majestic Log Advisor/IndexedDB/file__0.indexeddb.leveldb/';
function varint(b,p){let r=0,s=0,c;do{c=b[p++];r+=(c&0x7f)*Math.pow(2,s);s+=7}while(c&0x80);return [r,p]}
function block(buf,off,size){let raw=buf.subarray(off,off+size),t=buf[off+size];if(t===1)raw=unsnappy(buf.subarray(off,off+size+1),0);return raw}
function entries(b){const n=b.readUInt32LE(b.length-4);const end=b.length-4-4*n;let p=0,key=Buffer.alloc(0),out=[];while(p<end){let sh,ns,vl;[sh,p]=varint(b,p);[ns,p]=varint(b,p);[vl,p]=varint(b,p);key=Buffer.concat([key.subarray(0,sh),b.subarray(p,p+ns)]);p+=ns;out.push([key,b.subarray(p,p+vl)]);p+=vl}return out}
function ldb(f){const b=fs.readFileSync(f),ft=b.subarray(b.length-48);let p=0,o,s;[o,p]=varint(ft,p);[s,p]=varint(ft,p);[o,p]=varint(ft,p);let ioff,isz;p=0;[o,p]=varint(ft,p);[s,p]=varint(ft,p);ioff=undefined;
 // footer: metaindex handle then index handle
 let q=0,mo,ms,io,is;[mo,q]=varint(ft,q);[ms,q]=varint(ft,q);[io,q]=varint(ft,q);[is,q]=varint(ft,q);
 const idx=entries(block(b,io,is));let res=[];for(const [k,v] of idx){let a,c,pp=0;[a,pp]=varint(v,pp);[c,pp]=varint(v,pp);try{res.push(...entries(block(b,a,c)))}catch(e){}}return res}
function wal(f){const b=fs.readFileSync(f);let res=[];let pos=0,frag=[];while(pos+7<=b.length){const bo=pos%32768;if(32768-bo<7){pos+=32768-bo;continue}const len=b.readUInt16LE(pos+4),type=b[pos+6];if(!type&&!len){pos+=32768-bo;continue}const d=b.subarray(pos+7,pos+7+len);pos+=7+len;if(type===1)handle(d);else if(type===2)frag=[d];else if(type===3)frag.push(d);else if(type===4){frag.push(d);handle(Buffer.concat(frag));frag=[]}}
 function handle(r){let p=12;const cnt=r.readUInt32LE(8);for(let i=0;i<cnt&&p<r.length;i++){const t=r[p++];let kl,vl;[kl,p]=varint(r,p);const k=r.subarray(p,p+kl);p+=kl;if(t===1){[vl,p]=varint(r,p);res.push([k,r.subarray(p,p+vl)]);p+=vl}else res.push([k,null])}}
 return res}
let all=[];for(const f of ['000014.ldb','000015.ldb'])try{all.push(...ldb(D+f))}catch(e){console.log(f,e.message)}
try{all.push(...wal(D+'000012.log'))}catch(e){console.log('wal',e.message)}
console.log('entries',all.length);
const big=all.filter(([k,v])=>v&&v.length>2000);console.log('big values',big.length);
fs.mkdirSync('/tmp/old2',{recursive:true});let ok=0,fail=0,seen=new Set();
big.forEach(([k,v],i)=>{try{let b=v,p=0;// idb value: varint version, then blink wrapper
 let vp=0;while(b[vp]&0x80)vp++;vp++;b=b.subarray(vp);
 if(b[0]!==0xff)throw new Error('hdr '+b[0]);let q=1;while(b[q]&0x80)q++;q++;if(b[q]===2)b=unsnappy(b,q+1);const o=parse(b);if(typeof o.text!=='string')throw new Error('no text');const h=require('crypto').createHash('md5').update(o.text).digest('hex');if(seen.has(h))return;seen.add(h);fs.writeFileSync('/tmp/old2/'+String(i).padStart(4,'0')+'.log',o.text);ok++}catch(e){fail++;if(fail<5)console.log('fail',i,v.length,e.message)}});
console.log('ok',ok,'fail',fail);
