// مدللني v11 — تشغيل سحابي فقط؛ لا حسابات أو بيانات وهمية.
(function () {
  'use strict'
  var LEGACY_KEYS = ['ur5_db', 'ur6_token', '__ur_did__']
  for (var i = 0; i < LEGACY_KEYS.length; i++) { try { localStorage.removeItem(LEGACY_KEYS[i]) } catch (_) {} }
  function gate(show, message) { var node=document.getElementById('mdllniSecureGate');if(!node)return;node.style.display=show?'flex':'none';var text=node.querySelector('[data-secure-message]');if(text&&message)text.textContent=message }
  function failClosed() { window.MODE='offline';try{if(window.DB){DB.session=null;DB.users=[];DB.orders=[];DB.messages=[];DB.notes=[];DB.tickets=[];DB.payouts=[];DB.audit=[]}if(typeof window.render==='function')window.render()}catch(_){}gate(true,'تعذر الاتصال الآمن بمنصة مدللني. لم نعرض أي بيانات محلية أو وهمية. أعد المحاولة.') }
  async function secureBoot() { gate(true,'جاري التحقق من الاتصال الآمن…');try{var healthResponse=await fetch('/api/health?ts='+Date.now(),{cache:'no-store',credentials:'same-origin'});var health=await healthResponse.json();if(!healthResponse.ok||!health.ok||health.mode!=='cloud'||health.version!=='v11'||health.authProvider!=='supabase-email-otp')throw new Error('health_mismatch');if(typeof window.refresh!=='function')throw new Error('cloud_runtime_missing');await window.refresh();window.MODE='cloud';document.documentElement.setAttribute('data-mdllni-secure','ready');gate(false)}catch(_){failClosed()} }
  window.resetDB=function(){try{localStorage.removeItem('mdllni_cache_v11')}catch(_){}location.reload()}
  window.changePass=function(){if(typeof window.openForgotPasswordModal==='function')return window.openForgotPasswordModal();if(typeof window.toast==='function')window.toast('تغيير كلمة المرور يتم برمز البريد من استعادة الحساب')}
  window.adminChangePass=window.changePass
  window.addEventListener('load',secureBoot,{once:true})
})()
