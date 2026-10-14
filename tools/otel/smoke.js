'use strict';
// Real OTel SDK -> loopback OTLP integration smoke test.
// Requires npm install; no vendor credentials or Internet access.
const http=require('node:http'),assert=require('node:assert/strict');
async function main(){
 const seen=[];
 const collector=http.createServer((req,res)=>{
  let bytes=0;
  req.on('data',chunk=>{bytes+=chunk.length;});
  req.on('end',()=>{
   seen.push({path:req.url,bytes});
   res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');
  });
 });
 await new Promise(resolve=>collector.listen(0,'127.0.0.1',resolve));
 const port=collector.address().port;
 process.env.ICEBREAKER_OTEL_ENABLED='1';
 process.env.ICEBREAKER_OTEL_TRACES_URL='http://127.0.0.1:'+port+'/v1/traces';
 process.env.ICEBREAKER_OTEL_METRICS_URL='http://127.0.0.1:'+port+'/v1/metrics';
 try{
  const {sdk}=require('../../apps/rink-local/server/otel-bootstrap');
  const telemetry=require('../../apps/rink-local/server/telemetry');
  telemetry.withSpan('icebreaker.smoke',{'icebreaker.route.family':'health'},()=>{});
  telemetry.recordGameCommand({type:'GOAL_RECORDED',scorer:'DO_NOT_EXPORT'},()=>({accepted:true}));
  await sdk.shutdown();
  assert.ok(seen.some(x=>x.path==='/v1/traces'&&x.bytes>0),'No OTLP traces exported');
  assert.ok(seen.some(x=>x.path==='/v1/metrics'&&x.bytes>0),'No OTLP metrics exported');
  process.stdout.write('OTLP localhost traces and metrics exported successfully\n');
 }finally{await new Promise(resolve=>collector.close(resolve));}
}
main().catch(e=>{process.stderr.write('OTLP smoke test failed: '+e.message+'\n');process.exitCode=1;});
