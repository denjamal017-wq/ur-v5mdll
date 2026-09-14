/* ================= مدللني — رقعة الهوية v8.8/v9 (تُحمَّل بعد cloud.js) =================
   ربط البريد إجباري للحسابات القديمة (مودال bindEmail) + حقل البريد بفورم التسجيل
   وتلميح الدخول بحقن متزامن رباعي التغطية (فوري + render + hashchange + مراقب DOM).
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
  mail_not_configured:'⚠️ خدمة الرموز غير مفعّلة — الإدارة تفعّل Email provider من Supabase',
  mail_failed:'⚠️ ما انرسل الرمز — تأكد من البريد وحاول ثانية',
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

/* ---- 0) نظام النوافذ المنبثقة الموحد (openModal) لجميع نوافذ النظام ---- */
window.openModal = function(title, bodyHtml, btnText, btnCallback){
  var bg = document.getElementById('modalBg');
  var box = document.getElementById('modalBox');
  if(!bg || !box) return;
  window._modalCallback = btnCallback || null;
  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
    + '<h3 style="margin:0;font-size:18.5px;font-weight:900">' + esc(title) + '</h3>'
    + '<button type="button" onclick="closeModal()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--muted);padding:0 6px;line-height:1">✕</button>'
    + '</div>'
    + '<div>' + bodyHtml + '</div>'
    + (btnText ? '<div class="actions" style="display:flex;gap:10px;margin-top:22px;justify-content:flex-end">'
      + '<button type="button" class="btn btn-ghost" onclick="closeModal()">إلغاء</button>'
      + '<button type="button" class="btn btn-primary" onclick="if(window._modalCallback)window._modalCallback()">' + esc(btnText) + '</button>'
      + '</div>' : '');
  box.innerHTML = html;
  bg.classList.add('show');
};
window.closeModal = function(){
  var bg = document.getElementById('modalBg');
  if(bg) bg.classList.remove('show');
};

/* ---- 1) حقول الفورم: بريد التسجيل + تلميح الدخول + نسيت كلمة المرور ---- */
function injectAuthFields(){
  try{
    var rp=$('rgPhone');
    if(rp && !$('rgEmail') && rp.closest('.field')) rp.closest('.field').insertAdjacentHTML('afterend','<div class="field"><label>📧 البريد الإلكتروني (يوصلك عليه رمز التحقق — حماية ثانية لحسابك)</label><input id="rgEmail" type="email" dir="ltr" placeholder="name@gmail.com" autocomplete="email"></div>');
    var lp=$('lgPass');
    if(lp && !$('lgLoginHint') && lp.closest('.field')) lp.closest('.field').insertAdjacentHTML('beforebegin','<div id="lgLoginHint" class="hint" style="font-size:12.5px;color:var(--faint);margin:-6px 0 14px;line-height:1.8">🔐 الدخول برقمك وكلمة المرور — وبعدها يوصلك رمز تأكيد على بريدك</div>');
    if(lp && !$('lgForgotLink') && lp.closest('.field')) lp.closest('.field').insertAdjacentHTML('afterend','<div id="lgForgotLink" style="text-align:left;margin:-4px 0 14px"><button type="button" onclick="window.openForgotPasswordModal()" style="background:none;border:none;padding:0;color:var(--accent,#BE3A2B);font-size:13px;font-weight:700;cursor:pointer;text-decoration:underline;font-family:inherit">🔑 نسيت كلمة المرور؟</button></div>');
  }catch(e){}
}

/* ---- 1.5) نسيت كلمة المرور وإعادة التعيين بالرمز ---- */
window.openForgotPasswordModal = function(){
  var curPhone = $('lgPhone') ? normalizePhone($('lgPhone').value) : '';
  openModal('🔑 استعادة كلمة المرور',
    '<p style="font-size:14px;color:var(--muted);line-height:1.9">أدخل رقم هاتفك المسجل وسنرسل رمز تأكيد مكون من 6 أرقام إلى بريدك الإلكتروني لتعيين كلمة مرور جديدة.</p>'
    +'<div class="field"><label>📱 رقم الهاتف</label><input id="fpPhone" type="tel" dir="ltr" placeholder="07xxxxxxxx" value="'+esc(curPhone)+'"></div>',
    '📧 إرسال رمز التحقق', function(){ window.sendForgotPassword(); });
  setTimeout(function(){ var i=$('fpPhone'); if(i) i.focus(); }, 180);
};

window.sendForgotPassword = function(){
  var rawPhone = $('fpPhone') ? $('fpPhone').value : '';
  var phone = normalizePhone(rawPhone);
  if(!validPhone(phone)){ toast('📱 يرجى إدخال رقم هاتف صحيح يبدأ بـ 07'); return; }
  apiCall('auth', { action:'forgotPassword', phone:phone, deviceId: deviceFp88(), turnstileToken: tsToken88() }).then(function(j){
    if(j && j.needsOtp){
      window.openResetPasswordStep(j.pending, j.email || '', phone);
    }
  }).catch(function(e){
    var c = e && e.code;
    if(c === 'not_registered'){ toast('⚠️ هذا الرقم غير مسجّل لدينا'); }
    else if(c === 'no_email'){ toast('⚠️ هذا الحساب غير مربوط ببريد — تواصل مع الإدارة للمساعدة'); }
    else if(c === 'otp_wait'){ toast(ERR88.otp_wait); }
    else { toast(errMsg88(c)); }
  });
};

window.openResetPasswordStep = function(pending, maskedEmail, phone){
  window._resetState = { pending:pending, email:maskedEmail, phone:phone };
  openModal('🔑 تعيين كلمة المرور الجديدة',
    '<div style="text-align:center;margin-bottom:8px"><span style="font-size:36px">🔐</span></div>'
    +'<p style="font-size:14px;color:var(--muted);text-align:center;line-height:1.9">أرسلنا رمزاً من 6 أرقام إلى بريدك:<br><b style="direction:ltr;display:inline-block">'+esc(maskedEmail)+'</b></p>'
    +'<div class="field"><label>📧 رمز التحقق الستّي</label><input id="rpOtpCode" inputmode="numeric" maxlength="6" placeholder="••••••" style="text-align:center;font-size:24px;font-weight:900;letter-spacing:10px;direction:ltr"></div>'
    +'<div class="field"><label>🔒 كلمة المرور الجديدة</label><input id="rpNewPass" type="password" placeholder="6 أحرف أو أرقام فأكثر"></div>'
    +'<div class="field"><label>🔒 تأكيد كلمة المرور الجديدة</label><input id="rpNewPass2" type="password" placeholder="أعد كتابة كلمة المرور"></div>',
    '✓ حفظ وتغيير كلمة المرور', function(){ window.submitResetPassword(); });
  setTimeout(function(){ var i=$('rpOtpCode'); if(i) i.focus(); }, 180);
};

window.submitResetPassword = function(){
  var st = window._resetState || {};
  var code = ($('rpOtpCode') ? $('rpOtpCode').value : '').trim();
  var p1 = $('rpNewPass') ? $('rpNewPass').value : '';
  var p2 = $('rpNewPass2') ? $('rpNewPass2').value : '';
  if(!/^\d{6}$/.test(code)){ toast('📧 أدخل رمز التحقق المكون من 6 أرقام'); return; }
  if(p1.length < 6){ toast('🔑 كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
  if(p1 !== p2){ toast('⚠️ كلمتا المرور غير متطابقتين'); return; }

  apiCall('auth', { action:'resetPassword', pending:st.pending, code:code, newPass:p1, deviceId: deviceFp88() }).then(function(j){
    closeModal();
    if(j && j.token){
      setToken(j.token);
      return refresh().then(function(){
        toast('🎉 تم تعيين كلمة المرور الجديدة وتسجيل دخولك بنجاح!');
        go(j.role === 'admin' ? '#/admin' : '#/home');
      });
    } else {
      toast('✅ تم تعيين كلمة المرور بنجاح — يمكنك الآن تسجيل الدخول بها');
    }
  }).catch(function(e){
    var c = e && e.code;
    if(c === 'bad_otp' || c === 'otp_expired'){ toast('❌ رمز التحقق غير صحيح أو انتهت صلاحيته'); }
    else { toast(errMsg88(c)); }
  });
};

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
    +'<p style="font-size:14px;color:var(--muted);text-align:center;line-height:1.9">أرسلنا رمزاً من 6 أرقام إلى<br><b style="direction:ltr;display:inline-block">'+esc(email)+'</b><br>اكتبه هنا حتى نكمل '+purposeTxt+' — صالح لساعة ويُستخدم مرة وحدة.</p>'
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

/* ---- 5) التثبيت: فوري + بعد كل render + عند كل تنقل + مراقب DOM (يقتل التذبذب نهائياً) ---- */
var _r88 = window.render;
window.render = function(){ if(_r88) _r88.apply(this, arguments); injectAuthFields(); };
window.addEventListener('hashchange', function(){ setTimeout(injectAuthFields, 0); });
/* مراقب DOM: أي رسم يزرع حقول الفورم بأي مسار (تبويب/تنقل/إعادة رسم داخلية) → الحقن يلحقه فوراً.
   الحقن idempotent (يتحقق قبل الزرع) فلا حلقات ولا تكرار. */
var _injT88 = null;
function scheduleInject88(){ if(_injT88) return; _injT88 = setTimeout(function(){ _injT88 = null; injectAuthFields(); }, 40); }
try{
  new MutationObserver(function(muts){
    for (var i = 0; i < muts.length; i++){ if (muts[i].addedNodes && muts[i].addedNodes.length){ scheduleInject88(); return; } }
  }).observe(document.body, { childList: true, subtree: true });
}catch(e){}
injectAuthFields();

})();
