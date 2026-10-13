#!/usr/bin/env node
'use strict';
// Read-only SQLite schema inventory: no user rows are accessed.
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const tick=String.fromCharCode(96);
const q=n=>'"'+n.replace(/"/g,'""')+'"';
function describe(db){
 const objects=db.prepare("SELECT name,type,sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
 return objects.map(o=>{
  const cols=db.prepare('PRAGMA table_xinfo('+q(o.name)+')').all();
  const fks=db.prepare('PRAGMA foreign_key_list('+q(o.name)+')').all();
  const indexes=o.type==='table'?db.prepare('PRAGMA index_list('+q(o.name)+')').all().map(i=>({
   name:i.name,unique:!!i.unique,origin:i.origin,partial:!!i.partial,
   columns:db.prepare('PRAGMA index_info('+q(i.name)+')').all().map(c=>c.name),
   sql:db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(i.name)?.sql||null
  })):[];
  return {name:o.name,type:o.type,sql:o.sql,
   columns:cols.map(c=>({name:c.name,type:c.type,notNull:!!c.notnull,pk:c.pk,default:c.dflt_value,hidden:c.hidden})),
   foreignKeys:fks.map(k=>({from:k.from,toTable:k.table,to:k.to,onDelete:k.on_delete,onUpdate:k.on_update,id:k.id,seq:k.seq})),
   indexes};
 });
}
function inventory(file,label){
 const db=new DatabaseSync(file,{readOnly:true});
 try{return {label,fileName:path.basename(file),objects:describe(db)};}
 finally{db.close();}
}
function render(databases){
 const lines=['# IceBreaker SQLite Schema Reference','',
  'Generated from actual SQLite metadata, including columns added by migrations. No user records are accessed.','',
  'League/rink, encrypted evidence, and central ingest are separate trust domains. Identically named tables across databases are not interchangeable.',''];
 for(const db of databases){
  lines.push('## '+db.label,'','Source: '+tick+db.fileName+tick+'. '+db.objects.length+' schema objects.','');
  for(const o of db.objects){
   lines.push('### '+tick+o.name+tick+' ('+o.type+')','','| Column | Type | Required | PK ordinal | Default |','|---|---|---|---:|---|');
   for(const c of o.columns)lines.push('| '+tick+c.name+tick+' | '+(c.type||'')+' | '+(c.notNull?'Yes':'No')+' | '+(c.pk||'')+' | '+(c.default===null?'':String(c.default).replace(/\|/g,'\\|'))+' |');
   lines.push('');
   if(o.foreignKeys.length){
    lines.push('**Foreign keys**');
    for(const k of o.foreignKeys)lines.push('- '+tick+k.from+tick+' → '+tick+k.toTable+'.'+k.to+tick+' (delete '+k.onDelete+')');
    lines.push('');
   }
   if(o.indexes.length){
    lines.push('**Indexes**');
    for(const i of o.indexes)lines.push('- '+tick+i.name+tick+(i.unique?' (unique)':'')+(i.partial?' (partial)':'')+': '+i.columns.map(x=>x?tick+x+tick:'expression').join(', '));
    lines.push('');
   }
   if(o.sql)lines.push('<details><summary>SQLite DDL</summary>','',tick.repeat(3)+'sql',o.sql.trim()+';',tick.repeat(3),'','</details>','');
  }
 }
 return lines.join('\n')+'\n';
}
function parse(argv){
 const inputs=[];let out=null;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--db'&&i+2<argv.length)inputs.push({file:argv[++i],label:argv[++i]});
  else if(argv[i]==='--out'&&i+1<argv.length)out=argv[++i];
  else throw Error('Usage: schema-catalog.js --db path "Display name" [--db path "Display name"] [--out reference.md]');
 }
 if(!inputs.length)throw Error('At least one --db is required');
 for(const x of inputs)if(!fs.existsSync(x.file))throw Error('Database does not exist: '+x.file);
 return {inputs,out};
}
function main(argv=process.argv.slice(2)){
 const {inputs,out}=parse(argv),doc=render(inputs.map(x=>inventory(x.file,x.label)));
 if(out)fs.writeFileSync(path.resolve(out),doc,'utf8');else process.stdout.write(doc);
}
if(require.main===module){try{main();}catch(e){process.stderr.write('Schema catalog: '+e.message+'\n');process.exitCode=1;}}
module.exports={describe,inventory,render,parse,main};
