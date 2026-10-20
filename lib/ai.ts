import {aiConfig,type ProviderConfig} from '../ai.config';
export type ChatMessage={role:'user'|'assistant';content:string};
export type AiSource={title:string;url:string};
export type AiAnswer={answer:string;sources:AiSource[];provider:string};
export type FailKind='quota'|'auth'|'model'|'network'|'other';
export class AiError extends Error{
  constructor(public kind:FailKind,message:string,public status=0,public retryAfter=0,public detail=''){super(message);}
}
export const resolveKey=(p:ProviderConfig):string=>(p.apiKey||(p.apiKeyEnv?process.env[p.apiKeyEnv]:'')||'').trim();
// Kết nối đang dùng được: bật + có API key (hoặc là model cục bộ có địa chỉ).
export const usable=(p:ProviderConfig)=>p.enabled&&(p.type==='openai-compatible'?!!p.baseUrl:!!resolveKey(p));
// Bỏ qua kết nối trùng lặp (cùng loại + model + địa chỉ) để không gọi hai lần vô ích.
export const activeProviders=()=>{const seen=new Set<string>();return aiConfig.providers.filter(usable).filter(p=>{const k=[p.type,p.model,p.baseUrl||'',resolveKey(p)].join('|');if(seen.has(k))return false;seen.add(k);return true;});};
export const providerStatus=()=>aiConfig.providers.map(p=>({name:p.name,type:p.type,model:p.model,enabled:p.enabled,hasKey:p.type==='openai-compatible'?!!p.baseUrl:!!resolveKey(p),webSearch:!!p.webSearch,inlineKey:!!p.apiKey&&p.type!=='openai-compatible'}));

// Hội thoại hợp lệ cho mọi nhà cung cấp: bắt đầu bằng "user", các lượt liên tiếp cùng vai trò được gộp.
function normalizeTurns(history:ChatMessage[]):ChatMessage[]{
  const out:ChatMessage[]=[];
  for(const m of history){const prev=out[out.length-1];if(prev&&prev.role===m.role)prev.content+='\n\n'+m.content;else out.push({role:m.role,content:m.content});}
  while(out.length&&out[0].role!=='user')out.shift();
  return out;
}
const short=(v:unknown)=>{try{return (typeof v==='string'?v:JSON.stringify(v)).slice(0,300)}catch{return ''}};
function classify(status:number,detail:string,retryAfter=0):AiError{
  if(status===400&&/API.?KEY.?INVALID|API key not valid|invalid.{0,10}api.?key/i.test(detail))return new AiError('auth','API key sai hoặc không có quyền',status,0,detail);
  if(status===429||/RESOURCE_EXHAUSTED|rate.?limit|quota|insufficient_quota/i.test(detail)&&status!==401&&status!==403)return new AiError('quota','hết hạn mức hoặc giới hạn tốc độ',status,retryAfter,detail);
  if(status===401||status===403)return new AiError('auth','API key sai hoặc không có quyền',status,0,detail);
  if(status===404||status===400&&/models?\/[\w.\-]+[^\n]{0,80}(not found|not supported|does not exist)|model[^\n]{0,40}(not found|not supported|does not exist|is not available)/i.test(detail))return new AiError('model','tên model không đúng hoặc chưa được cấp quyền',status,0,detail);
  if(status>=500||status===0)return new AiError('network','dịch vụ tạm thời lỗi hoặc không kết nối được',status,0,detail);
  return new AiError('other','dịch vụ trả về lỗi '+status,status,0,detail);
}
async function post(url:string,headers:Record<string,string>,body:unknown):Promise<{status:number;data:any}>{
  let res:Response;
  try{res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(aiConfig.timeoutMs)});}
  catch(e){throw new AiError('network',e instanceof Error&&e.name==='TimeoutError'?'quá thời gian chờ':'không kết nối được',0);}
  const data=await res.json().catch(()=>({}));
  return {status:res.status,data};
}
function retryDelaySeconds(data:any):number{
  const d=(data?.error?.details||[]).find((x:any)=>typeof x?.retryDelay==='string');
  const m=d&&/^(\d+(?:\.\d+)?)s$/.exec(d.retryDelay);return m?Math.ceil(Number(m[1])):0;
}
const uniqPush=(arr:AiSource[],url?:string,title?:string)=>{if(url&&!arr.some(s=>s.url===url))arr.push({title:title||url,url});};

async function askGemini(p:ProviderConfig,turns:ChatMessage[]):Promise<{answer:string;sources:AiSource[]}>{
  const url=`${p.baseUrl||'https://generativelanguage.googleapis.com/v1beta'}/models/${encodeURIComponent(p.model)}:generateContent`;
  const contents=turns.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
  const run=(tools:boolean)=>post(url,{'x-goog-api-key':resolveKey(p)},{systemInstruction:{parts:[{text:aiConfig.systemPrompt}]},contents,...(tools?{tools:[{google_search:{}}]}:{})});
  let r=await run(!!p.webSearch);
  if(r.status>=400&&p.webSearch&&(r.status===400||r.status===403)&&!/API key|permission/i.test(short(r.data?.error?.message)))r=await run(false);
  if(r.status>=400)throw classify(r.status,short(r.data?.error??r.data),retryDelaySeconds(r.data));
  const cand=r.data?.candidates?.[0];
  const answer=(cand?.content?.parts??[]).map((x:any)=>typeof x?.text==='string'?x.text:'').join('').trim();
  const sources:AiSource[]=[];for(const c of cand?.groundingMetadata?.groundingChunks??[])uniqPush(sources,c?.web?.uri,c?.web?.title);
  return {answer,sources};
}
async function askOpenAI(p:ProviderConfig,turns:ChatMessage[]):Promise<{answer:string;sources:AiSource[]}>{
  const url=`${p.baseUrl||'https://api.openai.com/v1'}/responses`;
  const run=(tools:boolean)=>post(url,{Authorization:`Bearer ${resolveKey(p)}`},{model:p.model,instructions:aiConfig.systemPrompt,input:turns,store:false,...(tools?{tools:[{type:'web_search'}]}:{})});
  let r=await run(!!p.webSearch);
  if(r.status===400&&p.webSearch)r=await run(false);
  if(r.status>=400)throw classify(r.status,short(r.data?.error??r.data));
  let answer=typeof r.data?.output_text==='string'?r.data.output_text:'';
  const sources:AiSource[]=[];
  for(const it of r.data?.output||[])for(const c of it.content||[]){
    if(!answer&&typeof c?.text==='string')answer+=c.text;
    for(const a of c.annotations||[])if(a.type==='url_citation')uniqPush(sources,a.url,a.title);
  }
  return {answer:answer.trim(),sources};
}
async function askAnthropic(p:ProviderConfig,turns:ChatMessage[]):Promise<{answer:string;sources:AiSource[]}>{
  const url=`${p.baseUrl||'https://api.anthropic.com/v1'}/messages`;
  const headers={'x-api-key':resolveKey(p),'anthropic-version':'2023-06-01'};
  const run=(tools:boolean)=>post(url,headers,{model:p.model,max_tokens:2000,system:aiConfig.systemPrompt,messages:turns,...(tools?{tools:[{type:'web_search_20250305',name:'web_search',max_uses:3}]}:{})});
  let r=await run(!!p.webSearch);
  if(r.status>=400&&p.webSearch&&(r.status===400||r.status===403)&&!/api.?key|authentic/i.test(short(r.data?.error?.message)))r=await run(false);
  if(r.status>=400)throw classify(r.status,short(r.data?.error??r.data));
  let answer='';const sources:AiSource[]=[];
  for(const b of r.data?.content||[]){
    if(b?.type==='text'&&typeof b.text==='string'){answer+=b.text;for(const c of b.citations||[])uniqPush(sources,c?.url,c?.title);}
    else if(b?.type==='web_search_tool_result'&&Array.isArray(b.content))for(const c of b.content)uniqPush(sources,c?.url,c?.title);
  }
  return {answer:answer.trim(),sources:sources.slice(0,8)};
}
async function askCompatible(p:ProviderConfig,turns:ChatMessage[]):Promise<{answer:string;sources:AiSource[]}>{
  const base=(p.baseUrl||'').replace(/\/+$/,'');
  const key=resolveKey(p);
  const r=await post(`${base}/chat/completions`,key?{Authorization:`Bearer ${key}`}:{},{model:p.model,messages:[{role:'system',content:aiConfig.systemPrompt},...turns],stream:false});
  if(r.status>=400)throw classify(r.status,short(r.data?.error??r.data));
  const answer=String(r.data?.choices?.[0]?.message?.content??'').trim();
  return {answer,sources:[]};
}
const impl:Record<ProviderConfig['type'],(p:ProviderConfig,t:ChatMessage[])=>Promise<{answer:string;sources:AiSource[]}>>={gemini:askGemini,openai:askOpenAI,anthropic:askAnthropic,'openai-compatible':askCompatible};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

export type Attempt={provider:string;model:string;kind:FailKind;message:string;status:number;detail:string};
export class AllFailed extends Error{constructor(public attempts:Attempt[]){super('Tất cả kết nối AI đều lỗi');}}
// Thử lần lượt các kết nối đang dùng được; trả về câu trả lời đầu tiên thành công.
export async function askAi(history:ChatMessage[],onFail?:(a:Attempt)=>void):Promise<AiAnswer>{
  const turns=normalizeTurns(history.slice(-aiConfig.historyLimit));
  const attempts:Attempt[]=[];
  for(const p of activeProviders()){
    for(let round=0;round<2;round++){
      try{
        const r=await impl[p.type](p,turns);
        if(!r.answer)throw new AiError('other','chưa trả về nội dung',200);
        return {answer:r.answer,sources:r.sources.slice(0,8),provider:p.name};
      }catch(e){
        const err=e instanceof AiError?e:new AiError('network',e instanceof Error?e.message:'lỗi không xác định');
        if(round===0&&err.kind==='quota'&&err.retryAfter>0&&err.retryAfter<=aiConfig.retryRateLimitUpToSeconds){await sleep(err.retryAfter*1000);continue;}
        const a:Attempt={provider:p.name,model:p.model,kind:err.kind,message:err.message,status:err.status,detail:err.detail};
        attempts.push(a);onFail?.(a);break;
      }
    }
  }
  throw new AllFailed(attempts);
}
