/* ================= مدللني — رقعة الهوية v8.8 (تُحمَّل بعد cloud.js) =================
   ربط البريد إجباري للحسابات القديمة (مودال bindEmail) + حقل البريد بفورم التسجيل
   وتلميح الدخول بحقن متزامن ثلاثي التغطية (فوري + بعد كل render + عند تغيير الهاش).
   مكتفية ذاتياً: تعتمد فقط على الدوال العامة (window) لـ app.js/cloud.js. */
(function(){
'use strict';

/* ---- أدوات محلية مكتفية (بدائل ما هو داخل كلوجر cloud.js) ---- */
var ERR88={
  bad_email:'📧 أدخل بريداً إلكترونياً صحيحاً',
  email_taken:'⚠️ هذا البريد مسجّل بحساب آخر',
  bad_otp:'📧 رمز التحقق غير صحيح — تأكد وحاول ثانية',
  otp_locked:'🚫 محاولات كثيرة برمز غلط — اطلب رمزاً جديداً',
  otp_expired:'⏰ انتهت صلاحية الرمز — اطلب رمزاً جديداً',
  otp_wait:'⏰ انتظر دقيقة قبل طلب رمز جديد',
  otp_limit:'⏰ وصلت الحد اليومي لرموز التحقق — حاول غداً',
  mail_not_configured:'⚠️ خدمة البريد متوقفة مؤقتاً — راسل الإدارة',
  mail_failed:'⚠️ ما انرسل البريد — جرّب ثانية أو راسل الإدارة',
  device_in_use:'🚫 هذا الجهاز مرتبط بحساب آخر — جهاز واحد = حساب واحد',
  device_revoked:'📵 هذا الجهاز انسحب اعتماده — سجّل دخولك من جهاز معتمد',
  bad_pending:'⏰ الجلسة انتهت — عيد المحاولة من البداية',
  turnstile_failed:'🤖 تحقق «أنا مو روبوت» ما تم — حاول ثانية',
  network:'⚠️ ما وصلنا للسيرفر — تأكد من الإنترنت'
};
function errMsg88(c){ return ERR88[c] || ('⚠️ صار خطأ' + (c?(' ('+c+')'):'')); }
function deviceFp88(){
  try{
    var fp = localStorage.getItem('__ur_did__');
    if(!fp){
      var raw = (navigator.userAgent || '') + '_' + screen.width + 'x' + screen.height;
      fp = 'dev_' + hash(raw) + '_' + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('__ur_did__', fp);
    }
    return fp;
  }catch(e){ return 'dev_fallback_' + Math.random().toString(36).slice(2, 10); }
}
function tsToken88(){ try{ if(window.turnstile && window._turnstileSiteKey){ return window.turnstile.getResponse() || ''; } }catch(e){} return ''; }

/* ---- 1) حقول الفورم: بريد التسجيل + تلميح الدخول — حقن متزامن (بلا مؤقتات) ---- */
function injectAuthFields(){
  try{
    var rp=$('rgPhone');
    if(rp && !$('rgEmail') && rp.closest('.field')) rp.closest('.field').insertAdjacentHTML('afterend','<div class="field"><label>📧 البريد الإلكتروني (يوصلك عليه رمز التحقق — حماية ثانية لحسابك)</label><input id="rgEmail" type="email" dir="ltr" placeholder="name@gmail.com" autocomplete="email"></div>');
    var lp=$('lgPass');
    if(lp && !$('lgLoginHint') && lp.closest('.field')) lp.closest('.field').insertAdjacentHTML('beforebegin','<div id="lgLoginHint" class="hint" style="font-size:12.5px;color:var(--faint);margin:-6px 0 14px;line-height:1.8">🔐 الدخول برقمك وكلمة المرور — وبعدها يوصلك رمز تأكيد على بريدك</div>');
  }catch(e){}
}

/* ---- 2) ربط البريد للحسابات القديمة (يظهر بكل دخول حتى يتم — إجباري عملياً) ---- */
window.bindEmailAsk = function(){
  openModal('📧 اربط بريدك الإلكتروني',
    '<p style="font-size:14px;color:var(--muted);line-height:1.9">حسابك من النظام القديم وبلا بريد. من هسّه الدخول برمز يوصل لبريدك — اكتب بريدك ونرسل الرمز فوراً. البريد ينربط برقمك وما يتسجّل بحساب ثاني.</p>'
    +'<div class="field"><input id="bindEmailInput" type="email" dir="ltr" placeholder="name@gmail.com" autocomplete="email"></div>',
    '📧 أرسل الرمز', function(){ window.bindEmailSend(); });
  setTimeout(function(){ var i=$('bindEmailInput'); if(i) i.focus(); }, 180);
};
window.bindEmailSend = function(){
  var email = ($('bindEmailInput') ? $('bindEmailInput').value : '').trim();
  if(email.indexOf('@')<1 || email.lastIndexOf('.')<email.indexOf('@')+2 || email.indexOf(' ')>=0){ toast(ERR88.bad_email); return; }
  apiCall('auth', { action:'bindEmail', email:email }).then(function(j){
    if(j && j.needsOtp){ window.openOtpStep(j.pending, j.email || email, 'bind'); }
  }).catch(function(e){ toast(errMsg88(e&&e.code)); });
};

/* ---- 3) خطوة الرمز بنسختها النهائية (تعرف غرض الربط ونتيجته) — تتفوق على نسخة cloud.js ---- */
window.openOtpStep = function(pending, email, purpose){
  window._otpState = { pending:pending, email:email, purpose:purpose||'login', resendAt: Date.now()+60000 };
  var purposeTxt = purpose==='register'?'تفعيل حسابك':purpose==='device'?'تأكيد جهازك الجديد':purpose==='bind'?'ربط بريدك':'دخولك';
  openModal('📧 رمز التحقق من بريدك',
    '<div style="text-align:center;margin-bottom:10px"><span style="font-size:38px">📧</span></div>'
    +'<p style="font-size:14px;color:var(--muted);text-align:center;line-height:1.9">أرسلنا رمزاً من 6 أرقام إلى<br><b style="direction:ltr;display:inline-block">'+esc(email)+'</b><br>اكتبه هنا حتى نكمل '+purposeTxt+' — صالح 10 دقائق ويُستخدم مرة وحدة.</p>'
    +'<div class="field"><input id="otpCode" inputmode="numeric" maxlength="6" placeholder="••••••" style="text-align:center;font-size:26px;font-weight:900;letter-spacing:12px;direction:ltr"></div>'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px"><button class="btn btn-ghost btn-sm" onclick="resendOtpCode()">↺ إعادة الإرسال</button><span style="font-size:12px;color:var(--faint)">ما وصلك؟ راجع السبام</span></div>',
    '✓ تأكيد', function(){ window.verifyOtpCode(); });
  setTimeout(function(){ var i=$('otpCode'); if(i) i.focus(); }, 180);
};
window.verifyOtpCode = function(){
  var st = window._otpState || {};
  var code = ($('otpCode') ? $('otpCode').value : '').trim();
  if(!/^\d{6}$/.test(code)){ toast('📧 اكتب الرمز الستّي'); return; }
  apiCall('auth', { action:'verifyOtp', pending:st.pending, code:code }).then(function(j){
    if(j && j.needsDeviceApproval){ closeModal(); toast('🛡️ '+(j.message||'جهازك ينتظر موافقة الإدارة')); return; }
    if(j && j.bound){ closeModal(); toast('✅ انربط بريدك — من هسّه دخولك برمز يوصل لبريدك'); renderHeader(currentRoute().name); return; }
    if(j && j.token){
      setToken(j.token); closeModal();
      return refresh().then(function(){
        var u=me(); toast('🎉 تم التحقق — أهلاً '+(u&&u.name?u.name.split(' ')[0]:''));
        var next=window._authNext; window._authNext=null;
        var target=(next && (next.indexOf('#/book')===0 || next.indexOf('#/order/')===0)) ? next : (j.role==='admin'?'#/admin':'#/home');
        go(target);
      });
    }
  }).catch(function(e){
    var c=e&&e.code;
    toast(errMsg88(c));
    var i=$('otpCode'); if(i && (c==='bad_otp'||c==='otp_expired')){ i.value=''; i.focus(); }
  });
};
window.resendOtpCode = function(){
  var st = window._otpState || {};
  if(Date.now() < (st.resendAt||0)){ toast(ERR88.otp_wait); return; }
  apiCall('auth', { action:'resendOtp', pending:st.pending }).then(function(j){
    if(j && j.pending) st.pending = j.pending;
    st.resendAt = Date.now()+60000;
    window._otpState = st;
    toast('📧 انرسل رمز جديد لبريدك');
  }).catch(function(e){ toast(errMsg88(e&&e.code)); });
};

/* ---- 4) doLogin النهائي: OTP + موافقة الجهاز + ربط البريد الإجباري ---- */
window.doLogin = function(){
  var rawPhone = $('lgPhone') ? $('lgPhone').value : '';
  var phone = normalizePhone(rawPhone);
  var pass = $('lgPass') ? $('lgPass').value : '';
  if(!validPhone(phone)){ toast('📱 يرجى إدخال رقم هاتف صحيح يبدأ بـ 07'); return; }
  if(!pass){ toast('🔑 يرجى كتابة كلمة المرور'); return; }
  window._lastPhone = phone;
  apiCall('auth', { action:'login', phone:phone, pass:pass, deviceId: deviceFp88(), turnstileToken: tsToken88() }).then(function(j){
    if(j && j.needsOtp){ window.openOtpStep(j.pending, j.email || '', j.newDevice ? 'device' : 'login'); return; }
    if(j && j.needsDeviceApproval){ toast('🛡️ ' + (j.message || 'جهازك سجّل وينتظر موافقة الإدارة')); return; }
    setToken(j.token);
    return refresh().then(function(){
      var u = me();
      toast('👋 أهلاً بعودتك يا ' + ((u && u.name) ? u.name.split(' ')[0] : ''));
      var next = window._authNext;
      window._authNext = null;
      var target = (next && (next.indexOf('#/book') === 0 || next.indexOf('#/order/') === 0)) ? next : (j.role === 'admin' ? '#/admin' : '#/home');
      go(target);
      if(j && j.needsEmail){ setTimeout(function(){ window.bindEmailAsk(); }, 900); }
    });
  }).catch(function(e){
    var c = e && e.code;
    if(c === 'device_blocked'){ toast('🚫 هذا الجهاز محظور من الاستخدام لتجاوز الحد الأقصى'); }
    else if(c === 'device_revoked'){ setToken(null); toast('📵 هذا الجهاز انسحب اعتماده من الإدارة'); }
    else if(c === 'not_registered'){ toast('⚠️ هذا الرقم غير مسجّل — يمكنك إنشاء حساب جديد'); }
    else if(c === 'bad_credentials'){ toast('⚠️ كلمة المرور غير صحيحة'); }
    else if(c === 'suspended'){ toast('🚫 حسابك موقوف — راجع الإدارة عبر الدعم'); }
    else { toast(errMsg88(c)); }
  });
};

/* ---- 5) التثبيت: فوري + بعد كل render + عند كل تنقل ---- */
var _r88 = window.render;
window.render = function(){ if(_r88) _r88.apply(this, arguments); injectAuthFields(); };
window.addEventListener('hashchange', function(){ setTimeout(injectAuthFields, 0); });
injectAuthFields();

})();
