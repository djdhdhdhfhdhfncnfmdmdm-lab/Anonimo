// Loja Roblox — servidor único (Node 18+, sem instalar nada). Rodar: node server.js
// Variáveis de ambiente:
//  GOOGLE_CLIENT_ID = ID do cliente OAuth "Aplicativo da Web" (console.cloud.google.com > Credenciais).
//                     Coloque o endereço do seu site em "Origens JavaScript autorizadas".
//  MP_TOKEN         = Access Token de PRODUÇÃO do Mercado Pago (Suas integrações > Credenciais). É a conta base.
//  ADMIN_EMAIL      = seu Gmail: só ele entra em /editor.
//  STORE_NAME       = nome da loja (opcional).
//  MP_PRIVATE_KEY   = só p/ saque em produção: chave privada Ed25519 (PEM). A pública vai para o Mercado Pago
//                     (docs Payouts > "Subir em produção"). A API Payouts também precisa estar liberada na conta.
// Loja: /   Editor: /editor   Dados: db.json
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {GOOGLE_CLIENT_ID:CID,MP_TOKEN,ADMIN_EMAIL='',MP_PRIVATE_KEY,STORE_NAME='Loja Roblox',PORT=3000}=process.env;
let db={cats:[],prods:[],orders:[],tickets:[],out:[]};
try{db={...db,...JSON.parse(fs.readFileSync('db.json'))}}catch{}
const save=()=>fs.writeFileSync('db.json',JSON.stringify(db));
const uid=()=>crypto.randomUUID();
const MP=async(p,o={})=>{const r=await fetch('https://api.mercadopago.com'+p,{...o,headers:{Authorization:'Bearer '+MP_TOKEN,'Content-Type':'application/json',...o.headers}});return{ok:r.ok,j:await r.json().catch(()=>({}))}};
const who=async req=>{const t=(req.headers.authorization||'').slice(7);if(!t)return;
 const j=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(t)).then(r=>r.json()).catch(()=>({}));
 if(j.aud===CID&&j.email)return{email:j.email}};
const rate=id=>{const s=db.orders.filter(o=>o.pid===id&&o.stars).map(o=>o.stars);return{n:s.length,avg:s.length?s.reduce((a,b)=>a+b)/s.length:0}};
const pub=p=>({id:p.id,cat:p.cat,title:p.title,desc:p.desc,imgs:p.imgs,rate:rate(p.id),vars:p.vars.map(v=>({id:v.id,name:v.name,price:v.price,off:!!v.sold||v.until>Date.now()}))});
const saldo=()=>+(db.orders.filter(o=>o.status==='paid').reduce((a,o)=>a+o.net,0)-db.out.reduce((a,o)=>a+o.amount,0)).toFixed(2);
// consulta o pagamento no Mercado Pago; se aprovado, entrega a conta e credita o saldo
async function check(o){
 if(o.status!=='pending')return;
 const {j}=await MP('/v1/payments/'+o.mp);
 const p=db.prods.find(x=>x.id===o.pid),v=p?.vars.find(x=>x.id===o.vid);
 if(j.status==='approved'){Object.assign(o,{status:'paid',net:j.transaction_details?.net_received_amount??o.amount,title:(p?.title||'Conta')+(v?.name?' — '+v.name:''),login:v?.login,senha:v?.senha});if(v)v.sold=1;save()}
 else if(['cancelled','expired','rejected'].includes(j.status)){o.status='dead';if(v?.by===o.email)v.until=0;save()}
}
const S={'/':['loja.html','text/html;charset=utf-8'],'/editor':['editor.html','text/html;charset=utf-8'],'/logo.jpg':['logo.jpg','image/jpeg']};
http.createServer(async(req,res)=>{
 const send=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
 const {pathname:p,searchParams:q}=new URL(req.url,'http://x');
 if(!p.startsWith('/api/')){const f=S[p];if(!f){res.writeHead(404);return res.end()}res.writeHead(200,{'Content-Type':f[1]});return res.end(fs.readFileSync(path.join(__dirname,f[0])))}
 try{
  if(p==='/api/catalog')return send(200,{cid:CID,name:STORE_NAME,cats:db.cats,prods:db.prods.map(pub)});
  const u=await who(req);if(!u)return send(401,{error:'Entre com o Google'});
  let b={};if(req.method==='POST'){const d=[];let n=0;for await(const c of req){n+=c.length;if(n>25e6)throw Error('Arquivo grande demais');d.push(c)}const s=Buffer.concat(d).toString();b=s?JSON.parse(s):{}}
  if(p==='/api/pay'){
   const pr=db.prods.find(x=>x.id===b.pid),v=pr?.vars.find(x=>x.id===b.vid);
   if(!v||v.sold||(v.until>Date.now()&&v.by!==u.email))return send(409,{error:'Conta indisponível'});
   const id=uid(),until=Date.now()+15*60000;
   const r=await MP('/v1/payments',{method:'POST',headers:{'X-Idempotency-Key':id},body:JSON.stringify({transaction_amount:v.price,description:pr.title.slice(0,60),payment_method_id:'pix',payer:{email:u.email},date_of_expiration:new Date(until).toISOString().replace('Z','+00:00')})});
   const t=r.j.point_of_interaction?.transaction_data;
   if(!t)return send(502,{error:'Mercado Pago recusou: '+(r.j.message||'confira o MP_TOKEN')});
   Object.assign(v,{until,by:u.email});
   db.orders.push({id,mp:r.j.id,pid:pr.id,vid:v.id,email:u.email,amount:v.price,status:'pending',t:Date.now()});save();
   return send(200,{id,code:t.qr_code,img:t.qr_code_base64});
  }
  if(p==='/api/order'){const o=db.orders.find(x=>x.id===q.get('id')&&x.email===u.email);if(!o)return send(404,{error:'Pedido não encontrado'});await check(o);return send(200,{status:o.status,title:o.title,login:o.login,senha:o.senha})}
  if(p==='/api/my')return send(200,db.orders.filter(o=>o.email===u.email&&o.status==='paid').map(({id,title,login,senha,t,stars})=>({id,title,login,senha,t,stars})).reverse());
  if(p==='/api/review'){const o=db.orders.find(x=>x.id===b.id&&x.email===u.email&&x.status==='paid');if(o){o.stars=Math.min(5,Math.max(1,+b.stars|0));save()}return send(200,{ok:1})}
  if(p==='/api/ticket'){db.tickets.push({id:uid(),email:u.email,kind:b.kind==='venda'?'venda':'suporte',text:String(b.text||'').slice(0,3000),t:Date.now()});save();return send(200,{ok:1})}
  if(u.email.toLowerCase()!==ADMIN_EMAIL.toLowerCase())return send(403,{error:'Somente o dono da loja acessa o editor'});
  if(p==='/api/admin/data')return send(200,{cats:db.cats,prods:db.prods,sales:db.orders.filter(o=>o.status==='paid'),tickets:db.tickets,saldo:saldo()});
  if(p==='/api/admin/cat'){if(!b.name||!b.img)return send(400,{error:'Informe nome e imagem'});db.cats.push({id:uid(),name:b.name,img:b.img,tip:b.tip||''});save();return send(200,{ok:1})}
  if(p==='/api/admin/prod'){
   if(!b.title||!b.cat||!b.vars?.length||b.vars.some(v=>!(+v.price>0)||!v.login||!v.senha))return send(400,{error:'Preencha categoria, título, preço, login e senha'});
   db.prods.push({id:uid(),cat:b.cat,title:b.title,desc:b.desc||'',imgs:b.imgs||[],vars:b.vars.map(v=>({id:uid(),name:v.name||'',price:+v.price,login:v.login,senha:v.senha}))});save();return send(200,{ok:1})}
  if(p==='/api/admin/del'){const k={cat:'cats',prod:'prods',ticket:'tickets'}[b.kind];if(k)db[k]=db[k].filter(x=>x.id!==b.id);if(b.kind==='cat')db.prods=db.prods.filter(x=>x.cat!==b.id);save();return send(200,{ok:1})}
  if(p==='/api/admin/withdraw'){
   const a=+b.amount;if(!(a>=1&&a<=saldo()))return send(400,{error:'Valor inválido ou maior que o saldo'});
   const body=JSON.stringify({external_reference:'saque'+Date.now(),description:'Saque da loja',transactions:[{type:'pix',pix:{type:b.type,chave:b.key},amount:{currency:'BRL',value:a}}]});
   const h={'X-Idempotency-Key':uid(),'X-enforce-signature':MP_PRIVATE_KEY?'true':'false'};
   if(MP_PRIVATE_KEY)h['X-signature']=crypto.sign(null,Buffer.from(body),crypto.createPrivateKey(MP_PRIVATE_KEY.replace(/\\n/g,'\n'))).toString('base64');
   const r=await MP('/v1/payouts',{method:'POST',headers:h,body});
   if(!r.ok)return send(400,{error:'Mercado Pago recusou o saque: '+JSON.stringify(r.j).slice(0,160)});
   db.out.push({id:r.j.id,amount:a,key:b.key,t:Date.now()});save();return send(200,{saldo:saldo()});
  }
  send(404,{error:'Rota não encontrada'});
 }catch(e){send(500,{error:e.message})}
}).listen(PORT,()=>console.log('Loja rodando em http://localhost:'+PORT));
