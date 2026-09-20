// مدللني v11 — بوابة المصادقة الصارمة أمام محرك Supabase OTP.
'use strict'
const core = require('./auth')
const { ENV, dal, readBody, signToken, verifyToken, sha256 } = require('./_lib')
const { requireActiveSession, failure } = require('./_session-v11')

const OTP_ACTIONS = new Set(['register', 'login', 'verifyOtp', 'resendOtp', 'bindEmail', 'forgotPassword', 'resetPassword'])

function headersFor(req) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', Vary: 'Origin' }
  const origin = String(req.headers.origin || '')
  const allowed = String(process.env.APP_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean)
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}
function send(req, res, status, body, inherited) {
  const headers = Object.assign({}, inherited || {}, headersFor(req))
  delete headers['Access-Control-Allow-Origin']; delete headers['access-control-allow-origin']
  const secure = headersFor(req); if (secure['Access-Control-Allow-Origin']) headers['Access-Control-Allow-Origin'] = secure['Access-Control-Allow-Origin']
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value)
  res.statusCode = status; res.end(status === 204 ? undefined : JSON.stringify(body || {}))
}
function captureResponse() { return { statusCode: 200, headers: {}, body: '', setHeader(key,value){this.headers[key]=value}, getHeader(key){return this.headers[key]}, end(value){this.body=value==null?'':String(value);this.ended=true} } }
function parseCaptured(response) { try { return response.body ? JSON.parse(response.body) : {} } catch (_) { return { ok:false,error:'invalid_server_response' } } }
function phone(value) { let out=String(value||'').replace(/[^0-9+]/g,''); if(out.startsWith('+964'))out='0'+out.slice(4);else if(out.startsWith('964'))out='0'+out.slice(3);return out }
function network(req) { return String(req.headers['x-forwarded-for']||req.headers['x-real-ip']||'unknown').split(',')[0].trim().slice(0,80) }
async function limitRow(key){return await dal.find('mdllni_rate_limits',{key})}
function blockedUntil(row){if(!row||Date.now()-Number(row.first||0)>3600000)return 0;return Number(Array.isArray(row.items)&&row.items[0]||0)}
async function bumpFailure(key){const now=Date.now();const row=await dal.rpc('mdllni_rate_bump',{p_key:key,p_now_ms:now,p_window_ms:3600000});const count=Number(row&&row.count||0);const wait=count>=12?3600000:count>=8?900000:count>=5?60000:0;await dal.update('mdllni_rate_limits',{key},{count,first:Number(row&&row.first||now),items:[wait?now+wait:0],updated_at:new Date().toISOString()});return{count,until:wait?now+wait:0}}
async function requireBoundSession(req,pending){const session=await requireActiveSession(req,{allowLimited:true});if(pending&&(pending.sub!==session.profile.id||pending.fp!==session.payload.dv))throw failure(401,'unauthorized');return session}

module.exports = async function authV11(req,res){
  const baseHeaders=headersFor(req)
  try{
    if(req.method==='OPTIONS'){if(req.headers.origin&&!baseHeaders['Access-Control-Allow-Origin'])return send(req,res,403,{ok:false,error:'origin_not_allowed'});return send(req,res,204,null)}
    if(req.method!=='POST')return send(req,res,405,{ok:false,error:'method_not_allowed'})
    if(Number(req.headers['content-length']||0)>262144)return send(req,res,413,{ok:false,error:'body_too_large'})
    const body=await readBody(req);req.body=body;const action=String(body.action||'')
    if(OTP_ACTIONS.has(action)&&!ENV.PUBLISHABLE_KEY)return send(req,res,503,{ok:false,error:'otp_not_configured'})
    const pending=body.pending?verifyToken(String(body.pending)):null
    if(['bindEmail','me','revokeMyDevice'].includes(action))await requireBoundSession(req)
    if(pending&&pending.scope==='otp'&&pending.p==='bind'&&['verifyOtp','resendOtp'].includes(action))await requireBoundSession(req,pending)
    let attemptKey=''
    if(pending&&pending.scope==='otp'&&pending.jti&&['verifyOtp','resetPassword'].includes(action)){attemptKey='otp:v11:'+pending.jti;const attempt=await dal.rpc('mdllni_rate_bump',{p_key:attemptKey,p_now_ms:Date.now(),p_window_ms:600000});if(Number(attempt&&attempt.count||0)>5)return send(req,res,429,{ok:false,error:'otp_attempts_exhausted'})}
    let profile=null;const netKey='login:v11:network:'+sha256(network(req)).slice(0,24);let accountKey=''
    if(action==='login'){profile=await dal.find('mdllni_profiles',{phone:phone(body.phone)});if(profile)accountKey='login:v11:account:'+profile.id;for(const key of[accountKey,netKey].filter(Boolean)){const until=blockedUntil(await limitRow(key));if(until>Date.now())return send(req,res,429,{ok:false,error:'login_cooldown',retryAfter:Math.ceil((until-Date.now())/1000)})}}
    const captured=captureResponse();await core(req,captured);const output=parseCaptured(captured)
    if(action==='login'&&captured.statusCode===401&&output.error==='invalid_credentials'){const failures=[];for(const key of[accountKey,netKey].filter(Boolean))failures.push(await bumpFailure(key));const until=failures.reduce((max,item)=>Math.max(max,item.until||0),0);if(until>Date.now()){captured.statusCode=429;output.error='login_cooldown';output.retryAfter=Math.ceil((until-Date.now())/1000)}}else if(action==='login'&&captured.statusCode<300&&accountKey){try{await dal.del('mdllni_rate_limits',{key:accountKey})}catch(_){}}
    if(captured.statusCode<300&&attemptKey){try{await dal.del('mdllni_rate_limits',{key:attemptKey})}catch(_){}}
    if(captured.statusCode<300&&output.token){const tokenPayload=verifyToken(output.token);if(!tokenPayload)throw failure(500,'invalid_server_token');delete tokenPayload.iat;delete tokenPayload.exp;output.token=signToken(tokenPayload,output.role==='admin'?7:30)}
    return send(req,res,captured.statusCode||200,output,captured.headers)
  }catch(error){return send(req,res,error.status||500,{ok:false,error:error.code||error.message||'server_error'})}
}
