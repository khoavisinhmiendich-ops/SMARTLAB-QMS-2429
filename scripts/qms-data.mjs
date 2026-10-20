#!/usr/bin/env node
// Công cụ dữ liệu QMS 2429: đồng bộ/sao lưu/khôi phục dữ liệu nhập và thêm tệp tài liệu mới an toàn.
//   node scripts/qms-data.mjs auto                      (tự chạy trước npm run dev / build / start)
//   node scripts/qms-data.mjs status | list | restore
//   node scripts/qms-data.mjs add-file "<tệp>" "<thư mục con trong public/2429.2026>" [--replace]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd();
function envLocal(key){
  try{for(const line of fs.readFileSync(path.join(root,'.env.local'),'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m&&m[1]===key)return m[2].replace(/^["']|["']$/g,'');}}catch{}
  return '';
}
const pick=k=>process.env[k]||envLocal(k);
const recordsDir=pick('QMS_DATA_DIR')?path.resolve(pick('QMS_DATA_DIR')):path.join(root,'.data','records');
const backups=[pick('QMS_BACKUP_DIR')?path.resolve(pick('QMS_BACKUP_DIR')):path.join(root,'..','qms-backup-2429'),path.join(root,'.data','backup')];
const publicRoot=path.join(root,'public','2429.2026');
const allowedExt=new Set(['.docx','.pdf','.xlsx','.jpg','.jpeg','.png']);
const readJson=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return null}};
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
function keepHistory(base,key,prevText,prevRec){
  const dir=path.join(base,'history',key);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,String(prevRec?.updated_at||stamp()).replace(/[:.]/g,'-')+'.json'),prevText);
  const all=fs.readdirSync(dir).sort();for(const f of all.slice(0,Math.max(0,all.length-30)))try{fs.unlinkSync(path.join(dir,f))}catch{}
}
// Đồng bộ hai chiều theo updated_at: bản mới hơn thắng; bản bị ghi đè luôn được giữ trong history.
function sync(){
  const res={toBackup:0,toPrimary:0};
  fs.mkdirSync(recordsDir,{recursive:true});
  const keys=new Set(fs.readdirSync(recordsDir).filter(f=>f.endsWith('.json')).map(f=>f.slice(0,-5)));
  for(const b of backups)try{for(const f of fs.readdirSync(path.join(b,'latest')))if(f.endsWith('.json'))keys.add(f.slice(0,-5))}catch{}
  for(const key of keys){
    const pf=path.join(recordsDir,key+'.json');let p=readJson(pf);
    let best=p;for(const b of backups){const r=readJson(path.join(b,'latest',key+'.json'));if(r&&(!best||String(r.updated_at)>String(best.updated_at)))best=r}
    if(!best)continue;
    if(!p||String(best.updated_at)>String(p.updated_at)){
      if(p)try{keepHistory(backups[1],key,fs.readFileSync(pf,'utf8'),p)}catch{}
      fs.writeFileSync(pf,JSON.stringify({document_id:best.document_id,user_id:best.user_id,data:best.data,updated_at:best.updated_at}));res.toPrimary++;p=best;
    }
    for(const b of backups)try{
      const lf=path.join(b,'latest',key+'.json');const prevText=fs.existsSync(lf)?fs.readFileSync(lf,'utf8'):'';const prev=prevText?readJson(lf):null;
      if(prev&&JSON.stringify(prev.data)===JSON.stringify(p.data))continue;
      if(prev)keepHistory(b,key,prevText,prev);
      fs.mkdirSync(path.dirname(lf),{recursive:true});
      let rel;try{const s=Buffer.from(p.document_id,'base64url').toString('utf8');rel=/[\\/]/.test(s)?s:undefined}catch{}
      fs.writeFileSync(lf,JSON.stringify({document_id:p.document_id,user_id:p.user_id,data:p.data,updated_at:p.updated_at,path:rel}));res.toBackup++;
    }catch{}
  }
  return res;
}
function list(){
  const rows=[];
  for(const f of fs.existsSync(recordsDir)?fs.readdirSync(recordsDir):[]){if(!f.endsWith('.json'))continue;const r=readJson(path.join(recordsDir,f));if(!r)continue;
    let rel='?';try{rel=Buffer.from(r.document_id,'base64url').toString('utf8')}catch{}
    rows.push({updated:r.updated_at,file:rel,exists:fs.existsSync(path.join(publicRoot,rel))})}
  return rows.sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));
}
function addFile(src,folder,replace){
  if(!src||!folder)throw new Error('Cách dùng: npm run add-file -- "<đường dẫn tệp>" "<thư mục con trong public/2429.2026>" [--replace]');
  if(!fs.existsSync(src)||!fs.statSync(src).isFile())throw new Error('Không tìm thấy tệp: '+src);
  const ext=path.extname(src).toLowerCase();if(!allowedExt.has(ext))throw new Error('Chỉ nhận: '+[...allowedExt].join(', '));
  const destDir=path.resolve(publicRoot,folder);
  if(destDir!==publicRoot&&!destDir.startsWith(publicRoot+path.sep))throw new Error('Thư mục đích phải nằm trong public/2429.2026.');
  const dest=path.join(destDir,path.basename(src));
  sync(); // chụp dữ liệu trước khi thay đổi
  if(fs.existsSync(dest)){
    if(!replace)throw new Error('Tệp đã tồn tại: '+dest+'\nDùng --replace để thay (tệp cũ được lưu vào bản sao lưu; dữ liệu đã nhập vẫn giữ vì gắn với đường dẫn).');
    for(const b of backups)try{const d=path.join(b,'replaced-files',stamp());fs.mkdirSync(d,{recursive:true});fs.copyFileSync(dest,path.join(d,path.basename(dest)))}catch{}
  }
  fs.mkdirSync(destDir,{recursive:true});fs.copyFileSync(src,dest);
  return dest;
}
const [cmd='auto',...args]=process.argv.slice(2);
try{
  if(cmd==='auto'){const r=sync();if(r.toBackup||r.toPrimary)console.log(`[QMS] Sao lưu dữ liệu: ${r.toBackup} bản ghi vào bản phụ, ${r.toPrimary} bản ghi khôi phục từ bản phụ.`);}
  else if(cmd==='restore'){const r=sync();console.log(`Đã đồng bộ: khôi phục ${r.toPrimary} bản ghi, sao lưu ${r.toBackup} bản ghi.`);}
  else if(cmd==='list'){const rows=list();console.log(rows.length?rows.map(r=>`${r.updated}  ${r.exists?'   ':'MẤT'}  ${r.file}`).join('\n'):'Chưa có dữ liệu nhập nào.');console.log('(MẤT = tệp tài liệu không còn ở vị trí cũ; dữ liệu vẫn còn, đưa tệp về đúng thư mục/tên cũ để hiển thị lại)')}
  else if(cmd==='status'){const rows=list();console.log('Dữ liệu chính :',recordsDir,`(${rows.length} bản ghi)`);for(const b of backups){let n=0;try{n=fs.readdirSync(path.join(b,'latest')).length}catch{}console.log('Bản sao lưu    :',b,`(${n} bản ghi)`)}}
  else if(cmd==='add-file'){const f=addFile(args.find(a=>!a.startsWith('--')),args.filter(a=>!a.startsWith('--'))[1],args.includes('--replace'));console.log('Đã thêm:',f,'\nTài liệu mới sẽ hiện trong thư viện (làm mới trang; nếu đang chạy bản build thì khởi động lại).')}
  else console.log('Lệnh: auto | status | list | restore | add-file');
}catch(e){console.error('[QMS] '+(e&&e.message||e));process.exit(cmd==='auto'?0:1)}
