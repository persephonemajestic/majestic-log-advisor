// Ищет строки Error/Warning/ERR_*, которые не покрыты ни одним правилом: node scripts/uncovered-lines.js <папка logs_preprocessed>
const fs=require('fs'),vm=require('vm'),path=require('path');
const ctx={console};ctx.root=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('src/core.js','utf8'),ctx);const LA=ctx.LA||vm.runInContext('LA',ctx);
const rules=LA.RULES;
function covered(l){const low=l.toLowerCase();for(const r of rules){try{if(r.re&&r.re.test(l))return true;if(r.kw&&[].concat(r.kw).some(k=>low.includes(String(k).toLowerCase())))return true}catch(e){}}return false}
const norm=l=>l.replace(/^\[[^\]]*\]/,'').replace(/0x[0-9a-f]+/gi,'0xN').replace(/\d+(\.\d+)?/g,'N').replace(/[A-Za-z]:\\[^\s'"]*/g,'<p>').trim().slice(0,160);
const lv=/\[(Error|Fatal|Critical)\]|\bERR_[A-Z_]+|\[Warning\]/i;const skip=/^\s*(\[[^\]]*\])?\s*at |^\s*[}\]]|^\s*-- 0x/;
const dir=process.argv[2],tot={},ex={};
fs.readdirSync(dir).filter(f=>/\.log$/.test(f)).forEach(f=>{const seen=new Set();fs.readFileSync(path.join(dir,f),'utf8').split('\n').forEach(l=>{if(!lv.test(l)||skip.test(l.replace(/^\[[^\]]*\]\[[^\]]*\]/,'')))return;const k=norm(l);if(seen.has(k))return;seen.add(k);if(covered(l))return;tot[k]=(tot[k]||0)+1;ex[k]=ex[k]||f})});
const arr=Object.entries(tot).sort((a,b)=>b[1]-a[1]);console.log('uncovered kinds',arr.length);
fs.writeFileSync(process.argv[3]||require('path').join(require('os').tmpdir(),'unc.txt'),arr.slice(0,300).map(([k,v])=>v+'\t'+k).join('\n'));
