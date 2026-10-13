'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const page=path.join(__dirname,'../../web/referee-review.html');
const script=path.join(__dirname,'../../web/referee-review.js');
function mockElement(){
 const listeners={};
 return {
  textContent:'',value:'',checked:false,disabled:false,children:[],
  classList:{add(){},remove(){}},
  append(...nodes){this.children.push(...nodes);},
  replaceChildren(...nodes){this.children=[...nodes];},
  addEventListener(name,fn){listeners[name]=fn;},
  fire(name){listeners[name]?.();}
 };
}
function setup(){
 const elements=new Map();
 const get=id=>{if(!elements.has(id))elements.set(id,mockElement());return elements.get(id);};
 let server={revision:1,digest:'a'.repeat(64),status:'SUBMITTED'};
 let signCalls=0,submitted=null;
 const document={
  getElementById:get,
  createElement:()=>mockElement()
 };
 const fetch=async(url,opts={})=>{
  const route=String(url).split('/api/scoresheet/v1/')[1];
  let body={};
  if(route==='referee/login')body={token:'fake-test-session'};
  else if(route==='review')body={...server,document:{score:{home:3,away:2},shots:{home:12,away:10},goals:[],penalties:[],byPeriod:[]}};
  else if(route==='sign'){signCalls++;submitted=JSON.parse(opts.body);body={status:'CERTIFIED',at:'2026-10-13T12:00:00Z'};}
  else throw Error('Unexpected route '+route);
  return {ok:true,json:async()=>body};
 };
 vm.runInNewContext(fs.readFileSync(script,'utf8'),{document,fetch,window:{print(){}}},{filename:'referee-review.js'});
 return {get,server,setServer(x){server=x;},calls:()=>signCalls,submitted:()=>submitted};
}
test('mobile signing UI exposes revision, intent and responsive controls',()=>{
 const html=fs.readFileSync(page,'utf8');
 for(const fragment of ['name="viewport"','id="signRevision"','id="signStatus"','id="intent"','id="approve"','id="reject"','id="digest"','@media(max-width:600px)'])
  assert.ok(html.includes(fragment),'Missing '+fragment);
});
test('referee cannot sign before intent or after server revision changes',async()=>{
 const x=setup();
 x.get('refId').value='official-1';x.get('password').value='fictional-secret';
 await x.get('loginBtn').onclick();
 assert.equal(x.get('approve').disabled,true);
 assert.equal(x.get('signRevision').textContent,'Revision 1');
 x.get('intent').checked=true;x.get('intent').fire('change');
 assert.equal(x.get('approve').disabled,false);
 x.setServer({revision:2,digest:'b'.repeat(64),status:'SUBMITTED'});
 await x.get('approve').onclick();
 assert.equal(x.calls(),0);
 assert.match(x.get('decisionMessage').textContent,/changed/);
});
test('fresh review binds the exact digest and prevents a duplicate signature',async()=>{
 const x=setup();
 x.get('refId').value='official-1';x.get('password').value='fictional-secret';
 await x.get('loginBtn').onclick();
 x.get('intent').checked=true;x.get('intent').fire('change');
 await x.get('approve').onclick();
 assert.equal(x.calls(),1);
 assert.equal(x.submitted().revision,1);
 assert.equal(x.submitted().digest,'a'.repeat(64));
 assert.equal(x.get('approve').disabled,true);
 await x.get('approve').onclick();
 assert.equal(x.calls(),1);
});
test('request correction requires explanation, not signature intent',async()=>{
 const x=setup();
 x.get('refId').value='official-1';x.get('password').value='fictional-secret';
 await x.get('loginBtn').onclick();
 assert.equal(x.get('reject').disabled,false);
 await x.get('reject').onclick();
 assert.equal(x.calls(),0);
 assert.match(x.get('decisionMessage').textContent,/Explain/);
 x.get('reason').value='Goal scorer is incorrect';
 await x.get('reject').onclick();
 assert.equal(x.calls(),1);
 assert.equal(x.submitted().decision,'REQUEST_CORRECTION');
});
