/* ================= UR v6 — طبقة السحابة (Vercel + Supabase) =================
   كل إجراء يروح للسيرفر ويتخزن بقاعدة البيانات — ماكو شي وهمي أبداً.
   v8 — تصحيح المنطق: مصفوفة صلاحيات صفحة الطلب (المقدم ما يلغي أبداً) +
        رؤية الطلبات المعلقة للمقدم + واجهة الذمة المالية + إصلاح نص مكسور. */
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
  price_locked:'\u26a0\ufe0f السعر انقفل بعد موافقة الزبون — ما ينعدل',
  cannot_advance:'\u26a0\ufe0f ما يمكن تقديم حالة الطلب الآن',
  bad_price:'\u26a0\ufe0f أدخل سعراً صحيحاً من مضاعفات 250 د.ع',
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
  payout_unavailable:'\u26a0\ufe0f عندك بلاغ سداد مفتوح — انتظر تأكيد الإدارة',
  bad_name:'\u270d\ufe0f اكتب اسماً صحيحاً',
  bad_phone:'\ud83d\udcf1 رقم الهاتف لازم يكون 11 رقم ويبدأ بـ 07',
  bad_pass:'\ud83d\udd11 كلمة المرور 6 أحرف على الأقل',
  bad_area:'\ud83d\udccd اختر منطقة',
  bad_range:'\u26a0\ufe0f تحقق من نطاق السعر',
  service_required:'\ud83e\uddf0 اختر خدمتك الرئيسية',
  too_many_open:'\u26a0\ufe0f عندك 3 طلبات مفتوحة — أكمل أو ألغِ واحداً قبل ما تطلب من جديد',
  self_dealing:'\ud83d\udeab النظام كشف تطابق جهاز بين الطرفين — التعامل الذاتي ممنوع ويُوثَّق',
  debt_blocked:'\ud83d\udeab ذمتك تجاوزت حد الإيقاف — سدّد أولاً حتى ترجع تستلم طلبات',
  overpay:'\u26a0\ufe0f المبلغ أكبر من ذمتك الحالية',
  cannot_delete_admin:'\ud83d\udeab لا يمكن حذف حساب الإدارة',
  disputed_open:'\u2696\ufe0f الطلب عليه نزاع مفتوح — ما يكتمِل حتى تُحسم الإدارة',
  cancel_abuse:'\ud83d\udeab إلغاءات متكررة خلال 24 ساعة — الطلبات متوقفة مؤقتاً حمايةً لوقت المقدمين',
  extra_pending:'\u26a0\ufe0f أكو إضافات بانتظار موافقة الزبون — تُحسم أو تُسحب قبل الإكمال'
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

  // v7 — بلاغ سداد ذمة: المقدم يدفع للمنصة (كاش/محفظة) والإدارة تؤكد الاستلام.
  //  المنصة لا تدفع لأحد أبداً — ماكو «طلب تسوية» يسحب فلوس منها.
  window.requestPayout = function(){
    var u=me(); var debt=(u&&u.provider&&u.provider.debt)||0;
    var inp=$('payAmount'); var v=parseInt(inp&&inp.value,10)||debt;
    if(!v||v<250||v%250!==0){ toast('\u26a0\ufe0f أدخل مبلغاً صحيحاً من مضاعفات 250 د.ع'); return; }
    if(v>debt){ toast('\u26a0\ufe0f المبلغ أكبر من ذمتك الحالية ('+debt+' د.ع)'); return; }
    cloudCall('reportPayment',{amount:v}).then(function(){
      toast('\ud83d\udcb5 بلاغ السداد وصل الإدارة — تُخصم الذمة بعد تأكيد الاستلام');
      renderProvider('earnings');
    }).catch(function(e){ toast(errMsg(e&&e.code)); });
  };

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

  // v7 — تأكيد استلام سداد (إدارة): ينزل الذمة ويقيّد بالدفتر
  window.payPayout = wrap('confirmSettlement', function(id){ return {payoutId:id}; },
    function(r,id){ toast('\u2713 تم تأكيد استلام السداد وتحديث ذمة المقدم'); renderAdmin('finance'); });

  // v8.2 — حسم النزاع (إدارة): يفك قفل الإكمال بعد الحسم
  window.resolveDispute = wrap('resolveDispute', function(id){ return {orderId:id}; },
    function(r,id){ toast('\u2713 انحسم النزاع — الطلب يرجع لمساره الطبيعي'); renderOrder(id); renderHeader(currentRoute().name); });

  // v8.3 — المقدم يرجّع السعر المخصص للتقديري ويفك الجمود بنفسه
  window.revertToEstimate = wrap('revertToEstimate', function(id){ return {orderId:id}; },
    function(r,id){ toast('\u21ba رجّعت الطلب للسعر التقديري — تكدر تكمل فوراً'); renderOrder(id); });

  // v8.4 — الأعمال الإضافية الميدانية: اقتراح بسعر ← موافقة/رفض الزبون ← سحب المقدم
  window.addExtraAsk = function(id){
    openModal('➕ إضافة عمل إضافي ميداني', '<div class="field"><label>وصف العمل الإضافي</label><input id="exDesc" placeholder="مثلاً: تبديل سيفون إضافي اكتشفته بالفحص"></div><div class="field"><label>المبلغ (د.ع — مضاعفات 250)</label><input id="exAmount" type="number" min="250" step="250" placeholder="5000"></div><div class="hint" style="font-size:12px;color:var(--faint)">الإضافة ما تنحسب ولا تدخل بالعمولة إلا بعد موافقة الزبون — موثّقة بالوصف والمبلغ والوقت.</div>', '➕ إرسال للزبون', function(){ addExtra(id); });
  };
  window.addExtra = wrap('addExtra',
    function(id){ var d=$('exDesc').value.trim(); var v=parseInt($('exAmount').value,10); if(d.length<3){ toast('اكتب وصف الإضافة'); return ABORT; } if(!v||v<250||v%250!==0){ toast('\u26a0\ufe0f أدخل مبلغاً من مضاعفات 250 د.ع'); return ABORT; } return {orderId:id, desc:d, amount:v}; },
    function(r,id){ closeModal(); toast('➕ انرسلت الإضافة للزبون — بانتظار موافقته'); renderOrder(id); });
  window.respondExtra = wrap('respondExtra', function(orderId, extraId, approve){ return {orderId:orderId, extraId:extraId, approve:approve}; },
    function(r,orderId){ toast('✓ تم تسجيل ردّك على الإضافة'); renderOrder(orderId); renderHeader(currentRoute().name); });
  window.withdrawExtra = wrap('withdrawExtra', function(orderId, extraId){ return {orderId:orderId, extraId:extraId}; },
    function(r,orderId){ toast('↩️ سحبت الإضافة — تكدر تكمل بالسعر الأساسي'); renderOrder(orderId); });

  // v8.2 — إيراد المنصة يُحسب من العمولات الموثّقة المقرّبة (مو التقديرية)
  window.platformRevenue = function(){
    if(!DB || !Array.isArray(DB.orders)) return 0;
    return DB.orders.filter(o=>o && o.status==='done').reduce(function(sum,o){ const e=earningsOf(o); return sum + ((o.commissionAmount!=null)?o.commissionAmount:e.commission); },0);
  };

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

  /* ============ v8: تصحيح منطق صفحة الطلب والصلاحيات والواجهة المالية ============ */

  // 1) الرؤية: المقدم يشوف الطلب المعلّق الي وصله (السيرفر أصلاً يرسله فقط للمطابقين) —
  //    قبل هالإصلاح المقدم يفتح الإشعار ويطلع صفحة فاضية!
  window.orderVisible = function(o, u){
    if(!u) return false;
    if(u.role==='admin'||o.customerId===u.id||o.providerId===u.id) return true;
    if(u.role==='provider' && o.status==='pending' && (o.rejectedBy||[]).indexOf(u.id)<0) return true;
    return false;
  };

  // 2) صفحة الطلب — مصفوفة إجراءات صحيحة: المقدم ما يشوف «إلغاء الطلب» أبداً.
  //    مقدم على طلب معلّق: قبول/تجاهل فقط · مقدم مستلم: تقديم/تسعير/اعتذار فقط.
  window.renderOrder = function(id){
  const o=orderById(id);
  const u=me();
  if(!o){ $('orderRoot').innerHTML='<div class="empty card" style="margin-top:50px"><span class="ic">🔍</span><p>الطلب غير موجود.</p><button class="btn btn-primary" style="margin-top:14px" onclick="go(\'#/account\')">طلباتي</button></div>'; return; }
  if(!u||!orderVisible(o,u)){ requireAuth('#/order/'+id); return; }
  const s=svc(o.serviceId);
  const cust=userById(o.customerId);
  const p=o.providerId?userById(o.providerId):null;
  const isCust=o.customerId===u.id, isProv=o.providerId===u.id, isAdm=u.role==='admin';
  const isProvPendingViewer = !isCust && !isProv && !isAdm && u.role==='provider' && o.status==='pending' && (o.rejectedBy||[]).indexOf(u.id)<0;
  const priceCustom = o.finalPrice!=null && o.finalPrice!==o.estimate; // قفل الموافقة فقط إذا المقدم خصّص السعر
  const apprList=(o.extras||[]).filter(x=>x.status==='approved');
  const apprExtras=apprList.reduce((s,x)=>s+x.amount,0);
  const apprCount=apprList.length;

  let topHtml='';
  if(o.status==='cancelled'){
    topHtml='<div class="banner banner-red"><span class="ic">🚫</span><div><b>هذا الطلب ملغي.</b><br>'+(o.cancelReason?esc(o.cancelReason):'')+'</div></div>';
  } else {
    const idx=STATUS_ORDER.indexOf(o.status);
    topHtml='<div class="status-timeline">'+STATUSES.map((st,i)=>'<div class="st '+(i<idx?'done':i===idx?'now':'')+'"><div class="n">'+(i<idx?'✓':st.icon)+'</div><span>'+st.label+'</span></div>').join('')+'</div>';
  }
  if(o.disputed&&o.status!=='cancelled') topHtml+='<div class="banner banner-amber"><span class="ic">⚖️</span><div><b>يوجد نزاع مفتوح على هذا الطلب</b> — الإدارة تراجعه من مركز التذاكر.</div></div>';
  if(o.flagged&&isAdm) topHtml+='<div class="banner banner-red"><span class="ic">🚨</span><div><b>طلب مُعلَّم للمراجعة</b> — اشتباه تلقائي (تطابق بصمة جهاز أو سعر تحت أرضية الكتالوج).</div></div>';

  // بطاقة السعر — تقرأ القيم الموثّقة من السيرفر عند توفرها (commissionAmount/roundingDelta)
  let priceCard='';
  if(p){
    const e=earningsOf(o);
    const rateVal=(o.commissionRate!=null)?o.commissionRate:e.rate;
    const comm=(o.commissionAmount!=null)?o.commissionAmount:e.commission;
    const price=(o.finalPrice!=null?o.finalPrice:o.estimate);
    priceCard='<div class="order-card"><h4>💰 السعر والعمولة</h4>'
      +'<div class="detail-row"><span>السعر التقديري</span><b>'+fmt(o.estimate)+' د.ع</b></div>'
      +'<div class="detail-row"><span>السعر النهائي</span><b>'+(o.finalPrice!=null?fmt(o.finalPrice)+' د.ع':'—')+(priceCustom?(o.priceConfirmed?' <span class="chip chip-green">✓ وافق عليه الزبون</span>':' <span class="chip chip-amber">بانتظار موافقة الزبون</span>'):'')+'</b></div>'
      +(apprExtras?'<div class="detail-row"><span>➕ إضافات معتمدة ('+apprCount+')</span><b>+ '+fmt(apprExtras)+' د.ع</b></div>':'')
      +(isProv||isAdm? '<div class="detail-row"><span>عمولة المنصة ('+rateVal+'%)</span><b>− '+fmt(comm)+' د.ع</b></div>'
        +(o.roundingDelta?'<div class="detail-row"><span style="font-size:12px">فرق التقريب (وحدة 250 د.ع)</span><b style="font-size:12.5px;color:var(--muted)">'+(o.roundingDelta>0?'+':'')+o.roundingDelta+' د.ع — موثّق بدفتر الذمة</b></div>':'')
        +'<div class="detail-row"><span>صافي المقدم</span><b style="color:var(--ok)">'+fmt(Math.max(0,price-comm))+' د.ع</b></div>' : '')
      +'</div>';
  }

  // بطاقة الإضافات الميدانية — كل عمل زيادة موثّق بوصف وسعر وموافقة
  let extrasCard='';
  const exList=(o.extras||[]);
  if(exList.length){
    extrasCard='<div class="order-card"><h4>➕ أعمال إضافية ميدانية ('+exList.length+')</h4>'
      +exList.map(ex=>'<div class="detail-row"><span>'+esc(ex.desc)+'<br><span style="font-size:11.5px;color:var(--faint)">'+ex.id+' · '+fmtD(ex.at)+'</span></span><b>'+fmt(ex.amount)+' د.ع '+(ex.status==='pending'?'<span class="chip chip-amber">⏳ بانتظار الزبون</span>':ex.status==='approved'?'<span class="chip chip-green">✓ موافق عليها</span>':ex.status==='rejected'?'<span class="chip chip-red">🚫 مرفوضة</span>':'<span class="chip chip-gray">↩️ مسحوبة</span>')+'</b></div>'
      +(isCust&&ex.status==='pending'?'<div style="display:flex;gap:8px;margin:4px 0 10px"><button class="btn btn-primary btn-sm" onclick="respondExtra(\''+o.id+'\',\''+ex.id+'\',true)">✓ أوافق</button><button class="btn btn-ghost btn-sm" onclick="respondExtra(\''+o.id+'\',\''+ex.id+'\',false)">✗ أرفض</button></div>':'')
      +(isProv&&ex.status==='pending'?'<div style="margin:4px 0 10px"><button class="btn btn-ghost btn-sm" onclick="withdrawExtra(\''+o.id+'\',\''+ex.id+'\')">↩️ سحب الإضافة</button></div>':'')).join('')
      +'</div>';
  }

  // إجراءات — كل دور يشوف فقط ما يخصه
  let actions='';
  if(isCust){
    if(o.status==='pending'||o.status==='accepted') actions+='<button class="btn btn-danger btn-sm" onclick="cancelOrderAsk(\''+o.id+'\')">إلغاء الطلب</button>';
    if(o.status==='accepted'&&priceCustom&&!o.priceConfirmed) actions+='<button class="btn btn-primary btn-sm" onclick="confirmPrice(\''+o.id+'\')">✓ أوافق على السعر النهائي ('+fmt(o.finalPrice)+' د.ع)</button>';
    if(['accepted','enroute','started'].includes(o.status)&&!o.disputed) actions+='<button class="btn btn-ghost btn-sm" onclick="openDispute(\''+o.id+'\')">⚖️ افتح نزاع</button>';
    if(o.status==='done') actions+='<button class="btn btn-outline btn-sm" onclick="reorder(\''+o.id+'\')">↺ أعد الطلب</button>';
  }
  if(isProv){
    const i=STATUS_ORDER.indexOf(o.status);
    if(o.status==='accepted') actions+='<button class="btn btn-outline btn-sm" onclick="setFinalPriceAsk(\''+o.id+'\')">💰 عدّل السعر النهائي</button>';
    if(o.status==='accepted'&&priceCustom&&!o.priceConfirmed) actions+='<button class="btn btn-ghost btn-sm" onclick="revertToEstimate(\''+o.id+'\')">↺ ارجع للسعر التقديري</button>';
    if(['accepted','enroute','started'].includes(o.status)) actions+='<button class="btn btn-outline btn-sm" onclick="addExtraAsk(\''+o.id+'\')">➕ عمل إضافي</button>';
    if(i>0&&i<STATUS_ORDER.length-1){ const next=STATUS_ORDER[i+1]; actions+='<button class="btn btn-primary btn-sm" onclick="advanceOrder(\''+o.id+'\')">'+(next==='done'?'🎉 أكمل الخدمة':'التالي: '+stInfo(next).label)+'</button>'; }
    // المقدم يعتذر بأي مرحلة نشطة — الطلب يرجع للسوق وما ينلغي أبداً بيده
    if(['accepted','enroute','started'].includes(o.status)) actions+='<button class="btn btn-danger btn-sm" onclick="providerDrop(\''+o.id+'\')">اعتذار عن الطلب</button>';
    if(['enroute','started'].includes(o.status)&&!o.disputed) actions+='<button class="btn btn-ghost btn-sm" onclick="openDispute(\''+o.id+'\')">⚖️ بلّغ عن مشكلة</button>';
  }
  if(isProvPendingViewer){
    const verified = u.provider && u.provider.verified==='verified';
    const avail = u.provider && u.provider.avail!==false;
    actions+=(verified&&avail)
      ? '<button class="btn btn-primary btn-sm" onclick="acceptOrder(\''+o.id+'\')">✅ قبول الطلب</button>'
      : '<button class="btn btn-primary btn-sm" disabled title="'+(verified?'فعّل التوفر من لوحتك':'ينتظر توثيق الإدارة')+'">✅ قبول الطلب</button>';
    actions+='<button class="btn btn-ghost btn-sm" onclick="rejectOrder(\''+o.id+'\')">✗ تجاهل</button>';
  }
  if(isAdm&&o.disputed&&o.status!=='cancelled') actions+='<button class="btn btn-primary btn-sm" onclick="resolveDispute(\''+o.id+'\')">✓ حسم النزاع</button>';
  if(isAdm&&o.status!=='cancelled'&&o.status!=='done') actions+='<button class="btn btn-danger btn-sm" onclick="cancelOrderAsk(\''+o.id+'\')">🛡️ إلغاء إداري</button>';

  // التقييم
  let rateBox='';
  if(o.status==='done'&&isCust&&!o.review){
    window._rateVal=0;
    rateBox='<div class="order-card"><h4>⭐ قيّم الخدمة</h4><p style="font-size:14px;color:var(--muted);margin-bottom:12px">شكد ترضى عن '+(p?esc(p.name):'مقدم الخدمة')+'؟ تقييمك يرتبط بهذا الطلب مباشرة.</p>'
      +'<div class="rating-stars" id="rateStars">'+[1,2,3,4,5].map(n=>'<span data-v="'+n+'" onclick="ratePick('+n+')">★</span>').join('')+'</div>'
      +'<div class="field" style="margin-top:14px"><label>تعليق (اختياري)</label><input id="rateText" placeholder="شلون كانت الخدمة؟"></div>'
      +'<button class="btn btn-primary btn-sm" onclick="rateSubmit(\''+o.id+'\')">إرسال التقييم</button></div>';
  } else if(o.review){
    rateBox='<div class="order-card"><h4>⭐ التقييم</h4><div class="stars-row" style="font-size:20px;letter-spacing:2px;margin-bottom:6px">'+stars(o.review.stars)+'</div>'
      +(o.review.text?'<p style="font-size:14.5px">"'+esc(o.review.text)+'"</p>':'')
      +'<div style="font-size:12px;color:var(--muted);margin-top:8px">'+fmtD(o.review.at)+' · بواسطة '+esc(cust?cust.name.split(' ')[0]:'الزبون')+'</div></div>';
  }

  // الدردشة
  let chatBox='';
  if(p&&(isCust||isProv)){
    const msgs=DB.messages.filter(m=>m.orderId===o.id).sort((a,b)=>a.at-b.at);
    chatBox='<div class="order-card"><h4>💬 دردشة الطلب <span style="font-size:12px;color:var(--muted);font-weight:600">— محفوظة ومرجع عند أي نزاع</span></h4>'
      +'<div class="chat-list" id="chatList">'
      +(msgs.length? msgs.map(m=>'<div class="msg '+(m.fromId===u.id?'me':'them')+'">'+esc(m.text)+'<time>'+timeAgo(m.at)+'</time></div>').join('') : '<div style="text-align:center;color:var(--faint);font-size:13px;padding:14px">ابدأ المحادثة — نسّقوا التفاصيل هنا بدل تبادل الأرقام</div>')
      +'</div>'
      +'<div class="chat-box"><input id="chatInput" placeholder="اكتب رسالتك…" onkeydown="if(event.key===\'Enter\')sendMsg(\''+o.id+'\')"><button class="btn btn-primary btn-sm" onclick="sendMsg(\''+o.id+'\')">إرسال</button></div></div>';
  }

  $('orderRoot').innerHTML=`
  <div class="order-head"><h1>${o.id} <span style="font-size:15px;color:var(--muted);font-weight:500">· ${fmtDT(o.createdAt)}</span></h1>
    <button class="btn btn-ghost btn-sm" onclick="go('#/${isProv?'provider':isAdm?'admin/orders':isProvPendingViewer?'provider':'account'}')">← رجوع للوحة</button></div>
  ${topHtml}
  <div class="order-card"><h4>${s?s.icon:'🧰'} ${s?s.name:'خدمة'}</h4>
    <div class="detail-row"><span>الوصف</span><b>${esc(o.desc)}</b></div>
    <div class="detail-row"><span>المنطقة</span><b>${o.area}${o.address?' — '+esc(o.address):''}</b></div>
    <div class="detail-row"><span>الوقت</span><b>${whenText(o)}</b></div>
    <div class="detail-row"><span>الدفع</span><b>${o.payMethod==='wallet'?'📱 محفظة إلكترونية':'💵 كاش عند الإنجاز'}</b></div>
    ${!p?'<div class="detail-row"><span>السعر التقديري</span><b>'+fmt(o.estimate)+' د.ع</b></div>':''}
    <div class="detail-row"><span>الزبون</span><b>${esc(cust?cust.name:'—')} · 📍${esc(cust?cust.area:'')}</b></div>
  </div>
  ${p?'<div class="order-card"><h4>🧑‍🔧 مقدم الخدمة</h4><div style="display:flex;align-items:center;gap:13px"><div class="avatar">'+initials(p.name)+'</div><div><b style="font-size:15.5px">'+esc(p.name)+' '+(isVerifiedProv(p)?'<span class="stamp">✓ موثّق</span>':'')+'</b><div style="font-size:13px;color:var(--muted);margin-top:3px">'+stars(provRating(p)||0)+' '+provRatingTxt(p)+' · '+(p.provider.jobs||0)+' طلب مكتمل · '+p.provider.exp+' سنوات خبرة</div></div></div></div>':''}
  ${priceCard}
  ${extrasCard}
  ${chatBox}
  ${rateBox}
  ${actions?'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">'+actions+'</div>':''}
  `;
  const cl=$('chatList'); if(cl) cl.scrollTop=cl.scrollHeight;
  };

  // 3) شريحة العمولة — نفس قاعدة السيرفر: عدد طلبات + زبائن مختلفين
  window.currentTierLabel = function(u){
    const c=DB.settings.commission;
    const D=(DB.settings&&DB.settings.debt)||{loyalMinCustomers:6,eliteMinCustomers:15};
    const d=new Date(), m=d.getMonth(), y=d.getFullYear();
    const mine=(DB.orders||[]).filter(o=>o && o.providerId===u.id&&o.status==='done'&&(()=>{const t=new Date(o.doneAt||o.createdAt);return t.getMonth()===m&&t.getFullYear()===y;})());
    const custs=new Set(mine.map(o=>o.customerId)).size;
    if(mine.length>=DB.settings.eliteAt&&custs>=(D.eliteMinCustomers||15)) return c.elite+'% — نخبة ('+mine.length+' طلب · '+custs+' زبون هذا الشهر)';
    if(mine.length>=DB.settings.loyalAt&&custs>=(D.loyalMinCustomers||6)) return c.loyal+'% — ولاء ('+mine.length+' طلب · '+custs+' زبون هذا الشهر)';
    return c.standard+'% — قياسي ('+mine.length+' طلب · '+custs+' زبون هذا الشهر)';
  };

  // 4) لوحة المقدم — تبويب الماليات على نموذج الذمة الموثّقة + إصلاح النص المكسور
  window.renderProvider = function(tab){
  const u=me();
  if(!u){ requireAuth('#/provider'); return; }
  if(u.role!=='provider'){ go('#/account'); return; }
  if(!u.provider){
    u.provider = {
      serviceId: 's1', serviceIds: ['s1'], exp: 3, areas: ['كل الناصرية', u.area || 'الناصرية'],
      verified: 'pending', avail: true, ratingSum: 0, ratingCount: 0,
      jobs: 0, balance: 0, settled: 0, debt: 0, sensitive: false
    };
  }
  if(!Array.isArray(u.provider.areas) || !u.provider.areas.length){
    u.provider.areas = ['كل الناصرية', u.area || 'الناصرية'];
  }
  const myServiceIds = (Array.isArray(u.provider.serviceIds) && u.provider.serviceIds.length)
    ? u.provider.serviceIds
    : [u.provider.serviceId || 's1'];
  u.provider.serviceIds = myServiceIds;

  tab=tab||'incoming';
  const s=svc(myServiceIds[0]);
  const allMySvcs = myServiceIds.map(id => svc(id)).filter(Boolean);
  const verified=u.provider.verified==='verified';
  const pendingV=u.provider.verified==='pending' || !u.provider.verified;
  const rejectedV=u.provider.verified==='rejected';

  const orders = (DB && Array.isArray(DB.orders)) ? DB.orders : [];
  const payouts = (DB && Array.isArray(DB.payouts)) ? DB.payouts : [];

  const incoming = orders.filter(o => o && o.status === 'pending'
    && (myServiceIds.includes(o.serviceId))
    && (u.provider.areas.includes('كل الناصرية') || u.provider.areas.includes(o.area))
    && !(Array.isArray(o.rejectedBy) && o.rejectedBy.includes(u.id)) && o.customerId !== u.id);
  const active = orders.filter(o => o && o.providerId === u.id && ['accepted','enroute','started'].includes(o.status));
  const done = orders.filter(o => o && o.providerId === u.id && o.status === 'done');
  const allMyOrders = orders.filter(o => o && o.providerId === u.id);
  const myPayouts = payouts.filter(p => p && p.providerId === u.id);
  const netOf = function(o){ const e=earningsOf(o); const comm=(o.commissionAmount!=null)?o.commissionAmount:e.commission; return Math.max(0, orderPrice(o)-comm); };
  const priceCustomF = function(o){ return o.finalPrice!=null && o.finalPrice!==o.estimate; };
  const monthNet = done.filter(o => {
    const t = new Date((o && (o.doneAt || o.createdAt)) || Date.now());
    const d = new Date();
    return t.getMonth() === d.getMonth() && t.getFullYear() === d.getFullYear();
  }).reduce((sum, o) => sum + netOf(o), 0);
  const reviews = done.filter(o => o && o.review).sort((a, b) => ((b.review && b.review.at) || 0) - ((a.review && a.review.at) || 0));

  let banner='';
  if(pendingV) {
    banner='<div class="banner banner-amber"><span class="ic">⏳</span><div><b>حسابك قيد المراجعة والتوثيق من الإدارة.</b><br>يمكنك تصفح الطلبات الواردة، وسيتم تفعيل قبول الطلبات فور اعتماد حسابك'+(u.provider.sensitive?' — <b style="color:var(--danger)">خدمتك حساسة وتتطلب مقابلة</b>':'')+'.</div></div>';
  }
  if(rejectedV) {
    const rReason = u.provider.rejectReason ? `<div style="margin-top:8px;background:rgba(220,38,38,.09);border-right:3px solid var(--danger);padding:8px 12px;border-radius:6px;font-size:13.5px;color:var(--ink)"><b>سبب الرفض:</b> ${esc(u.provider.rejectReason)}</div>` : '';
    banner=`<div class="banner banner-red"><span class="ic">🚫</span><div style="flex:1"><b>تم رفض طلب التوثيق من قِبل الإدارة.</b><br>يرجى مراجعة سبب الرفض أدناه وتعديل بيانات ملفك أو التواصل مع الإدارة لإعادة النظر.${rReason}<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="reapplyVerification()">🔄 إعادة التقديم للتوثيق</button><button class="btn btn-outline btn-sm" onclick="go('#/provider/profile')">✏️ تعديل الملف</button><button class="btn btn-ghost btn-sm" onclick="go('#/support')">🎧 الدعم</button></div></div></div>`;
  }
  if(verified && u.provider.adminNote) {
    banner=`<div class="banner banner-green" style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2)"><span class="ic">🎉</span><div><b>حسابك موثّق ومعتمد.</b><br>${esc(u.provider.adminNote)}</div></div>`;
  }

  let content='';
  if(tab==='incoming'){
    content='<h3 style="font-size:18px;font-weight:900;margin-bottom:14px">📥 طلبات واردة مطابقة ('+incoming.length+')</h3>';
    if(!incoming.length) content+='<div class="empty card"><span class="ic">📭</span>لا توجد طلبات واردة حالياً — أي طلب جديد بخدماتك المحددة ('+myServiceIds.length+' مهن) ومناطقك سيظهر هنا فوراً.</div>';
    incoming.forEach(o=>{
      const os=svc(o.serviceId); const cust=userById(o.customerId);
      content+='<div class="req-card"><div class="top"><div class="ic">'+os.icon+'</div>'
        +'<div><b>'+os.name+'</b><span>'+esc(o.area||'')+' · '+whenText(o)+' · '+timeAgo(o.createdAt)+' · الزبون: '+esc(cust?cust.name.split(' ')[0]:'—')+'</span></div>'
        +'<div class="price">'+fmt(o.estimate)+' د.ع <span style="font-size:11px;color:var(--muted);font-weight:600">تقديري</span></div></div>'
        +'<p style="font-size:14px;color:var(--muted)">'+esc(o.desc)+'</p>'
        +'<div class="actions">'
        +(verified&&u.provider.avail
          ? '<button class="btn btn-primary btn-sm" onclick="acceptOrder(\''+o.id+'\')">✓ قبول الطلب</button>'
          : '<button class="btn btn-primary btn-sm" disabled title="'+(verified?'فعّل التوفر من الجانب':'ينتظر توثيق الإدارة')+'">✓ قبول الطلب</button>')
        +(cust&&cust.phone?'<a class="btn btn-ghost btn-sm" href="tel:'+esc(cust.phone)+'">📞 اتصال بالزبون</a>':'')
        +'<button class="btn btn-ghost btn-sm" onclick="go(\'#/order/'+o.id+'\')">📄 التفاصيل</button>'
        +'<button class="btn btn-ghost btn-sm" onclick="rejectOrder(\''+o.id+'\')">✗ تجاهل</button></div></div>';
    });
  } else if(tab==='active'){
    content='<h3 style="font-size:18px;font-weight:900;margin-bottom:14px">🔨 طلباتي الجارية ('+active.length+')</h3>';
    if(!active.length) content+='<div class="empty card"><span class="ic">🧰</span>لا توجد طلبات جارية حالياً. يمكنك قبول طلب من قائمة الوارد.</div>';
    active.forEach(o=>{
      const os=svc(o.serviceId); const st=stInfo(o.status); const i=STATUS_ORDER.indexOf(o.status); const next=STATUS_ORDER[i+1];
      const cust=userById(o.customerId);
      content+='<div class="req-card" style="border:1.5px solid var(--border-strong)"><div class="top"><div class="ic">'+os.icon+'</div>'
        +'<div><b>'+os.name+' <span class="chip chip-dark" style="font-size:11px;padding:2px 9px">'+st.icon+' '+st.label+'</span>'+(priceCustomF(o)?(o.priceConfirmed?' <span class="chip chip-green" style="font-size:11px;padding:2px 9px">✓ سعر مؤكد من الزبون</span>':' <span class="chip chip-amber" style="font-size:11px;padding:2px 9px">⏳ بانتظار موافقة الزبون على السعر المخصص</span>'):' <span class="chip chip-gray" style="font-size:11px;padding:2px 9px">بالسعر التقديري</span>')+'</b>'
        +'<span>'+o.id+' · '+esc(o.area||'')+(o.address?' — '+esc(o.address):'')+' · '+whenText(o)+' · الزبون: '+esc(cust?cust.name:'—')+'</span></div>'
        +'<div class="price">'+fmt(orderPrice(o))+' د.ع</div></div>'
        +'<div class="actions" style="gap:8px;flex-wrap:wrap">'
        +(next?'<button class="btn btn-primary btn-sm" onclick="advanceOrder(\''+o.id+'\')">'+(next==='done'?'🎉 إكمال الخدمة بنجاح':'التالي: '+stInfo(next).label)+'</button>':'')
        +(o.status==='accepted'?'<button class="btn btn-outline btn-sm" onclick="setFinalPriceAsk(\''+o.id+'\')">💰 تحديد السعر النهائي</button>':'')
        +(cust&&cust.phone?'<a class="btn btn-ghost btn-sm" href="tel:'+esc(cust.phone)+'">📞 اتصال بالزبون</a>':'')
        +'<button class="btn btn-ghost btn-sm" onclick="go(\'#/order/'+o.id+'\')">💬 الدردشة والتفاصيل ←</button></div></div>';
    });
  } else if(tab==='earnings'){
    const debt=u.provider.debt||0;
    const D=(DB&&DB.settings&&DB.settings.debt)||{warnAt:25000,blockAt:50000};
    const myLedger=(DB&&Array.isArray(DB.ledger))?DB.ledger:[];
    content='<div class="card" style="margin-bottom:16px"><h4 style="font-size:17px;font-weight:900;margin-bottom:16px">⚖️ مالياتي مع المنصة — نظام الذمة الموثّقة</h4>'
      +'<div class="detail-row"><span>الذمة الحالية للمنصة (عمولات مستحقة)</span><b style="color:'+(debt>0?'var(--danger)':'var(--ok)')+';font-size:19px">'+fmt(debt)+' د.ع</b></div>'
      +'<div class="detail-row"><span>صافي أرباحي هذا الشهر (بعد العمولة)</span><b style="color:var(--ok)">'+fmt(monthNet)+' د.ع</b></div>'
      +'<div class="detail-row"><span>شريحة عمولتك الحالية</span><b>'+currentTierLabel(u)+'</b></div>'
      +(debt>=D.blockAt
        ?'<div class="banner banner-red" style="margin-top:14px"><span class="ic">🚫</span><div><b>ذمتك تجاوزت حد الإيقاف ('+fmt(D.blockAt)+' د.ع).</b><br>ما توصلك طلبات جديدة حتى تسدّد — سدّد وترجع تشتغل فوراً.</div></div>'
        :debt>=D.warnAt
        ?'<div class="banner banner-amber" style="margin-top:14px"><span class="ic">⚠️</span><div><b>ذمتك وصلت '+fmt(debt)+' د.ع.</b><br>سدّد قبل بلوغ حد الإيقاف '+fmt(D.blockAt)+' د.ع حتى ما ينحظر استقبال الطلبات.</div></div>':'')
      +'<div class="field" style="margin-top:16px"><label>مبلغ السداد (د.ع — من مضاعفات 250)</label><input type="number" id="payAmount" min="250" step="250" value="'+debt+'" '+(debt>0?'':'disabled')+'></div>'
      +'<button class="btn btn-primary btn-sm" '+(debt>0?'':'disabled')+' onclick="requestPayout()">💵 بلاغ سداد للإدارة</button>'
      +'<div class="hint" style="font-size:12px;color:var(--faint);margin-top:8px">الزبون يدفع لك مباشرة (كاش/محفظة) — المنصة ما تلمس فلوسك. عمولتها تتراكم كذمة موثّقة وتسدّدها هنا؛ البلاغ يُؤكَّد من الإدارة بعد استلام المبلغ فينقيد بالدفتر.</div></div>';
    content+='<h3 style="font-size:17px;font-weight:900;margin-bottom:14px">🧾 بلاغات السداد السابقة ('+myPayouts.length+')</h3>';
    content+=myPayouts.length? myPayouts.map(p=>'<div class="req-card"><div class="top"><div class="ic">💵</div><div><b>'+p.id+' <span class="chip '+(p.status==='paid'?'chip-green':'chip-amber')+'" style="font-size:11px;padding:2px 9px">'+(p.status==='paid'?'✓ مؤكدة الاستلام':'⏳ بانتظار تأكيد الإدارة')+'</span></b><span>'+fmtDT(p.at)+(p.paidAt?' · أكُّدت '+fmtDT(p.paidAt):'')+'</span></div><div class="price">'+fmt(p.amount)+' د.ع</div></div></div>').join('')
      :'<div class="empty card"><span class="ic">🧾</span>ماكو بلاغات سداد بعد.</div>';
    content+='<h3 style="font-size:17px;font-weight:900;margin:26px 0 14px">📒 دفتر الذمة — آخر القيود الموثّقة ('+myLedger.length+')</h3>';
    content+=myLedger.length? myLedger.map(l=>'<div class="req-card" style="padding:12px 16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div style="flex:1;min-width:200px"><b style="font-size:13.5px">'+(l.kind==='commission'?'📌 عمولة':l.kind==='payment'?'💵 سداد':'⚖️ تعديل')+'</b> <span style="font-size:13px;color:var(--muted)">'+esc(l.note||'')+'</span><br><span style="font-size:11.5px;color:var(--faint)">'+fmtDT(l.at)+(l.orderId?' · '+l.orderId:'')+'</span></div><div style="text-align:left;white-space:nowrap"><b style="color:'+(l.amount>0?'var(--danger)':'var(--ok)')+'">'+(l.amount>0?'+':'')+fmt(l.amount)+' د.ع</b><br><span style="font-size:11.5px;color:var(--muted)">الذمة بعدها: '+fmt(l.balanceAfter)+' د.ع</span></div></div></div>').join('')
      :'<div class="empty card"><span class="ic">📒</span>ماكو قيود بعد — أول طلب مكتمل ينقيد هنا تلقائياً مع فرق التقريب.</div>';
    content+='<h3 style="font-size:17px;font-weight:900;margin:26px 0 14px">✅ آخر الطلبات المكتملة وتفاصيل العمولات</h3>';
    content+=done.length? done.slice(0,8).map(o=>{ const e=earningsOf(o); const comm=(o.commissionAmount!=null)?o.commissionAmount:e.commission; const rateV=(o.commissionRate!=null)?o.commissionRate:e.rate; return '<div class="req-card"><div class="top"><div class="ic">'+svc(o.serviceId).icon+'</div><div><b>'+svc(o.serviceId).name+'</b><span>'+o.id+' · '+esc(o.area||'')+' · '+fmtD(o.doneAt||o.createdAt)+(o.review?' · ⭐ '+o.review.stars+'/5':'')+'</span></div><div style="margin-inline-start:auto;text-align:left"><b style="color:var(--ok)">+'+fmt(Math.max(0,orderPrice(o)-comm))+' د.ع</b><br><span style="font-size:11.5px;color:var(--muted)">عمولة '+rateV+'% (−'+fmt(comm)+' ذمة موثّقة)</span></div></div></div>'; }).join('')
      :'<div class="empty card"><span class="ic">📊</span>لا توجد طلبات مكتملة بعد.</div>';
  } else if(tab==='reviews'){
    content='<h3 style="font-size:18px;font-weight:900;margin-bottom:14px">⭐ تقييماتي وآراء الزبائن ('+reviews.length+')</h3>';
    content+=reviews.length? reviews.map(o=>{ const c=userById(o.customerId); return '<div class="review-card" style="margin-bottom:12px"><div class="stars-row">'+stars(o.review.stars)+'</div>'+(o.review.text?'<p class="q">"'+esc(o.review.text)+'"</p>':'')+'<div class="who"><div class="avatar">'+initials(c?c.name:'ز')+'</div><div><b>'+esc(c?c.name.split(' ')[0]:'زبون')+'</b><span>الطلب: '+o.id+' · '+fmtD(o.review.at)+'</span></div></div></div>'; }).join('')
      :'<div class="empty card"><span class="ic">⭐</span>لا توجد تقييمات بعد — أول خدمة مكتملة ستظهر تقييمها هنا.</div>';
  } else if(tab==='history'){
    content='<h3 style="font-size:18px;font-weight:900;margin-bottom:14px">📦 سجل كافة الطلبات ('+allMyOrders.length+')</h3>';
    content+=allMyOrders.length ? allMyOrders.map(o => {
      const os = svc(o.serviceId); const st = stInfo(o.status); const cust = userById(o.customerId);
      return `<div class="req-card">
        <div class="top">
          <div class="ic">${os?os.icon:'🧰'}</div>
          <div><b>${os?os.name:'خدمة'} <span class="chip ${o.status==='done'?'chip-green':o.status==='cancelled'?'chip-red':'chip-dark'}" style="font-size:11px;padding:2px 9px">${st.icon} ${st.label}</span></b>
          <span>${o.id} · ${esc(o.area||'')} · ${fmtD(o.createdAt)} · الزبون: ${esc(cust?cust.name:'—')}</span></div>
          <div class="price">${fmt(orderPrice(o))} د.ع</div>
        </div>
        <div class="actions">
          <button class="btn btn-ghost btn-sm" onclick="go('#/order/${o.id}')">عرض التفاصيل ←</button>
        </div>
      </div>`;
    }).join('') : '<div class="empty card"><span class="ic">📦</span>لا توجد طلبات سابقة.</div>';
  } else if(tab==='profile'){
    const areasList=(DB&&DB.settings&&DB.settings.areas)?DB.settings.areas:DEF_AREAS;
    const reapplyCard = rejectedV ? `
      <div class="card" style="margin-bottom:16px;border:1.5px solid var(--danger);background:rgba(220,38,38,.03)">
        <h4 style="font-size:16px;font-weight:900;color:var(--danger);margin-bottom:6px">🔄 إعادة التقديم للتوثيق</h4>
        <p style="font-size:13.5px;color:var(--muted);margin-bottom:12px">حدّث بياناتك أو مهنتك أدناه ثم اضغط زر إعادة التقديم لتتم مراجعة حسابك من قِبل الإدارة مجدداً.</p>
        <button class="btn btn-outline btn-sm" onclick="reapplyVerification()">🔄 إرسال طلب إعادة التوثيق للإدارة</button>
      </div>` : '';

    content= reapplyCard
      +'<div class="card"><h4 style="font-size:17px;font-weight:900;margin-bottom:18px">✏️ ملف مقدم الخدمة</h4>'
      +'<div class="grid grid-2" style="gap:12px">'
      +'<div class="field"><label>الاسم الكامل</label><input id="pvfName" value="'+esc(u.name)+'"></div>'
      +'<div class="field"><label>رقم الهاتف</label><input id="pvfPhone" value="'+esc(u.phone)+'" maxlength="15"></div>'
      +'</div>'
      +'<div class="field">'
      +'<label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
      +'<span style="font-size:14.5px;font-weight:900">🧰 الخدمات التي تقدمها (اختر حتى 3 خدمات)</span>'
      +'<span id="pvfSvcCountBadge" class="chip chip-dark" style="font-size:12px;padding:3px 10px">'+myServiceIds.length+' / 3 محددة</span>'
      +'</label>'
      +'<div class="svc-dropdown-wrap">'
      +'<div class="svc-trigger-head" onclick="toggleSvcDrawer(\'pvfSvcDrawer\')">'
      +'<span class="svc-trigger-btn">🗂️ اضغط هنا لتعديل أو إضافة مهنك <span style="font-size:12px">▼</span></span>'
      +'<span style="font-size:12px;color:var(--muted);font-weight:700">تصفح الخدمات</span>'
      +'</div>'
      +'<div id="pvfSelectedChips" class="svc-chips-bar">'
      +myServiceIds.map(sid => {
        const s = svc(sid);
        return s ? '<span class="svc-chip-item">'+s.icon+' '+esc(s.name)+' <span class="del-btn" onclick="removeSvcChoice(\'pvfServiceCheck\',\''+s.id+'\',\'pvfSelectedChips\',\'pvfSvcCountBadge\')">✕</span></span>' : '';
      }).join('')
      +'</div>'
      +'<div id="pvfSvcDrawer" class="svc-drawer-panel" style="display:none">'
      +'<input type="text" class="svc-search-input" placeholder="🔍 ابحث عن خدمة..." oninput="filterSvcDrawer(this.value, \'pvfSvcList\')">'
      +'<div class="svc-compact-list" id="pvfSvcList">'
      +activeServices().map(s=>{
        const isSel = myServiceIds.includes(s.id);
        return '<label class="svc-compact-row '+(isSel?'active':'')+'" data-name="'+s.name.toLowerCase()+' '+s.desc.toLowerCase()+'">'
          +'<input type="checkbox" class="pvfServiceCheck" value="'+s.id+'" onchange="updateSvcSelection(\'pvfServiceCheck\', \'pvfSelectedChips\', \'pvfSvcCountBadge\', this)" '+(isSel?'checked':'')+'>'
          +'<span style="font-size:16px">'+s.icon+'</span>'
          +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(s.name)+'</span>'
          +'<span style="font-size:10.5px;color:var(--muted)">'+priceRange(s)+'</span>'
          +'</label>';
      }).join('')
      +'</div>'
      +'<div style="margin-top:10px;text-align:left"><button type="button" class="btn btn-primary btn-sm" onclick="toggleSvcDrawer(\'pvfSvcDrawer\')">✓ تم الاختيار</button></div>'
      +'</div></div></div>'
      +'<div class="field"><label>سنوات الخبرة</label><input id="pvfExp" type="number" min="0" value="'+(u.provider.exp||0)+'"></div>'
      +'<div class="field"><label>مناطق الخدمة التي تغطيها (اختر أو أضف منطقتك)</label>'
      +'<div class="area-add-box">'
      +'<input id="pvfNewAreaInput" class="area-add-input" placeholder="اكتب اسم منطقة أو حي إضافي بالناصرية واضغط إضافة..." onkeydown="if(event.key===\'Enter\'){event.preventDefault();addCustomAreaTag(\'pvfAreaCloud\',\'pvfNewAreaInput\',\'pvfArea\');}">'
      +'<button type="button" class="btn btn-outline btn-sm" onclick="addCustomAreaTag(\'pvfAreaCloud\',\'pvfNewAreaInput\',\'pvfArea\')">➕ إضافة منطقة</button>'
      +'</div>'
      +'<div class="area-cloud" id="pvfAreaCloud">'
      +'<label class="area-tag '+(u.provider.areas.includes('كل الناصرية')?'active':'')+'" style="display:flex;align-items:center;gap:6px">'
      +'<input type="checkbox" class="pvfArea" value="كل الناصرية" '+(u.provider.areas.includes('كل الناصرية')?'checked':'')+' onchange="this.parentElement.classList.toggle(\'active\', this.checked)"> كل الناصرية</label>'
      +areasList.map(a=>'<label class="area-tag '+(u.provider.areas.includes(a)?'active':'')+'" style="display:flex;align-items:center;gap:6px">'
      +'<input type="checkbox" class="pvfArea" value="'+a+'" '+(u.provider.areas.includes(a)?'checked':'')+' onchange="this.parentElement.classList.toggle(\'active\', this.checked)"> '+a+'</label>').join('')
      +(u.provider.areas.filter(a => a !== 'كل الناصرية' && !areasList.includes(a)).map(a => '<label class="area-tag active" style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="pvfArea" value="'+esc(a)+'" checked onchange="this.parentElement.classList.toggle(\'active\', this.checked)"> '+esc(a)+'</label>').join(''))
      +'</div></div>'
      +'<button class="btn btn-primary btn-sm" onclick="saveProviderProfile()">✓ حفظ التعديلات</button>'
      +'<div class="hint" style="font-size:12px;color:var(--faint);margin-top:10px">تغيير الخدمات قد يعيد حسابك لقائمة التوثيق إذا اخترت خدمة حساسة.</div></div>'
      +'<div class="card" style="margin-top:16px"><h4 style="font-size:17px;font-weight:900;margin-bottom:18px">🔑 تغيير كلمة المرور</h4>'
      +'<div class="grid grid-2" style="gap:12px">'
      +'<div class="field"><label>كلمة المرور الحالية</label><input id="pwOld" type="password" placeholder="••••••••"></div>'
      +'<div class="field"><label>الجديدة (6+ أحرف)</label><input id="pwNew" type="password" placeholder="••••••••"></div>'
      +'</div><button class="btn btn-outline btn-sm" onclick="changePass()">تغيير كلمة المرور</button></div>'
      +'<div class="card" style="margin-top:16px;border:1.5px solid rgba(220,38,38,.3);background:rgba(220,38,38,.02)"><h4 style="font-size:16px;font-weight:900;color:var(--danger);margin-bottom:8px">🚨 منطقة الخطر — إدارة الحساب</h4><p style="font-size:13.5px;color:var(--muted);margin-bottom:14px">عند حذف الحساب، سيتم إزالة ملفك وسجلاتك نهائياً من المنصة.</p><button class="btn btn-danger btn-sm" onclick="askDeleteAccount()">🗑️ طلب حذف الحساب نهائياً</button></div>';
  }

  const svcsTitle = allMySvcs.length > 1
    ? allMySvcs.map(x=>x.icon+' '+x.name).join(' · ')
    : (s ? s.icon+' '+s.name : 'خدمة');

  const multiBadge = allMySvcs.length > 1
    ? `<span class="chip chip-dark" style="font-size:11px;padding:3px 9px;margin-top:4px">🧰 متعدد الخدمات (${allMySvcs.length} مهن)</span>`
    : '';

  const debtNow = u.provider.debt||0;
  $('providerRoot').innerHTML=`
  <div class="page-head"><h1>🧑‍🔧 لوحة <span class="hl">مقدم الخدمة</span></h1><p>استقبل الطلبات المطابقة لمهنك (${myServiceIds.length} مهن)، أنجزها، وتابع ذمتك وأرباحك.</p></div>
  ${banner}
  <div class="panel">
    <aside class="pside">
      <div class="avatar">${initials(u.name)}</div>
      <h3>${esc(u.name)}</h3>
      <div class="role">${svcsTitle} · ${u.provider.exp||0} سنوات خبرة</div>
      <div class="chips">
        ${verified?'<span class="stamp">✓ موثّق</span>':pendingV?'<span class="chip chip-amber">⏳ قيد التوثيق</span>':'<span class="chip chip-red">🚫 مرفوض</span>'}
        ${multiBadge}
        <span class="chip chip-gray">${stars(provRating(u)||0)} ${provRatingTxt(u)}</span>
        <span class="chip chip-gray">${u.provider.jobs||0} طلب مكتمل</span>
        ${u.provider.avgResponseMin?'<span class="chip chip-gray">⚡ استجابة ~'+u.provider.avgResponseMin+' د</span>':''}
      </div>
      <div class="switch"><b>متاح لاستقبال الطلبات</b><button class="toggle ${u.provider.avail?'on':''}" onclick="toggleAvail()" ${verified?'':'disabled'} aria-label="التوفر"></button></div>
      <button class="btn btn-ghost btn-sm btn-block" onclick="go('#/support')">🎧 تواصل مع الإدارة</button>
    </aside>
    <div>
      <div class="stat-cards">
        <div class="stat-card"><b>${incoming.length}</b><span>طلب وارد</span></div>
        <div class="stat-card"><b>${active.length}</b><span>طلب جاري</span></div>
        <div class="stat-card"><b style="color:${debtNow>0?'var(--danger)':'var(--ok)'}">${fmt(debtNow)}</b><span>د.ع ذمتك للمنصة</span></div>
        <div class="stat-card"><b>${provRatingTxt(u)}</b><span>تقييمك (${u.provider.ratingCount||0})</span></div>
      </div>
      <div class="ptabs">
        <button class="ptab ${tab==='incoming'?'active':''}" onclick="go('#/provider/incoming')">📥 الوارد (${incoming.length})</button>
        <button class="ptab ${tab==='active'?'active':''}" onclick="go('#/provider/active')">🔨 الجارية (${active.length})</button>
        <button class="ptab ${tab==='earnings'?'active':''}" onclick="go('#/provider/earnings')">⚖️ الذمة والماليات</button>
        <button class="ptab ${tab==='reviews'?'active':''}" onclick="go('#/provider/reviews')">⭐ التقييمات (${reviews.length})</button>
        <button class="ptab ${tab==='history'?'active':''}" onclick="go('#/provider/history')">📦 سجل الطلبات (${allMyOrders.length})</button>
        <button class="ptab ${tab==='profile'?'active':''}" onclick="go('#/provider/profile')">👤 ملفي والإعدادات</button>
      </div>
      ${content}
    </div>
  </div>`;
  };

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
