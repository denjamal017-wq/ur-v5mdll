/* ================= UR v6 — طبقة السحابة (Vercel + Supabase) =================
   كل إجراء يروح للسيرفر ويتخزن بقاعدة البيانات — ماكو شي وهمي أبداً. */
(function(){
'use strict';

var API_BASE='/api', TOKEN_KEY='ur6_token', ABORT={};
window.MODE='local'; window.TOKEN=null;

function setToken(t){
  window.TOKEN=t||null;
  try{ if(t) localStorage.setItem(TOKEN_KEY,t); else localStorage.removeItem(TOKEN_KEY); }catch(e){}
}
function loadToken(){ try{ window.TOKEN=localStorage.getItem(TOKEN_KEY)||null; }catch(e){ window.TOKEN=null; } }

function apiCall(endpoint, bodyObj){
  var headers={'Content-Type':'application/json'};
  if(window.TOKEN) headers['Authorization']='Bearer '+window.TOKEN;
  return fetch(API_BASE+'/'+endpoint, { method:'POST', headers:headers, body:JSON.stringify(bodyObj||{}) })
    .then(function(res){
      return res.json().catch(function(){ return null; }).then(function(j){
        if(!res.ok || !j || j.ok===false){
          var err=new Error('api_error');
          err.code=(j&&j.error)||('http_'+res.status);
          throw err;
        }
        return j;
      });
    }, function(){ var err=new Error('network'); err.code='network'; throw err; });
}

function refresh(){ return apiCall('data', {action:'snapshot'}).then(function(j){ DB=j.db; return DB; }); }

function cloudCall(action, payload){
  return apiCall('data', {action:action, payload:payload||{}}).then(function(r){
    if(r && r.db){ DB=r.db; return r; }
    return refresh().then(function(){ return r; });
  });
}
window.apiCall = apiCall;
window.setToken = setToken;
window.refresh = refresh;
window.cloudCall = cloudCall;

var ERR={
  network:'\u26a0\ufe0f ما وصلنا للسيرفر — تأكد من الإنترنت',
  server_error:'\u26a0\ufe0f صار خطأ بالسيرفر — جرّب بعد شوي',
  unknown_action:'\u26a0\ufe0f إجراء غير معروف',
  unauthorized:'\ud83d\udd10 لازم تسجّل دخولك أول',
  forbidden:'\ud83d\udeab ما عندك صلاحية لهذا الإجراء',
  suspended:'\ud83d\udeab حسابك موقوف — راجع الإدارة',
  not_registered:'\u26a0\ufe0f هذا الرقم غير مسجّل',
  bad_credentials:'\u26a0\ufe0f كلمة المرور غير صحيحة',
  phone_taken:'\u26a0\ufe0f هذا الرقم مسجّل — سجّل دخولك',
  not_provider:'\u26a0\ufe0f هذا الإجراء لمقدمي الخدمة فقط',
  not_verified:'\u23f3 ينتظر توثيق الإدارة',
  not_available:'\u23f8\ufe0f فعّل التوفر أولاً',
  order_not_found:'\u26a0\ufe0f الطلب غير موجود',
  order_unavailable:'\u26a0\ufe0f الطلب ما عاد متاحاً',
  order_not_done:'\u26a0\ufe0f لازم يكتمل الطلب أولاً',
  price_not_confirmed:'\u26a0\ufe0f الزبون لازم يوافق على السعر النهائي أولاً',
  cannot_advance:'\u26a0\ufe0f ما يمكن تقديم حالة الطلب الآن',
  bad_price:'\u26a0\ufe0f أدخل سعراً صحيحاً',
  below_min:'\u26a0\ufe0f الرصيد أقل من الحد الأدنى للتسوية',
  bad_stars:'\u26a0\ufe0f اختر تقييماً من 1 إلى 5',
  already_rated:'\u26a0\ufe0f قيّمت هذا الطلب من قبل',
  empty:'\u26a0\ufe0f الحقل فارغ',
  bad_subject:'\u26a0\ufe0f اكتب موضوع التذكرة',
  bad_body:'\u26a0\ufe0f اكتب تفاصيل كافية',
  ticket_not_found:'\u26a0\ufe0f التذكرة غير موجودة',
  service_not_found:'\u26a0\ufe0f الخدمة غير موجودة',
  service_in_use:'\u26a0\ufe0f لا يمكن حذف خدمة عليها طلبات — عطّلها بدلاً من ذلك',
  user_not_found:'\u26a0\ufe0f المستخدم غير موجود',
  payout_unavailable:'\u26a0\ufe0f طلب التسوية غير متاح',
  bad_name:'\u270d\ufe0f اكتب اسماً صحيحاً',
  bad_phone:'\ud83d\udcf1 رقم الهاتف لازم يكون 11 رقم ويبدأ بـ 07',
  bad_pass:'\ud83d\udd11 كلمة المرور 6 أحرف على الأقل',
  bad_area:'\ud83d\udccd اختر منطقة',
  bad_range:'\u26a0\ufe0f تحقق من نطاق السعر',
  service_required:'\ud83e\uddf0 اختر خدمتك الرئيسية'
};
function errMsg(code){ return ERR[code] || ('\u26a0\ufe0f صار خطأ' + (code?(' ('+code+')'):'')); }

function wrap(action, build, onOk){
  return function(){
    var args=Array.prototype.slice.call(arguments);
    var payload = build ? build.apply(null, args) : {};
    if(payload===ABORT) return;
    cloudCall(action, payload).then(function(r){
      if(onOk) onOk.apply(null, [r].concat(args));
    }).catch(function(e){ toast(errMsg(e&&e.code)); });
  };
}

function installCloud(){
  window.save=function(){};

  window.confirmPrice = wrap('confirmPrice', function(id){ return {orderId:id}; },
    function(r,id){ toast('\u2713 وافقت على السعر النهائي'); renderOrder(id); renderHeader(currentRoute().name); });

  window.acceptOrder = wrap('acceptOrder', function(id){ return {orderId:id}; },
    function(r,id){ toast('\u2705 قبلت الطلب — ثبّت السعر النهائي إذا تريد تعديله'); renderProvider('active'); renderHeader(currentRoute().name); });

  window.advanceOrder = wrap('advanceOrder', function(id){ return {orderId:id}; },
    function(r,id){ toast('\u2713 تم تحديث حالة الطلب'); renderOrder(id); renderHeader(currentRoute().name); });

  window.providerDrop = wrap('providerDrop', function(id){ return {orderId:id}; },
    function(r,id){ toast('تم الاعتذار — الطلب رجع للسوق'); go('#/provider'); });

  window.rejectOrder = wrap('rejectOrder', function(id){ return {orderId:id}; },
    function(r,id){ toast('تم التجاهل — ما يظهر عندك مرة ثانية'); renderProvider('incoming'); });

  window.setFinalPrice = wrap('setFinalPrice',
    function(id){ var v=parseInt($('fpVal').value,10); if(!v||v<1000){ toast('\u26a0\ufe0f أدخل سعراً صحيحاً'); return ABORT; } return {orderId:id, price:v}; },
    function(r,id){ closeModal(); toast('\u2713 ثبّت السعر — بانتظار موافقة الزبون'); renderOrder(id); });

  window.submitDispute = wrap('disputeOrder',
    function(id){ var t=$('dispText').value.trim(); if(t.length<5){ toast('اكتب وصف المشكلة'); return ABORT; } return {orderId:id, body:t}; },
    function(r,id){ closeModal(); toast('\u2696\ufe0f وصل نزاعك للإدارة — نراجعه بأسرع وقت'); renderOrder(id); });

  window.rateSubmit = wrap('rate',
    function(id){ var v=window._rateVal||0; if(!v){ toast('\u2b50 اختر عدد النجوم أولاً'); return ABORT; } return {orderId:id, stars:v, text:$('rateText').value.trim()}; },
    function(r,id){ toast('\u2b50 شكراً — تقييمك انسجّل'); renderOrder(id); renderHeader(currentRoute().name); });

  window.sendMsg = wrap('sendMessage',
    function(orderId){ var t=$('chatInput').value.trim(); if(!t) return ABORT; return {orderId:orderId, text:t}; },
    function(r,orderId){ renderOrder(orderId); renderHeader(currentRoute().name); });

  window.doCancelOrder = wrap('cancelOrder', function(id){ return {orderId:id}; },
    function(r,id){ closeModal(); toast('تم إلغاء الطلب'); renderOrder(id); renderHeader(currentRoute().name); });

  window.requestPayout = wrap('requestPayout', function(){ return {}; },
    function(r){ toast('\ud83d\udcb8 طلب التسوية وصل الإدارة — تعتمدها بأسرع وقت'); renderProvider('earnings'); });

  window.toggleAvail = wrap('toggleAvail', function(){ return {}; },
    function(r){ var u=me(); var av=!!(u&&u.provider&&u.provider.avail); toast(av?'\u2713 أنت متاح — الطلبات توصلك':'\u23f8\ufe0f أنت مشغول — ما توصلك طلبات'); renderProvider(currentRoute().param||'incoming'); });

  window.newTicket = wrap('openTicket',
    function(){ var subject=$('tkSubject').value.trim(); var body=$('tkBody').value.trim(); if(subject.length<3){ toast('اكتب الموضوع'); return ABORT; } if(body.length<5){ toast('اكتب التفاصيل'); return ABORT; } return {subject:subject, body:body}; },
    function(r){ toast('\u2713 وصلت تذكرتك للإدارة'); go('#/support/'+r.result.ticketId); });

  window.replyTicket = wrap('replyTicket',
    function(id){ var t=$('tkInput').value.trim(); if(!t) return ABORT; return {ticketId:id, body:t}; },
    function(r,id){ renderSupport(id); renderHeader(currentRoute().name); });

  window.markAllRead = wrap('markAllRead', function(){ return {}; }, function(r){ renderHeader(); });

  window.verifyProvider = wrap('verifyProvider',
    function(id, note){ return {userId:id, note:note||''}; },
    function(r,id){ var u=userById(id); toast('✓ تم قبول وتوثيق '+(u?u.name:'')); closeModal(); window._admVerifyTab='verified'; renderAdmin(currentRoute().param || 'verify'); renderHeader(); });

  window.rejectProvider = wrap('rejectProvider',
    function(id, reason){ return {userId:id, reason:reason||''}; },
    function(r,id){ var u=userById(id); toast('🚫 تم رفض توثيق '+(u?u.name:'')); closeModal(); window._admVerifyTab='rejected'; renderAdmin(currentRoute().param || 'verify'); renderHeader(); });

  window.unverifyProvider = wrap('unverifyProvider',
    function(id){ return {userId:id}; },
    function(r,id){ var u=userById(id); toast('⏳ تم سحب توثيق '+(u?u.name:'')); closeModal(); window._admVerifyTab='pending'; renderAdmin(currentRoute().param || 'verify'); renderHeader(); });

  window.reconsiderProvider = wrap('reconsiderProvider',
    function(id, note){ return {userId:id, note:note||''}; },
    function(r,id){ var u=userById(id); toast('🔄 تم إعادة '+(u?u.name:'')+' لقائمة المراجعة'); closeModal(); window._admVerifyTab='pending'; renderAdmin(currentRoute().param || 'verify'); renderHeader(); });

  window.reapplyVerification = function(){
    cloudCall('reapplyVerification', {}).then(function(){
      toast('✓ تم إرسال طلب إعادة التوثيق للإدارة بنجاح');
      renderProvider(currentRoute().param || 'incoming');
      renderHeader(currentRoute().name);
    }).catch(function(e){
      toast(errMsg(e && e.code));
    });
  };

  window.payPayout = wrap('payPayout', function(id){ return {payoutId:id}; },
    function(r,id){ toast('\u2713 تم اعتماد الدفع'); renderAdmin('finance'); });

  window.saveSettings = wrap('saveSettings',
    function(){ return { commission:{ first:parseInt($('stFirst').value,10), standard:parseInt($('stStd').value,10), loyal:parseInt($('stLoyal').value,10), elite:parseInt($('stElite').value,10), delivery:parseInt($('stDeliv').value,10) }, minPayout:parseInt($('stMinPay').value,10), loyalAt:parseInt($('stLoyalAt').value,10), eliteAt:parseInt($('stEliteAt').value,10) }; },
    function(r){ toast('\u2713 حُفظت الإعدادات — تطبق على الطلبات الجديدة'); renderAdmin('settings'); });

  window.saveAreas = wrap('saveAreas',
    function(){ var lines=$('stAreas').value.split('\n').map(function(x){return x.trim();}).filter(Boolean); if(lines.length<2){ toast('\u26a0\ufe0f أدخل منطقتين على الأقل'); return ABORT; } return {areas:lines}; },
    function(r){ toast('\u2713 حُفظت المناطق'); renderAdmin('settings'); });

  window.addService = wrap('addService',
    function(){ var name=$('csName').value.trim(); var min=parseInt($('csMin').value,10); var max=parseInt($('csMax').value,10); if(name.length<3){ toast('اكتب اسم الخدمة'); return ABORT; } if(!(min&&max&&max>=min)){ toast('\u26a0\ufe0f تحقق من نطاق السعر'); return ABORT; } return { icon:$('csIcon').value.trim()||'\ud83e\uddf0', name:name, cat:$('csCat').value, unit:$('csUnit').value.trim()||'خدمة', min:min, max:max, wave:parseInt($('csWave').value,10)||0, desc:$('csDesc').value.trim(), popular:$('csPop').checked, sensitive:$('csSens').checked }; },
    function(r){ toast('\u2713 انضافت الخدمة للكتالوج'); renderAdmin('catalog'); });

  window.toggleService = wrap('toggleService', function(id){ return {serviceId:id}; },
    function(r,id){ toast('\u2713 تم'); renderAdmin('catalog'); });

  window.delService = wrap('deleteService', function(id){ return {serviceId:id}; },
    function(r,id){ toast('\ud83d\uddd1\ufe0f حُذفت الخدمة'); renderAdmin('catalog'); });

  window.toggleUserStatus = wrap('toggleUserStatus', function(id){ return {userId:id}; },
    function(r,id){ toast('\u2713 تم'); renderAdmin('users'); });

  window.closeTicket = wrap('closeTicket', function(id){ return {ticketId:id}; },
    function(r,id){ toast('\u2713 أُغلقت'); renderAdmin('tickets'); });

  window.saveProfile = function(){
    var name = ($('pfName') ? $('pfName').value : '').trim();
    var rawPhone = $('pfPhone') ? $('pfPhone').value : '';
    var phone = normalizePhone(rawPhone);
    var area = ($('pfArea') ? $('pfArea').value : '').trim();
    if(name.length < 2){ toast('✍️ اكتب اسمك الكامل'); return; }
    if(!validPhone(phone)){ toast('📱 رقم الهاتف لازم يكون 11 رقم ويبدأ بـ 07'); return; }
    if(!area){ toast('📍 يرجى كتابة اسم منطقتك بالناصرية'); return; }
    
    cloudCall('updateProfile', { name: name, phone: phone, area: area }).then(function(){
      toast('✓ تم حفظ ملفك بنجاح');
      renderAccount('profile');
      renderHeader(currentRoute().name);
    }).catch(function(e){ toast(errMsg(e && e.code)); });
  };

  window.saveProviderProfile = function(){
    var name = ($('pvfName') ? $('pvfName').value : '').trim();
    var rawPhone = $('pvfPhone') ? $('pvfPhone').value : '';
    var phone = normalizePhone(rawPhone);
    var areas = Array.prototype.slice.call(document.querySelectorAll('.pvfArea:checked')).map(function(c){return c.value;});
    var exp = parseInt($('pvfExp') ? $('pvfExp').value : '0', 10) || 0;

    // Collect up to 3 selected services
    var services = Array.prototype.slice.call(document.querySelectorAll('.pvfServiceCheck:checked')).map(function(c){return c.value;});
    if(!services.length && $('pvfService')){
      services = [$('pvfService').value];
    }
    if(!services.length){ services = ['s1']; }
    if(services.length > 3){ toast('⚠️ يمكنك اختيار 3 خدمات كحد أقصى'); return; }

    if(name.length < 2){ toast('✍️ اكتب اسمك الكامل'); return; }
    if(!validPhone(phone)){ toast('📱 رقم الهاتف لازم يكون 11 رقم ويبدأ بـ 07'); return; }
    if(areas.length < 1){ toast('📍 اختر منطقة واحدة على الأقل'); return; }

    cloudCall('updateProviderProfile', {
      name: name, phone: phone, serviceId: services[0], serviceIds: services,
      exp: exp, areas: areas
    }).then(function(r){
      if(r && r.result && r.result.reverify){
        toast('🛡️ خدمة حساسة — حسابك رجع لقائمة التوثيق');
      } else {
        toast('✓ تم حفظ ملفك بنجاح (' + services.length + ' مهن)');
      }
      renderProvider('profile');
      renderHeader(currentRoute().name);
    }).catch(function(e){ toast(errMsg(e && e.code)); });
  };

  window.changePass = function(){
    var oldPass = ($('pwOld') ? $('pwOld').value : '').trim();
    var newPass = ($('pwNew') ? $('pwNew').value : '').trim();
    if(!oldPass){ toast('🔑 يرجى كتابة كلمة المرور الحالية'); return; }
    if(newPass.length < 6){ toast('🔑 كلمة المرور الجديدة 6 أحرف على الأقل'); return; }

    cloudCall('changePassword', { oldPass: oldPass, newPass: newPass }).then(function(){
      toast('✓ تم تغيير كلمة المرور بنجاح');
      if($('pwOld')) $('pwOld').value = '';
      if($('pwNew')) $('pwNew').value = '';
      renderAccount('profile');
    }).catch(function(err){
      var c = err && err.code;
      if(c === 'bad_credentials') toast('⚠️ كلمة المرور الحالية غير صحيحة');
      else if(c === 'bad_pass') toast('⚠️ كلمة المرور الجديدة 6 أحرف على الأقل');
      else toast(errMsg(c));
    });
  };

  window.adminChangePass = function(){
    var oldPass = ($('admOld') ? $('admOld').value : '').trim();
    var newPass = ($('admNew') ? $('admNew').value : '').trim();
    if(!oldPass){ toast('🔑 يرجى كتابة كلمة المرور الحالية'); return; }
    if(newPass.length < 6){ toast('🔑 كلمة المرور الجديدة 6 أحرف على الأقل'); return; }

    cloudCall('changePassword', { oldPass: oldPass, newPass: newPass }).then(function(){
      toast('✓ تم تغيير كلمة مرور الإدارة بنجاح');
      if($('admOld')) $('admOld').value = '';
      if($('admNew')) $('admNew').value = '';
      renderAdmin('settings');
    }).catch(function(err){
      var c = err && err.code;
      if(c === 'bad_credentials') toast('⚠️ كلمة المرور الحالية غير صحيحة');
      else toast(errMsg(c));
    });
  };

  window.openNotif = function(id){
    cloudCall('markRead', {noteId:id}).then(function(){
      var p=$('notifPanel'); if(p) p.classList.remove('open');
      var n=(DB.notes||[]).find(function(x){return x.id===id;});
      if(n && n.orderId) go('#/order/'+n.orderId);
      renderHeader(currentRoute().name);
    }).catch(function(e){ toast(errMsg(e&&e.code)); });
  };

  window.bookConfirm = function(est){
    var u=me(); if(!u){ requireAuth('#/book'); return; }
    cloudCall('createOrder', { serviceId:bookState.serviceId, area:bookState.area, estimate:est, desc:bookState.desc, address:bookState.address, when:bookState.when, whenTime:bookState.whenTime, payMethod:bookState.pay })
      .then(function(r){ var id=r&&r.result&&r.result.orderId; bookState={ step:1, serviceId:null, desc:'', area:'', address:'', when:'now', whenTime:'', pay:'cash' }; toast('🚀 طلبك انطلق — وصل للمقدمين الموثّقين بمنطقتك'); go('#/order/'+id); })
      .catch(function(e){ toast(errMsg(e&&e.code)); });
  };

  function getDeviceFingerprint(){
    try {
      var fp = localStorage.getItem('__ur_did__');
      if (!fp) {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.textBaseline = 'top';
          ctx.font = '14px Arial';
          ctx.fillText('UR_PLATFORM_DEVICE_FP', 2, 2);
        }
        var raw = (canvas ? canvas.toDataURL() : '') + '_' + (navigator.userAgent || '') + '_' + screen.width + 'x' + screen.height;
        fp = 'dev_' + hash(raw) + '_' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('__ur_did__', fp);
      }
      return fp;
    } catch(e) {
      return 'dev_fallback_' + Math.random().toString(36).slice(2, 10);
    }
  }

  window.doRegister = function(){
    var name = ($('rgName') ? $('rgName').value : '').trim();
    var rawPhone = $('rgPhone') ? $('rgPhone').value : '';
    var phone = normalizePhone(rawPhone);
    var pass = $('rgPass') ? $('rgPass').value : '';
    var pass2 = $('rgPass2') ? $('rgPass2').value : '';
    var area = $('rgArea') ? $('rgArea').value.trim() : '';
    var role = window._regRole || 'customer';
    
    if(name.length < 2){ toast('✍️ يرجى كتابة اسمك الكامل'); return; }
    if(!validPhone(phone)){ toast('📱 رقم الهاتف غير صحيح — يجب أن يبدأ بـ 07 ويتكون من 11 رقم'); return; }
    if(pass.length < 6){ toast('🔑 كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if(pass !== pass2){ toast('⚠️ كلمتا المرور غير متطابقتين'); return; }
    if(!area){ toast('📍 يرجى كتابة اسم منطقتك بالناصرية'); return; }
    
    var payload = {
      action: 'register',
      role: role,
      name: name,
      phone: phone,
      pass: pass,
      area: area,
      deviceId: getDeviceFingerprint()
    };
    
    if(role === 'provider'){
      // Support selecting up to 3 services
      var selServices = Array.prototype.slice.call(document.querySelectorAll('.rgServiceCheck:checked')).map(function(c){return c.value;});
      if(!selServices.length && $('rgService')){
        selServices = [$('rgService').value];
      }
      if(!selServices.length){ selServices = ['s1']; }
      if(selServices.length > 3){ toast('⚠️ يمكنك اختيار 3 خدمات كحد أقصى'); return; }

      var areas = Array.prototype.slice.call(document.querySelectorAll('.rgArea2:checked')).map(function(c){return c.value;});
      if(!areas.length){ areas = ['كل الناصرية', area]; }
      
      payload.serviceId = selServices[0];
      payload.serviceIds = selServices;
      payload.exp = parseInt($('rgExp') ? $('rgExp').value : '3', 10) || 0;
      payload.areas = areas;

      var hasCustom = $('rgHasCustomSvc') && $('rgHasCustomSvc').checked;
      if(hasCustom || selServices.includes('custom')){
        var cName = ($('rgCustomName') ? $('rgCustomName').value : '').trim();
        var cDesc = ($('rgCustomDesc') ? $('rgCustomDesc').value : '').trim();
        var cMin = parseInt($('rgCustomMin') ? $('rgCustomMin').value : '10000', 10) || 10000;
        var cMax = parseInt($('rgCustomMax') ? $('rgCustomMax').value : '50000', 10) || 50000;
        if(cName.length < 2){ toast('🧰 يرجى كتابة اسم مهنتك الخاصة'); return; }
        payload.customServiceName = cName;
        payload.customServiceDesc = cDesc || 'خدمة مخصصة';
        payload.customServiceMin = cMin;
        payload.customServiceMax = cMax;
      }
    }
    
    window._lastPhone = phone;
    
    // Direct Instant Registration (Zero OTP)
    apiCall('auth', payload).then(function(j){
      setToken(j.token);
      return refresh().then(function(){
        var u = me();
        toast('🎉 أهلاً بك في مدللني يا ' + ((u && u.name) ? u.name.split(' ')[0] : name.split(' ')[0]));
        var next = window._authNext;
        window._authNext = null;
        var target = (next && (next.indexOf('#/book') === 0 || next.indexOf('#/order/') === 0)) ? next : '#/home';
        go(target);
      });
    }).catch(function(err){
      var c = err && err.code;
      if(c === 'device_blocked' || c === 'ip_limit_exceeded'){
        toast('🚫 تم حظر هذا الجهاز / عنوان IP لتجاوز الحد الأقصى (3 حسابات)');
      } else if(c === 'phone_taken'){
        toast('⚠️ هذا الرقم مسجّل مسبقاً — جاري التحويل لتسجيل الدخول');
        setTimeout(function(){ go('#/auth/login'); }, 1200);
      } else {
        toast(errMsg(c));
      }
    });
  };

  window.doLogin = function(){
    var rawPhone = $('lgPhone') ? $('lgPhone').value : '';
    var phone = normalizePhone(rawPhone);
    var pass = $('lgPass') ? $('lgPass').value : '';
    if(!validPhone(phone)){ toast('📱 يرجى إدخال رقم هاتف صحيح يبدأ بـ 07'); return; }
    if(!pass){ toast('🔑 يرجى كتابة كلمة المرور'); return; }
    
    window._lastPhone = phone;
    apiCall('auth', { action:'login', phone:phone, pass:pass, deviceId: getDeviceFingerprint() }).then(function(j){
      setToken(j.token);
      return refresh().then(function(){
        var u = me();
        toast('👋 أهلاً بعودتك يا ' + ((u && u.name) ? u.name.split(' ')[0] : ''));
        var next = window._authNext;
        window._authNext = null;
        var target = (next && (next.indexOf('#/book') === 0 || next.indexOf('#/order/') === 0)) ? next : (j.role === 'admin' ? '#/admin' : '#/home');
        go(target);
      });
    }).catch(function(e){
      var c = e && e.code;
      if(c === 'device_blocked'){
        toast('🚫 هذا الجهاز محظور من الاستخدام لتجاوز الحد الأقصى');
      } else if(c === 'not_registered'){
        toast('⚠️ هذا الرقم غير مسجّل — يمكنك إنشاء حساب جديد');
      } else if(c === 'bad_credentials'){
        toast('⚠️ كلمة المرور غير صحيحة');
      } else if(c === 'suspended'){
        toast('🚫 حسابك موقوف — راجع الإدارة عبر الدعم');
      } else {
        toast(errMsg(c));
      }
    });
  };

  window.logout = function(){
    setToken(null);
    refresh().then(function(){ toast('\ud83d\udc4b تم تسجيل الخروج'); go('#/home'); }, function(){ toast('\ud83d\udc4b تم تسجيل الخروج'); go('#/home'); });
  };

  window.resetDB=function(){ toast('\u26a0\ufe0f غير متاح في وضع السحابة — استخدم لوحة Supabase'); };
  window.resetAsk=function(){ toast('\u26a0\ufe0f غير متاح في وضع السحابة — استخدم لوحة Supabase'); };
  window.importData=function(){ toast('\u26a0\ufe0f الاستعادة غير متاحة في وضع السحابة'); };

  installModePill();
}

function installModePill(){
  var el=document.getElementById('modePill');
  if(!el){ el=document.createElement('div'); el.id='modePill'; el.style.cssText='position:fixed;bottom:12px;left:12px;z-index:9999;font:600 11.5px/1 Cairo,sans-serif;padding:7px 12px;border-radius:999px;border:1px solid var(--border-strong);box-shadow:0 2px 10px rgba(0,0,0,.08);background:#fff;user-select:none;direction:rtl'; document.body.appendChild(el); }
  if(window.MODE==='cloud'){ el.textContent='\u2601\ufe0f متصل بقاعدة البيانات'; el.style.color='var(--ok)'; }
  else { el.textContent='\ud83d\udcbe وضع محلي'; el.style.color='var(--muted)'; }
}

function bootLocal(){ window.MODE='local'; if(typeof loadDB==='function') loadDB(); installModePill(); render(); }

// 1. Instant First Render (0ms delay) from cache / seeded DB
loadToken();
if(typeof loadDB === 'function') loadDB();
window.MODE = 'cloud';
installCloud();
installModePill();
render(); // <-- INSTANT FIRST PAINT (No blank screen!)

// 2. Fast background live sync with Supabase
refresh().then(function(){
  installModePill();
  render();
}).catch(function(err){
  console.warn('Live sync fallback to local mode:', err);
  if(!DB || !DB.users || !DB.users.length) bootLocal();
});

})();