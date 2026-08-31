/**
 * منصة مدللني mdllni Platform - الناصرية
 * © 2026 جميع الحقوق محفوظة · نظام تشغيل سحابي متكامل ومحمي
 */
(function(){
  'use strict';
  if(typeof window !== 'undefined' && window.console){
    console.log('%c⛔ تحذير أمني لمنصة مدللني mdllni Platform', 'color:#BE3A2B;font-size:20px;font-weight:900;');
    console.log('%cهذه البيئة مراقبة ومحمية. يُمنع تنفيذ أي أوامر غير مصرح بها داخل وحدة التحكم.', 'font-size:13px;color:#68685F;');
  }
})();

/* ---------- 1) أدوات أساسية ---------- */
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmt(n){ return Number(n||0).toLocaleString('en-US'); }
function hash(s){ let h1=0xdeadbeef, h2=0x41c6ce57; for(let i=0;i<s.length;i++){ const ch=s.charCodeAt(i); h1=Math.imul(h1^ch,2654435761); h2=Math.imul(h2^ch,1597334677); } h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909); h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909); return (4294967296*(2097151&h2)+(h1>>>0)).toString(16); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2800); }
function modal(html){ $('modalBox').innerHTML=html; $('modalBg').classList.add('show'); }
function closeModal(){ $('modalBg').classList.remove('show'); }
function go(h){
  if(location.hash === h){ render(); }
  else { location.hash = h; }
}
function fmtD(ts){ return new Date(ts).toLocaleDateString('ar-IQ-u-nu-latn',{day:'numeric',month:'short'}); }
function fmtDT(ts){ const d=new Date(ts); return d.toLocaleDateString('ar-IQ-u-nu-latn',{day:'numeric',month:'short'})+' · '+d.toLocaleTimeString('ar-IQ-u-nu-latn',{hour:'2-digit',minute:'2-digit'}); }
function timeAgo(ts){ const s=Math.floor((Date.now()-ts)/1000); if(s<60) return 'الآن'; const m=Math.floor(s/60); if(m<60) return 'منذ '+m+' دقيقة'; const h=Math.floor(m/60); if(h<24) return 'منذ '+h+' ساعة'; const d=Math.floor(h/24); if(d<30) return 'منذ '+d+' يوم'; return fmtD(ts); }
function stars(r){ const f=Math.round(r||0); return '★'.repeat(f)+'☆'.repeat(5-f); }
function priceRange(s){ return !s ? '—' : (s.min===s.max ? fmt(s.min) : fmt(s.min)+' – '+fmt(s.max)); }
function midPrice(s){ return !s ? 10000 : Math.round(((s.min||0)+(s.max||0))/2); }
function whenText(o){ if(o.when==='now') return 'الآن — بأسرع وقت'; try{ return 'مجدول: '+fmtDT(o.whenTime); }catch(e){ return 'مجدول'; } }
function initials(name){ return esc((name||'؟').trim().charAt(0)); }
function roleName(r){ return r==='admin'?'إدارة':r==='provider'?'مقدم خدمة':'زبون'; }

/* ---------- 2) قاعدة البيانات والتطبيع ---------- */
function normalizePhone(p){
  if(!p) return '';
  var s = String(p)
    .replace(/[٠-٩]/g, function(d){ return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); })
    .replace(/[۰-۹]/g, function(d){ return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); })
    .replace(/[\s\-\(\)\.]/g, '');
  if(s.startsWith('+964')) s = '0' + s.slice(4);
  else if(s.startsWith('00964')) s = '0' + s.slice(5);
  else if(s.startsWith('964')) s = '0' + s.slice(3);
  else if(s.length === 10 && s.startsWith('7')) s = '0' + s;
  return s;
}
function validPhone(p){ return /^07\d{9}$/.test(normalizePhone(p)); }

const DB_KEY='ur5_db';
let DB=null;
function save(){ try{ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }catch(e){ toast('⚠️ مساحة التخزين ممتلئة'); } }
function loadDB(){
  try{
    const v=localStorage.getItem(DB_KEY);
    if(v){
      DB=JSON.parse(v);
      if(!DB.settings || !Array.isArray(DB.settings.areas) || DB.settings.areas.length < 20){
        if(!DB.settings) DB.settings = { commission:{ first:18, standard:15, loyal:13, elite:10, delivery:10 }, loyalAt:11, eliteAt:31, minPayout:10000 };
        DB.settings.areas = DEF_AREAS.slice();
      }
      return;
    }
  }catch(e){}
  seed();
}
function resetDB(){ localStorage.removeItem(DB_KEY); seed(); }

const DEF_CATS=[
  { id:'cars',    name:'سيارات',          icon:'🚗' },
  { id:'home',    name:'صيانة منزلية',    icon:'🔧' },
  { id:'clean',   name:'نظافة',           icon:'🧹' },
  { id:'beauty',  name:'عناية وتجميل',    icon:'💇' },
  { id:'care',    name:'رعاية وتعليم',    icon:'👶' },
  { id:'events',  name:'مناسبات وسياحة',  icon:'🎉' },
  { id:'digital', name:'تقنية وشبكات',    icon:'📡' },
  { id:'other',   name:'توصيل وأخرى',     icon:'🛒' }
];
const DEF_SERVICES=[
  { id:'s1',  icon:'🚗', name:'غسيل سيارات متنقل',        cat:'cars',    min:12000,  max:17000,  unit:'غسلة',  popular:true,  wave:1, active:true, desc:'غسيل خارجي وداخلي عند باب دارك' },
  { id:'s2',  icon:'❄️', name:'صيانة تكييف وتبريد',       cat:'home',    min:20000,  max:85000,  unit:'زيارة', popular:true,  wave:1, active:true, desc:'تنظيف، تعبئة غاز، إصلاح أعطال' },
  { id:'s3',  icon:'🚿', name:'سباكة منزلية',             cat:'home',    min:22000,  max:60000,  unit:'زيارة', popular:true,  wave:1, active:true, desc:'تسريبات، مواسير، سخانات' },
  { id:'s4',  icon:'💡', name:'كهرباء منزلية',            cat:'home',    min:22000,  max:60000,  unit:'زيارة', popular:false, wave:1, active:true, desc:'أعطال كهربائية، توصيلات، لوحات' },
  { id:'s5',  icon:'💇', name:'كوافيرة منزلية (سيدات)',   cat:'beauty',  min:50000,  max:300000, unit:'جلسة',  popular:true,  wave:1, active:true, desc:'قص، صبغ، تسريحات بخصوصية تامة' },
  { id:'s6',  icon:'⚡', name:'صيانة مولدات كهرباء',      cat:'home',    min:15000,  max:350000, unit:'زيارة', popular:true,  wave:1, active:true, desc:'أعطال مولدة البيت — خدمة نادرة بالعراق' },
  { id:'s7',  icon:'💧', name:'تنظيف خزانات مياه',        cat:'clean',   min:25000,  max:35000,  unit:'خزان',  popular:false, wave:1, active:true, desc:'تنظيف وتعقيم دوري — ضرورة صحية' },
  { id:'s8',  icon:'🧺', name:'صيانة غسالات وثلاجات',     cat:'home',    min:20000,  max:60000,  unit:'زيارة', popular:false, wave:2, active:true, desc:'إصلاح أعطال الأجهزة المنزلية' },
  { id:'s9',  icon:'🪚', name:'نجارة منزلية',             cat:'home',    min:25000,  max:100000, unit:'مهمة',  popular:false, wave:2, active:true, desc:'أبواب، خزائن، تصليحات خشبية' },
  { id:'s10', icon:'🎨', name:'دهان وديكور',              cat:'home',    min:30000,  max:150000, unit:'مهمة',  popular:false, wave:2, active:true, desc:'دهان جدران وأسقف' },
  { id:'s11', icon:'📹', name:'تركيب ستالايت وكاميرات',   cat:'digital', min:25000,  max:80000,  unit:'تركيب', popular:false, wave:2, active:true, desc:'ستالايت، كاميرات مراقبة، جرس ذكي' },
  { id:'s12', icon:'📱', name:'صيانة موبايلات منزلية',    cat:'digital', min:15000,  max:60000,  unit:'إصلاح', popular:false, wave:2, active:true, desc:'شاشات، بطاريات، أعطال برمجية' },
  { id:'s13', icon:'🏠', name:'تنظيف منازل',              cat:'clean',   min:30000,  max:80000,  unit:'جلسة',  popular:false, wave:2, active:true, desc:'تنظيف شامل أو دوري' },
  { id:'s14', icon:'🧶', name:'غسيل سجاد منزلي',          cat:'clean',   min:20000,  max:50000,  unit:'قطعة',  popular:false, wave:2, active:true, desc:'غسيل وتجفيف عند البيت' },
  { id:'s15', icon:'🪳', name:'مكافحة حشرات',             cat:'clean',   min:30000,  max:70000,  unit:'جلسة',  popular:false, wave:2, active:true, desc:'رش وتعقيم آمن' },
  { id:'s16', icon:'🔩', name:'ميكانيكي سيارات متنقل',    cat:'cars',    min:25000,  max:120000, unit:'زيارة', popular:false, wave:2, active:true, desc:'أعطال ميكانيكية عند موقعك' },
  { id:'s17', icon:'🔋', name:'كهربائي سيارات متنقل',     cat:'cars',    min:20000,  max:80000,  unit:'زيارة', popular:false, wave:2, active:true, desc:'كهرباء السيارة، بطاريات، دينمو' },
  { id:'s18', icon:'🛢️', name:'تبديل زيت بالبيت',         cat:'cars',    min:15000,  max:30000,  unit:'خدمة',  popular:false, wave:2, active:true, desc:'تبديل زيت وفلاتر عند بابك' },
  { id:'s19', icon:'🛞', name:'بنشر متنقل',               cat:'cars',    min:10000,  max:25000,  unit:'إطار',  popular:false, wave:2, active:true, desc:'تصليح أو تبديل إطارات بالطريق' },
  { id:'s20', icon:'👶', name:'حاضنة أطفال',              cat:'care',    min:150000, max:400000, unit:'شهر',   popular:false, wave:2, active:true, sensitive:true, desc:'بروتوكول توثيق صارم + مقابلة' },
  { id:'s21', icon:'👵', name:'جليسة مسنين',              cat:'care',    min:100000, max:250000, unit:'شهر',   popular:false, wave:2, active:true, sensitive:true, desc:'رعاية منزلية ببروتوكول صارم' },
  { id:'s22', icon:'📚', name:'مدرس خصوصي',               cat:'care',    min:20000,  max:50000,  unit:'ساعة',  popular:false, wave:2, active:true, desc:'دروس منزلية لجميع المراحل' },
  { id:'s23', icon:'💈', name:'حلاق منزل',                cat:'beauty',  min:10000,  max:25000,  unit:'جلسة',  popular:false, wave:2, active:true, desc:'قص وحلاقة عند البيت' },
  { id:'s24', icon:'☕', name:'قهوجي وضيافة مناسبات',     cat:'events',  min:10000,  max:300000, unit:'مناسبة',popular:false, wave:3, active:true, gold:true, desc:'عزائم وأعراس — خدمة ذهبية' },
  { id:'s25', icon:'👨‍🍳', name:'طباخ ولائم منزلية',        cat:'events',  min:150000, max:500000, unit:'وليمة', popular:false, wave:3, active:true, gold:true, desc:'طبخ ولائم المناسبات' },
  { id:'s26', icon:'🛶', name:'مرشد سياحي: الأهوار', cat:'events',  min:50000,  max:150000, unit:'جولة',  popular:false, wave:3, active:true, gold:true, desc:'جولات سياحية في الأهوار' },
  { id:'s27', icon:'🛒', name:'مندوب تسوق من الأسواق',    cat:'other',   min:10000,  max:25000,  unit:'مهمة',  popular:false, wave:3, active:true, desc:'جيب لي من سوق الناصرية' },
  { id:'s28', icon:'🧵', name:'خياطة منزلية (سيدات)',     cat:'beauty',  min:15000,  max:50000,  unit:'قطعة',  popular:false, wave:3, active:true, desc:'تفصيل وتعديل بخصوصية' },
  { id:'s29', icon:'💪', name:'مدرب رياضي شخصي',          cat:'care',    min:25000,  max:60000,  unit:'جلسة',  popular:false, wave:3, active:true, desc:'تدريب منزلي حسب هدفك' },
  { id:'s30', icon:'📡', name:'فني شبكات وإنترنت',        cat:'digital', min:15000,  max:50000,  unit:'زيارة', popular:false, wave:3, active:true, desc:'راوترات، تقوية تغطية، أعطال' }
];
const DEF_AREAS=[
  'الحبوبي / المركز', 'شارع 40', 'الإدارة المحلية', 'الحي العسكري',
  'حي المعلمين', 'حي أريدو', 'حي الحسين', 'حي الزهراء', 'حي سومر',
  'حي الشموخ', 'حي القادسية', 'حي التضحية', 'حي الفداء', 'حي الثورة',
  'صوب الشامية', 'صوب الجزيرة', 'الصالحية', 'المنصورية', 'الإسكان', 'الحي الصناعي'
];

const STATUSES=[
  { key:'pending',  label:'قيد الانتظار', icon:'⏳' },
  { key:'accepted', label:'تم القبول',    icon:'✅' },
  { key:'enroute',  label:'بالطريق',      icon:'🚙' },
  { key:'started',  label:'بدأ الخدمة',   icon:'🔨' },
  { key:'done',     label:'مكتمل',        icon:'🎉' }
];
const STATUS_ORDER=['pending','accepted','enroute','started','done'];
function stInfo(k){ return STATUSES.find(s=>s.key===k)||{key:k,label:k,icon:'•'}; }

function seed(){
  const now=Date.now();
  DB={
    meta:{ orderSeq:1042, userSeq:2, noteSeq:1, msgSeq:1, ticketSeq:1, payoutSeq:1, seededAt:now },
    settings:{
      commission:{ first:18, standard:15, loyal:13, elite:10, delivery:10 },
      loyalAt:11, eliteAt:31, minPayout:10000,
      areas:DEF_AREAS.slice()
    },
    cats:DEF_CATS.slice(),
    services:JSON.parse(JSON.stringify(DEF_SERVICES)),
    users:[{
      id:'u1', role:'admin', name:'إدارة مدللني', phone:'07800000000',
      pass:hash('ur-admin-2026'), area:'الناصرية', createdAt:now, status:'active'
    }],
    session:null,
    orders:[], messages:[], notes:[], tickets:[], payouts:[], audit:[]
  };
  save();
}

/* ---------- 3) وصولات البيانات ---------- */
function svc(id){
  return (DB && DB.services && DB.services.find(s=>s.id===id)) || {
    id: id || 's1', icon: '🧰', name: 'خدمة مدللني', cat: 'other',
    min: 10000, max: 50000, unit: 'خدمة', desc: '', active: true
  };
}
function catOf(id){ return (DB && DB.cats && DB.cats.find(c=>c.id===id)) || { name: 'أخرى', icon: '🛒' }; }
function userById(id){ return (DB && DB.users && DB.users.find(u=>u.id===id)) || null; }
function orderById(id){ return (DB && DB.orders && DB.orders.find(o=>o.id===id)) || null; }
function me(){
  const s = DB && DB.session;
  if (!s || !s.userId) return null;
  const u = userById(s.userId);
  if (!u || u.status !== 'active') {
    if (DB) DB.session = null;
    save();
    return null;
  }
  return u;
}
function isProvider(u){ return u && u.role==='provider'; }
function isVerifiedProv(u){ return isProvider(u) && u.provider && u.provider.verified==='verified'; }
function provRating(u){ if(!u||!u.provider||!u.provider.ratingCount) return null; return u.provider.ratingSum/u.provider.ratingCount; }
function provRatingTxt(u){ const r=provRating(u); return r==null?'جديد':(Math.round(r*10)/10)+''; }
function activeServices(){ return (DB && DB.services ? DB.services : DEF_SERVICES).filter(s=>s.active!==false); }
function providersFor(serviceId, area){
  if(!DB || !Array.isArray(DB.users)) return [];
  return DB.users.filter(u=>{
    if(!isVerifiedProv(u)||!u.provider.avail||u.status!=='active') return false;
    if(u.provider.serviceId!==serviceId) return false;
    if(!area) return true;
    const areas = Array.isArray(u.provider.areas) ? u.provider.areas : [];
    return areas.includes('كل الناصرية')||areas.includes(area);
  });
}
function providersCount(serviceId){
  if(!DB || !Array.isArray(DB.users)) return 0;
  return DB.users.filter(u=>isProvider(u)&&u.provider&&u.provider.serviceId===serviceId&&u.provider.verified==='verified').length;
}
function orderPrice(o){ return !o ? 0 : (o.finalPrice!=null?o.finalPrice:(o.estimate||0)); }
function monthDoneOrders(u){
  if(!u || !DB || !Array.isArray(DB.orders)) return 0;
  const d=new Date(); const m=d.getMonth(), y=d.getFullYear();
  return DB.orders.filter(o=>o && o.providerId===u.id&&o.status==='done'&&(()=>{const t=new Date(o.doneAt||o.createdAt);return t.getMonth()===m&&t.getFullYear()===y;})()).length;
}
function commissionRateFor(prov, order){
  const c=(DB && DB.settings && DB.settings.commission) || { first:18, standard:15, loyal:13, elite:10, delivery:10 };
  const s=order ? svc(order.serviceId) : null;
  if(s&&s.cat==='other') return c.delivery;
  if(!prov || !order || !DB || !Array.isArray(DB.orders)) return c.standard;
  const withCustomer=DB.orders.filter(o=>o && o.providerId===prov.id&&o.customerId===order.customerId&&o.status==='done').length;
  if(withCustomer===0) return c.first;
  const month=monthDoneOrders(prov);
  const thresh=(DB && DB.settings) || { loyalAt:11, eliteAt:31 };
  if(month>=thresh.eliteAt) return c.elite;
  if(month>=thresh.loyalAt) return c.loyal;
  return c.standard;
}
function earningsOf(o){
  const c=(DB && DB.settings && DB.settings.commission) || { standard:15 };
  const rate=(o && o.commissionRate!=null ? o.commissionRate : c.standard);
  const price=orderPrice(o);
  const commission=Math.round(price*rate/100);
  return { rate, commission, net:Math.max(0, price-commission) };
}
function platformRevenue(){
  if(!DB || !Array.isArray(DB.orders)) return 0;
  return DB.orders.filter(o=>o && o.status==='done').reduce((sum,o)=>sum+earningsOf(o).commission,0);
}
function gmv(){
  if(!DB || !Array.isArray(DB.orders)) return 0;
  return DB.orders.filter(o=>o && o.status==='done').reduce((sum,o)=>sum+orderPrice(o),0);
}

/* ---------- 4) الإشعارات ---------- */
function notify(userId, icon, text, orderId){
  DB.notes.unshift({ id:'n'+(DB.meta.noteSeq++), userId, icon, text, orderId:orderId||null, at:Date.now(), read:false });
  if(DB.notes.length>200) DB.notes.length=200;
  save();
}
function notifyAdmins(icon, text, orderId){ DB.users.filter(u=>u.role==='admin').forEach(a=>notify(a.id,icon,text,orderId)); }
function myNotes(){ const u=me(); if(!u) return []; return DB.notes.filter(n=>n.userId===u.id); }
function unreadCount(){ return myNotes().filter(n=>!n.read).length; }
function markAllRead(){ const u=me(); if(!u) return; DB.notes.forEach(n=>{ if(n.userId===u.id) n.read=true; }); save(); renderHeader(); }

/* ---------- 5) المصادقة والجلسات ---------- */
function validPhone(p){ return /^07\d{9}$/.test(String(p||'').replace(/\s/g,'')); }
function doRegister(){
  const name=$('rgName').value.trim();
  const phone=$('rgPhone').value.replace(/\s/g,'');
  const pass=$('rgPass').value;
  const pass2=$('rgPass2').value;
  const area=$('rgArea').value;
  const role=window._regRole||'customer';
  if(name.length<2){ toast('✍️ اكتب اسمك الكامل'); return; }
  if(!validPhone(phone)){ toast('📱 رقم الهاتف لازم يكون 11 رقم ويبدأ بـ 07'); return; }
  if(DB.users.some(u=>u.phone===phone)){ toast('⚠️ هذا الرقم مسجّل — سجّل دخولك'); return; }
  if(pass.length<6){ toast('🔑 كلمة المرور 6 أحرف على الأقل'); return; }
  if(pass!==pass2){ toast('⚠️ كلمتا المرور غير متطابقتين'); return; }
  if(!area){ toast('📍 اختر منطقتك'); return; }
  const u={ id:'u'+(DB.meta.userSeq++), role, name, phone, pass:hash(pass), area, createdAt:Date.now(), status:'active' };
  if(role==='provider'){
    const serviceId=$('rgService').value;
    const exp=Math.max(0, parseInt($('rgExp').value)||0);
    const areas=Array.from(document.querySelectorAll('.rgArea2:checked')).map(c=>c.value);
    if(!serviceId){ toast('🧰 اختر خدمتك الرئيسية'); return; }
    if(!areas.length){ toast('📍 اختر منطقة خدمة واحدة على الأقل'); return; }
    const s=svc(serviceId);
    u.provider={ serviceId, exp, areas, verified:'pending', avail:true, ratingSum:0, ratingCount:0, jobs:0, balance:0, settled:0, sensitive:!!(s&&s.sensitive) };
  }
  DB.users.push(u);
  DB.session={ userId:u.id, at:Date.now() };
  save();
  if(role==='provider'){ notifyAdmins('🛡️','طلب توثيق جديد: '+u.name+' — '+svc(u.provider.serviceId).name,null); audit('system','تسجيل مقدم خدمة جديد: '+u.name); }
  toast('🎉 أهلاً بك في مدللني يا '+u.name.split(' ')[0]);
  let next=window._authNext;
  window._authNext=null;
  if(next && next.indexOf('#/auth') === 0) next = null;
  go(next || '#/home');
}
function doLogin(){
  const phone=$('lgPhone').value.replace(/\s/g,'');
  const pass=$('lgPass').value;
  const u=DB.users.find(x=>x.phone===phone);
  if(!u){ toast('⚠️ هذا الرقم غير مسجّل'); return; }
  if(u.pass!==hash(pass)){ toast('⚠️ كلمة المرور غير صحيحة'); return; }
  if(u.status!=='active'){ toast('🚫 حسابك موقوف — راجع الإدارة'); return; }
  DB.session={ userId:u.id, at:Date.now() }; save();
  toast('👋 رجعت يا '+u.name.split(' ')[0]);
  let next=window._authNext; window._authNext=null;
  if(next && next.indexOf('#/auth') === 0) next = null;
  go(next || (u.role==='admin'?'#/admin':'#/home'));
}
function logout(){ DB.session=null; save(); toast('👋 تم تسجيل الخروج'); go('#/home'); }
function requireAuth(next){
  const u=me();
  if(u) return u;
  window._authNext=next||('#/'+currentRoute().name);
  go('#/auth/login');
  return null;
}
function audit(who, action){ DB.audit.unshift({ at:Date.now(), who, action }); if(DB.audit.length>300) DB.audit.length=300; save(); }

/* ---------- 6) الموجّه والحُرّاس ---------- */
const ROUTES={ home:'v-home', services:'v-services', how:'v-how', pricing:'v-pricing', auth:'v-auth', book:'v-book', order:'v-order', account:'v-account', provider:'v-provider', admin:'v-admin', support:'v-support' };
function currentRoute(){
  const h=location.hash||'#/home';
  const parts=h.replace(/^#\//,'').split('/');
  return { name:parts[0]||'home', param:parts[1]?decodeURIComponent(parts[1]):null };
}
function render(){
  const {name,param}=currentRoute();
  const u=me();
  // حُرّاس الصفحات المحمية
  if(name==='auth'&&u){ go('#/home'); return; }
  if(name==='account'&&(!u||u.role!=='customer')){ if(u&&u.role==='provider'){ go('#/provider'); return; } if(u&&u.role==='admin'){ go('#/admin'); return; } window._authNext='#/account'; go('#/auth/login'); return; }
  if(name==='provider'&&(!u||u.role!=='provider')){ if(u&&u.role==='customer'){ go('#/account'); return; } if(u&&u.role==='admin'){ go('#/admin'); return; } window._authNext='#/provider'; go('#/auth/register'); return; }
  if(name==='admin'&&(!u||u.role!=='admin')){ window._authNext='#/admin'; go('#/auth/login'); return; }
  if(name==='book'&&!u){ window._authNext=location.hash||'#/book'; go('#/auth/login'); return; }

  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const id=ROUTES[name]||'v-home';
  $(id).classList.add('active');
  renderHeader(name);
  $('notifPanel').classList.remove('open');
  window.scrollTo({top:0,behavior:'instant'});

  if(name==='home') renderHome();
  else if(name==='services') renderServices();
  else if(name==='how') renderHow();
  else if(name==='pricing') renderPricing();
  else if(name==='auth') renderAuth(param||'login');
  else if(name==='book') renderBook(param);
  else if(name==='order') renderOrder(param);
  else if(name==='account') renderAccount(param);
  else if(name==='provider') renderProvider(param);
  else if(name==='admin') renderAdmin(param);
  else if(name==='support') renderSupport(param);
  else renderHome();
}
window.addEventListener('hashchange', render);

/* ---------- 7) الهيدر الديناميكي ---------- */
function renderHeader(activeName){
  const u=me();
  const links=[ ['home','الرئيسية'], ['services','الخدمات'], ['how','كيف تعمل'], ['pricing','العمولة'] ];
  if(u&&u.role==='customer'){ links.push(['account','📋 لوحة الزبون']); }
  if(u&&u.role==='provider'){ links.push(['provider','🧑‍🔧 لوحة مقدم الخدمة']); }
  if(u&&u.role==='admin'){ links.push(['admin','🛡️ لوحة الإدارة']); }
  $('navLinks').innerHTML=links.map(l=>'<a data-nav="'+l[0]+'" class="'+(activeName===l[0]?'active':'')+'" onclick="go(\'#/'+l[0]+'\')">'+l[1]+'</a>').join('');

  let acts='';
  if(u){
    const uc=unreadCount();
    acts+='<button class="bell-btn" onclick="toggleNotifs(event)" aria-label="الإشعارات">🔔'+(uc?'<span class="bell-badge">'+uc+'</span>':'')+'</button>';
    acts+='<div class="user-chip" onclick="go(\'#/'+(u.role==='admin'?'admin':u.role==='provider'?'provider':'account')+'\')"><div class="avatar">'+initials(u.name)+'</div><div><b>'+esc(u.name.split(' ')[0])+'</b><span>'+roleName(u.role)+'</span></div></div>';
    acts+='<button class="btn btn-ghost btn-sm" onclick="logout()">خروج</button>';
  } else {
    acts+='<button class="btn btn-ghost btn-sm" onclick="go(\'#/auth/login\')">دخول</button>';
    acts+='<button class="btn btn-primary btn-sm" onclick="go(\'#/auth/register\')">ابدأ الآن</button>';
  }
  acts+='<button class="menu-btn" id="menuBtn" aria-label="القائمة" onclick="document.getElementById(\'navLinks\').classList.toggle(\'open\')">☰</button>';
  $('navActions').innerHTML=acts;
}
function toggleNotifs(e){
  e.stopPropagation();
  const p=$('notifPanel');
  if(p.classList.contains('open')){ p.classList.remove('open'); return; }
  renderNotifs();
  p.classList.add('open');
}
document.addEventListener('click', function(e){ const p=$('notifPanel'); if(p.classList.contains('open')&&!p.contains(e.target)) p.classList.remove('open'); });
function renderNotifs(){
  const u=me(); if(!u) return;
  const notes=myNotes();
  let html='<div class="notif-head"><span>🔔 الإشعارات</span>'+(notes.length?'<button onclick="markAllRead();renderNotifs()">تعيين الكل كمقروء</button>':'')+'</div>';
  if(!notes.length){ html+='<div class="notif-empty">📭 ماكو إشعارات بعد</div>'; }
  else{
    html+='<div class="notif-list">'+notes.slice(0,30).map(n=>'<div class="notif-item '+(n.read?'':'unread')+'" onclick="openNotif(\''+n.id+'\')"><div class="ni">'+n.icon+'</div><div><p>'+esc(n.text)+'</p><time>'+timeAgo(n.at)+'</time></div></div>').join('')+'</div>';
  }
  $('notifPanel').innerHTML=html;
}
function openNotif(id){
  const n=DB.notes.find(x=>x.id===id);
  if(n){ n.read=true; save(); }
  $('notifPanel').classList.remove('open');
  if(n&&n.orderId){ go('#/order/'+n.orderId); }
  renderHeader(currentRoute().name);
}

/* ---------- 8) الرئيسية ---------- */
function zigSVG(){
  return '<svg viewBox="0 0 360 268" width="100%" style="display:block" role="img" aria-label="الناصرية">'
  +'<defs>'
  +'<linearGradient id="zFace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A382F"/><stop offset="1" stop-color="#12120F"/></linearGradient>'
  +'<linearGradient id="zTop" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6B6553"/><stop offset="1" stop-color="#403C33"/></linearGradient>'
  +'<linearGradient id="zSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9A227" stop-opacity=".55"/><stop offset="1" stop-color="#B08A3E" stop-opacity=".12"/></linearGradient>'
  +'<radialGradient id="zHalo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#B08A3E" stop-opacity=".30"/><stop offset="1" stop-color="#B08A3E" stop-opacity="0"/></radialGradient>'
  +'</defs>'
  +'<circle cx="286" cy="52" r="46" fill="url(#zHalo)"/>'
  +'<circle cx="286" cy="52" r="23" fill="url(#zSun)" stroke="#B08A3E" stroke-opacity=".45" stroke-width="1.2"/>'
  +'<ellipse cx="180" cy="249" rx="150" ry="9" fill="#0E0E0D" opacity=".08"/>'
  // tier 1 (base)
  +'<path d="M34 240 h292 v-9 l-14 -8 H48 l-14 8 z" fill="url(#zFace)"/>'
  +'<path d="M48 223 h264 l-10 -6 H58 z" fill="url(#zTop)"/>'
  +'<rect x="34" y="208" width="292" height="24" rx="3" fill="url(#zFace)"/>'
  // tier 2
  +'<path d="M66 208 h228 l-10 -7 H76 z" fill="url(#zTop)"/>'
  +'<rect x="66" y="172" width="228" height="29" rx="3" fill="url(#zFace)"/>'
  // tier 3
  +'<path d="M98 172 h164 l-10 -7 H108 z" fill="url(#zTop)"/>'
  +'<rect x="98" y="137" width="164" height="28" rx="3" fill="url(#zFace)"/>'
  // tier 4
  +'<path d="M130 137 h100 l-9 -7 H139 z" fill="url(#zTop)"/>'
  +'<rect x="130" y="104" width="100" height="26" rx="3" fill="url(#zFace)"/>'
  // shrine
  +'<path d="M152 104 h56 l-7 -6 H159 z" fill="url(#zTop)"/>'
  +'<rect x="152" y="76" width="56" height="22" rx="3" fill="url(#zFace)"/>'
  +'<rect x="172" y="64" width="16" height="12" rx="2" fill="#B08A3E" opacity=".85"/>'
  // grand staircase
  +'<path d="M174 240 L174 76 L186 76 L186 240 z" fill="#0A0A09" opacity=".55"/>'
  +'<path d="M175 232 h10 M175 220 h10 M175 208 h10 M175 196 h10 M175 184 h10 M175 172 h10 M175 160 h10 M175 148 h10 M175 136 h10 M175 124 h10 M175 112 h10 M175 100 h10 M175 88 h10" stroke="#C9A227" stroke-opacity=".55" stroke-width="1.6"/>'
  // brickwork texture lines
  +'<path d="M34 220 h292 M66 190 h228 M98 154 h164 M130 120 h100" stroke="#fff" stroke-opacity=".10" stroke-width="1"/>'
  // side buttresses
  +'<path d="M52 232 v-20 M78 196 v-18 M110 160 v-16 M142 126 v-14 M218 126 v-14 M250 160 v-16 M282 196 v-18 M308 232 v-20" stroke="#fff" stroke-opacity=".13" stroke-width="2"/>'
  +'</svg>';
}
function renderHome(){
  const u=me();
  const doneOrders=DB.orders.filter(o=>o.status==='done');
  const verifiedProvs=DB.users.filter(x=>isVerifiedProv(x));
  const ratedOrders=doneOrders.filter(o=>o.review);
  const avgR=ratedOrders.length? (ratedOrders.reduce((s,o)=>s+o.review.stars,0)/ratedOrders.length) : null;
  const myActive=u? DB.orders.find(o=>o.customerId===u.id && ['pending','accepted','enroute','started'].includes(o.status)) : null;

  // بطاقة الهيرو: حقيقية إذا عندك طلب جاري، وإلا مثال صادق من الكتالوج
  let heroCard='';
  if(myActive){
    const s=svc(myActive.serviceId); const p=myActive.providerId?userById(myActive.providerId):null;
    const idx=STATUS_ORDER.indexOf(myActive.status);
    heroCard=heroCardHtml(myActive, s, p, idx, true);
  } else {
    const s=activeServices().find(x=>x.popular)||activeServices()[0];
    heroCard='<div class="hcard">'
      +'<div class="hcard-head"><h3>هكذا يظهر طلبك</h3><span class="hcard-status st-pending"><span class="dot"></span>مثال حي من الكتالوج</span></div>'
      +'<div class="hcard-svc"><div class="ic">'+s.icon+'</div><div><b>'+s.name+'</b><span>'+s.desc+'</span></div><div class="hcard-price">'+priceRange(s)+' د.ع</div></div>'
      +'<div class="hcard-steps">'
      +'<div class="hstep now"><div class="n">1</div><span>تطلب</span></div>'
      +'<div class="hstep"><div class="n">2</div><span>مقدم يقبل</span></div>'
      +'<div class="hstep"><div class="n">3</div><span>تتابع</span></div>'
      +'<div class="hstep"><div class="n">4</div><span>تقيّم</span></div>'
      +'</div>'
      +'<div class="hcard-prov"><div class="avatar">أ</div><div><b>مقدم خدمة موثّق <span class="stamp">✓ توثيق إدارة مدللني</span></b><span class="sub">أول مقدم متاح بمنطقتك يقبل طلبك — بدون أسماء وهمية</span></div></div>'
      +'</div>';
  }

  const reviews=(DB.stats&&DB.stats.reviews&&DB.stats.reviews.length)?DB.stats.reviews:DB.orders.filter(o=>o.review).sort((a,b)=>b.review.at-a.review.at).slice(0,3);
  const pop=activeServices().filter(s=>s.popular).slice(0,8);

  $('homeRoot').innerHTML=`
  <div class="hero"><div class="container hero-inner">
    <div>
      <span class="kicker"><span class="dot" style="width:8px;height:8px;border-radius:50%;background:var(--ok);display:inline-block;animation:pulse 1.8s infinite"></span> من قلب الحضارة الأولى — أول منصة خدمات في الناصرية</span>
      <h1>أي خدمة تحتاجها…<br><span class="hl">نوصلها لباب دارك</span></h1>
      <p class="sub">غسيل سيارة، مكيف، سباكة، كوافيرة، مولدة… مقدم خدمة موثّق من الإدارة، سعر معلن مسبقاً، وتتابع طلبك خطوة بخطوة — كل شي حقيقي ومسجّل.</p>
      <div class="searchbar">
        <input id="heroSearch" placeholder="شنو تحتاج؟ مثلاً: غسيل سيارة، صيانة مكيف…" onkeydown="if(event.key==='Enter')heroSearchGo()">
        <button class="btn btn-primary btn-sm" onclick="heroSearchGo()">ابحث</button>
      </div>
      <div class="hero-stats">
        <div class="hstat"><b>${activeServices().length}+</b><span>خدمة بالكتالوج</span></div>
        <div class="hstat"><b>${(DB.stats&&DB.stats.verifiedProvs!=null?DB.stats.verifiedProvs:verifiedProvs.length)}</b><span>مقدم موثّق</span></div>
        <div class="hstat"><b>${(DB.stats&&DB.stats.doneOrders!=null?DB.stats.doneOrders:doneOrders.length)}</b><span>طلب مكتمل</span></div>
        <div class="hstat"><b>${(function(){var a=(DB.stats&&DB.stats.avgR!=null)?DB.stats.avgR:avgR;return a?a.toFixed(1)+'★':'—';})()}</b><span>متوسط التقييم</span></div>
      </div>
    </div>
    <div class="heroCard-zone">
      ${heroCard}
      <div class="fchip f1"><div class="ic">🪙</div><div>دفع عند الإنجاز<small>كاش أو محفظة عراقية</small></div></div>
      <div class="fchip f2"><div class="ic">🛡️</div><div>مقدم موثّق<small>يمر بتحقق هوية</small></div></div>
      <div class="fchip f3"><div class="ic">📍</div><div>تتبع لحظي<small>4 مراحل واضحة</small></div></div>
    </div>
  </div></div>

  <div class="section"><div class="container story">
    <div class="story-txt">
      <span class="kicker">قصتنا</span>
      <h2>من أرض <span class="hl">الناصرية</span>… وُلدت منصة مدللني</h2>
      <p>الناصرية مدينة الحضارة الأولى — الناصرية، الأهوار، والنخيل. ومن قلب هذا التاريخ، نعيد بناء الثقة في الخدمات المنزلية.</p>
      <p>ما كان يعتمد على «معارف المعارف» ورقم تلفون ضايع، صار منصة واحدة: مقدم موثّق، سعر معلن، وسجل كامل لكل طلب.</p>
      <div class="story-lines">
        <div class="line"><div class="n">1</div><div><b>هوية محلية أصيلة</b><span>اسم من ذي قار، لفخر ذي قار</span></div></div>
        <div class="line"><div class="n">2</div><div><b>ثقة مبنية بالتوثيق</b><span>كل مقدم يمر بتحقق هوية من الإدارة قبل أول طلب</span></div></div>
        <div class="line"><div class="n">3</div><div><b>شفافية لا تنكسر</b><span>السعر والعمولة واضحين قدامك — ومحسوبين آلياً</span></div></div>
      </div>
    </div>
    <div class="story-visual">
      <div class="zig-wrap">
        ${zigSVG()}
        <div class="zig-tags"><span class="chip chip-gray">الناصرية</span><span class="chip chip-gray">الأهوار</span><span class="chip chip-gray">النخيل</span><span class="chip chip-gray">ذي قار</span></div>
        <div class="zig-cap">الناصرية — مدينتنا ومنصتنا</div>
      </div>
    </div>
  </div></div>

  <div class="section section-alt"><div class="container">
    <div class="sec-head"><span class="kicker">الأكثر طلباً</span><h2>خدمات يطلبها الناصرية <span class="hl">كل يوم</span></h2><p>كلها بأسعار معلنة مسبقاً — تعرف كم تدفع قبل ما توافق.</p></div>
    <div class="grid grid-4">${pop.map(s=>`
      <div class="svc-card" onclick="go('#/book/${s.id}')">
        ${s.wave===3?'<span class="chip chip-dark tag">✨ ذهبية</span>':''}
        <div class="ic">${s.icon}</div><h4>${s.name}</h4>
        <div class="price">${priceRange(s)} د.ع <span style="font-size:12px;color:var(--muted);font-weight:600">/${s.unit}</span></div>
        <div class="meta">${s.desc} · ${providersCount(s.id)} مقدم موثّق</div>
        <button class="btn btn-primary btn-sm book">اطلب الآن</button>
      </div>`).join('')}</div>
    <div style="text-align:center;margin-top:34px"><button class="btn btn-outline" onclick="go('#/services')">شوف كل الخدمات ←</button></div>
  </div></div>

  <div class="section"><div class="container">
    <div class="sec-head"><span class="kicker">شلون تشتغل؟</span><h2>ثلاث خطوات <span class="hl">وطلبك يصير</span></h2></div>
    <div class="steps">
      <div class="step"><div class="num">1</div><h4>اختر الخدمة</h4><p>تصفح الكتالوج، شوف السعر المعلن، وحدد منطقتك والوقت المناسب.</p></div>
      <div class="step"><div class="num">2</div><h4>مقدم موثّق يقبل</h4><p>يوصل طلبك فقط للمقدمين الموثّقين المطابقين لخدمتك ومنطقتك — أول واحد يقبل يتوكل.</p></div>
      <div class="step"><div class="num">3</div><h4>تابع وقيم</h4><p>تتبع الطلب خطوة بخطوة، ادفع السعر المعلن بالضبط، وقيم بعد الإنجاز.</p></div>
    </div>
  </div></div>

  <div class="section section-alt"><div class="container">
    <div class="sec-head"><span class="kicker">ليش مدللني؟</span><h2>ثقة <span class="hl">تبنيها</span>، مو مجرد تطبيق</h2></div>
    <div class="features">
      <div class="feat"><span class="ic">🪪</span><h4>توثيق إداري كامل</h4><p>كل مقدم خدمة يمر بمراجعة من الإدارة قبل ما يشتغل — وحالته ظاهرة لك.</p></div>
      <div class="feat"><span class="ic">💰</span><h4>سعر معلن مسبقاً</h4><p>صفر مفاجآت — السعر الي تشوفه هو الي تدفعه بالضبط.</p></div>
      <div class="feat"><span class="ic">💬</span><h4>تواصل داخلي</h4><p>دردشة مدمجة بكل طلب بينك وبين مقدم الخدمة — محفوظة وموثقة.</p></div>
      <div class="feat"><span class="ic">⭐</span><h4>تقييم حقيقي</h4><p>كل تقييم مربوط بطلب مكتمل فعلياً — ماكو نجوم وهمية.</p></div>
    </div>
  </div></div>

  <div class="section"><div class="container">
    <div class="sec-head"><span class="kicker">شفافية كاملة</span><h2>العمولة؟ <span class="hl">واضحة قدامك</span></h2><p>الزبون يدفع السعر المعلن بالضبط. العمولة من مقدم الخدمة فقط — وتنزل كل ما اشتغل أكثر.</p></div>
    <div style="text-align:center"><button class="btn btn-primary" onclick="go('#/pricing')">شوف نموذج العمولة والحاسبة</button></div>
  </div></div>

  <div class="section section-alt"><div class="container">
    <div class="sec-head"><span class="kicker">آراء حقيقية</span><h2>آخر <span class="hl">التقييمات</span> على المنصة</h2><p>كل رأي هنا مربوط بطلب مكتمل وموثّق بالنظام.</p></div>
    ${reviews.length? '<div class="grid grid-3">'+reviews.map(o=>{ const c=userById(o.customerId); const s=svc(o.serviceId); return `
      <div class="review-card">
        <div class="stars-row">${stars(o.review.stars)}</div>
        <p class="q">"${esc(o.review.text||'خدمة ممتازة')}"</p>
        <div class="who"><div class="avatar">${initials(c?c.name:'ز')}</div><div><b>${esc(c?c.name.split(' ')[0]:'زبون')}</b><span>${s?s.name:''} · ${o.area} · ${fmtD(o.review.at)}</span></div></div>
      </div>`;}).join('')+'</div>'
    : '<div class="empty card"><span class="ic">⭐</span><b>لا توجد تقييمات بعد.</b><br>أول طلب مكتمل ومقيّم سيظهر هنا تلقائياً — بدون آراء مفبركة.<br><button class="btn btn-primary" style="margin-top:16px" onclick="go(\'#/book\')">كن أول من يطلب</button></div>'}
  </div></div>

  ${(!u||u.role==='customer')?`
  <div class="section"><div class="container">
    <div class="sec-head"><span class="kicker">لمقدمي الخدمة</span><h2>عندك مهارة؟ <span class="hl">حولها دخل ثابت</span></h2><p>زبائن يوصلك طلب جاهز لباب بيتك، بدون ما تدور على شغل. عمولة شفافة وتسوية أسبوعية.</p></div>
    <div class="cta-band">
      <div><h3>سجّل كمقدم خدمة <span class="hl">اليوم</span></h3><p>توثيق من الإدارة، طلبات متواصلة، وأرباحك تنعرض لك بشفافية كاملة — مع لوحة تحكم خاصة بك.</p></div>
      <div><button class="btn btn-outline" onclick="go('#/auth/register')">سجّل الآن ←</button></div>
    </div>
  </div></div>`:''}
  `;
}
function heroCardHtml(o, s, p, idx, live){
  return '<div class="hcard">'
    +'<div class="hcard-head"><h3>طلبك الحالي — '+o.id+'</h3><span class="hcard-status '+(o.status==='pending'?'st-pending':'')+'"><span class="dot"></span>'+stInfo(o.status).label+'</span></div>'
    +'<div class="hcard-svc"><div class="ic">'+s.icon+'</div><div><b>'+s.name+'</b><span>'+o.area+' — '+whenText(o)+'</span></div><div class="hcard-price">'+fmt(orderPrice(o))+' د.ع</div></div>'
    +'<div class="hcard-steps">'
    +STATUSES.map((st,i)=>'<div class="hstep '+(i<idx?'done':i===idx?'now':'')+'"><div class="n">'+(i<idx?'✓':(i+1))+'</div><span>'+st.label+'</span></div>').join('')
    +'</div>'
    +'<div class="hcard-prov">'
    +(p? '<div class="avatar">'+initials(p.name)+'</div><div><b>'+esc(p.name)+' '+(isVerifiedProv(p)?'<span class="stamp">✓ موثّق</span>':'')+'</b><span class="sub">'+stars(provRating(p)||0)+' '+provRatingTxt(p)+' · '+(p.provider.jobs||0)+' طلب مكتمل</span></div>'
       : '<div class="avatar">⏳</div><div><b>بانتظار قبول مقدم خدمة</b><span class="sub">طلبك واصل للمقدمين الموثّقين المطابقين</span></div>')
    +'</div>'
    +'<div style="margin-top:16px;text-align:center"><button class="btn btn-primary btn-sm" onclick="go(\'#/order/'+o.id+'\')">تابع الطلب مباشرة ←</button></div>'
    +'</div>';
}
function heroSearchGo(){ const q=$('heroSearch').value.trim(); window._svcQ=q; go('#/services'); if($('svcSearch')){ $('svcSearch').value=q; applyFilters(); } }

/* ---------- 9) الخدمات ---------- */
let activeCat='all';
function renderServices(){
  const areaSel=$('fArea');
  if(areaSel&&areaSel.options.length<=1){ DB.settings.areas.forEach(a=>{ const op=document.createElement('option'); op.textContent=a; areaSel.appendChild(op); }); }
  $('catFilters').innerHTML='<button class="filter '+(activeCat==='all'?'active':'')+'" onclick="setCat(\'all\')">🗂️ كل الخدمات</button>'
    +DB.cats.map(c=>'<button class="filter '+(c.id===activeCat?'active':'')+'" onclick="setCat(\''+c.id+'\')">'+c.icon+' '+c.name+'</button>').join('');
  if(window._svcQ!=null){ $('svcSearch').value=window._svcQ; window._svcQ=null; }
  applyFilters();
}
function applyFilters(){
  const q=($('svcSearch').value||'').toLowerCase();
  const sort=$('svcSort').value;
  const fMin=parseInt($('fMin').value)||0;
  const fMax=parseInt($('fMax').value)||Infinity;
  const fArea=$('fArea').value;
  const fWave=$('fWave').value;
  let list=activeServices().filter(s=>activeCat==='all'||s.cat===activeCat);
  if(q) list=list.filter(s=>s.name.toLowerCase().includes(q)||s.desc.toLowerCase().includes(q));
  list=list.filter(s=>s.max>=fMin&&s.min<=fMax);
  if(fWave) list=list.filter(s=>String(s.wave)===fWave);
  if(fArea) list=list.filter(s=>providersFor(s.id,fArea).length>0);
  const mid=s=>(s.min+s.max)/2;
  if(sort==='priceAsc') list.sort((a,b)=>mid(a)-mid(b));
  else if(sort==='priceDesc') list.sort((a,b)=>mid(b)-mid(a));
  else if(sort==='new') list.sort((a,b)=>b.wave-a.wave||b.id.localeCompare(a.id));
  else list.sort((a,b)=>(b.popular-a.popular)||(a.wave-b.wave));
  $('svcCount').textContent='📦 '+list.length+' خدمة مطابقة'+(q?' لبحث «'+$('svcSearch').value+'»':'');
  if(!list.length){ $('servicesList').innerHTML='<div class="empty card"><span class="ic">🔍</span>ماكو نتائج مطابقة — جرّب تعديل الفلاتر أو البحث.</div>'; return; }
  $('servicesList').innerHTML=list.map(s=>{
    const pc=providersCount(s.id);
    return '<div class="svc-row">'
      +'<div class="ic">'+s.icon+'</div>'
      +'<div class="info"><b>'+s.name
      +(s.sensitive?' <span class="chip chip-red" style="font-size:11px;padding:2px 9px">بروتوكول خاص</span>':'')
      +(s.gold?' <span class="chip chip-dark" style="font-size:11px;padding:2px 9px">✨ ذهبية</span>':'')
      +'</b><span>'+s.desc+' · '+catOf(s.cat).name+' · '+(pc?pc+' مقدم موثّق':'بانتظار أول مقدم موثّق')+'</span></div>'
      +'<div class="price">'+priceRange(s)+' د.ع <span style="font-size:12px;color:var(--muted);font-weight:600">/'+s.unit+'</span></div>'
      +'<button class="btn btn-primary btn-sm" onclick="go(\'#/book/'+s.id+'\')">اطلب</button>'
      +'</div>';
  }).join('');
}
function setCat(c){ activeCat=c; renderServices(); }
function clearFilters(){ $('svcSearch').value=''; $('fMin').value=''; $('fMax').value=''; $('fArea').value=''; $('fWave').value=''; $('svcSort').value='pop'; activeCat='all'; renderServices(); }

/* ---------- 10) كيف تعمل ---------- */
function renderHow(){
  $('howRoot').innerHTML=`
  <div class="page-head"><h1>كيف تعمل <span class="hl">مدللني؟</span></h1><p>من الطلب الأول حتى التقييم — كل خطوة مسجّلة بالنظام وظاهرة للطرفين.</p></div>
  <div class="flow" style="padding-bottom:26px">
    <div class="flow-col"><h3>🧑 للزبون</h3><div class="sub">من أول ضغطة حتى باب دارك</div>
      <div class="flow-item"><div class="n">1</div><div><b>سجّل حسابك</b><p>اسمك ورقمك ومنطقتك — دقيقة واحدة وتدخل للنظام.</p></div></div>
      <div class="flow-item"><div class="n">2</div><div><b>اختر الخدمة وسعرها</b><p>كل خدمة بسعر مرجعي معلن — بدون مفاجآت.</p></div></div>
      <div class="flow-item"><div class="n">3</div><div><b>مقدم موثّق يقبل طلبك</b><p>يوصل طلبك للمقدمين المطابقين فقط، وأول واحد يقبل يتوكل.</p></div></div>
      <div class="flow-item"><div class="n">4</div><div><b>تابع وراسل لحظة بلحظة</b><p>مقبول ← بالطريق ← بدأ ← مكتمل، مع دردشة داخلية.</p></div></div>
      <div class="flow-item"><div class="n">5</div><div><b>ادفع وقيّم</b><p>السعر المعلن بالضبط (كاش أو محفظة)، وتقييمك يبني سمعة المقدم.</p></div></div>
    </div>
    <div class="flow-col"><h3>🧑‍🔧 لمقدم الخدمة</h3><div class="sub">شغل ثابت بدون ما تدور عليه</div>
      <div class="flow-item"><div class="n">1</div><div><b>سجّل وانتظر التوثيق</b><p>هوية + مهاراتك + مناطق خدمتك — الإدارة تراجع وتوثّق.</p></div></div>
      <div class="flow-item"><div class="n">2</div><div><b>استقبل الطلبات المطابقة</b><p>ما يوصلك إلا طلب بخدمتك ومنطقتك — اقبل أو ارفض بضغطة.</p></div></div>
      <div class="flow-item"><div class="n">3</div><div><b>أنجز وحدّث الحالة</b><p>بالطريق، بدأت، مكتمل — الزبون يتابع كل خطوة.</p></div></div>
      <div class="flow-item"><div class="n">4</div><div><b>استلم أرباحك</b><p>رصيدك يتجمع تلقائياً، واطلب تسوية من لوحتك — الإدارة تعتمدها.</p></div></div>
      <div class="flow-item"><div class="n">5</div><div><b>ابنِ سمعتك</b><p>التقييمات العالية = طلبات أكثر = عمولة أقل (نخبة ${DB.settings.commission.elite}%).</p></div></div>
    </div>
  </div>
  <div class="card" style="margin-bottom:70px">
    <h4 style="font-size:18px;font-weight:900;margin-bottom:16px">🛡️ التوثيق والأمان — مدمج بالنظام</h4>
    <div class="grid grid-2" style="gap:4px 20px">
      <div class="flow-item" style="border:none;padding:9px 0"><div class="n">✓</div><div><b>توثيق إداري لكل مقدم</b><p>ما يكدر يقبل أي طلب قبل ما الإدارة توثّقه من لوحة الإدارة.</p></div></div>
      <div class="flow-item" style="border:none;padding:9px 0"><div class="n">✓</div><div><b>دردشة داخلية موثقة</b><p>كل تواصل داخل الطلب — محفوظ ومرجع عند أي نزاع.</p></div></div>
      <div class="flow-item" style="border:none;padding:9px 0"><div class="n">✓</div><div><b>خدمات حساسة ببروتوكول صارم</b><p>حاضنة أطفال وجليسة مسنين: توثيق + مقابلة إلزامية.</p></div></div>
      <div class="flow-item" style="border:none;padding:9px 0"><div class="n">✓</div><div><b>نزاعات ودعم بشري</b><p>أي مشكلة؟ افتح تذكرة أو نزاع — الإدارة تتدخل وتحسم.</p></div></div>
    </div>
  </div>`;
}

/* ---------- 11) العمولة ---------- */
function renderPricing(){
  const c=DB.settings.commission;
  $('pricingRoot').innerHTML=`
  <div class="page-head"><h1>💰 العمولة <span class="hl">والشفافية</span></h1><p>الزبون يدفع السعر المعلن بالضبط — صفر رسوم إضافية. العمولة من مقدم الخدمة فقط، وتُحسب آلياً بكل طلب.</p></div>
  <div class="price-grid" style="padding-bottom:70px">
    <div>
      <div class="card" style="margin-bottom:20px">
        <h4 style="font-size:18px;font-weight:900;margin-bottom:16px">نموذج العمولة حسب الفئة</h4>
        <table class="rate-table">
          <tr><th>الفئة</th><th>العمولة</th><th>السبب</th></tr>
          <tr><td>توصيل ونقل (هامش ضعيف)</td><td><b>${c.delivery}%</b></td><td>هامش المندوب ضعيف أصلاً</td></tr>
          <tr><td>غالبية الخدمات</td><td><b>${c.standard}%</b></td><td>النطاق العالمي الذهبي</td></tr>
          <tr><td>أول طلب مع زبون جديد</td><td><b>${c.first}%</b></td><td>قيمة التعارف — المنصة جابت لك زبون</td></tr>
        </table>
      </div>
      <div class="card">
        <h4 style="font-size:18px;font-weight:900;margin-bottom:16px">سلّم الولاء — عمولتك تنزل كل ما اشتغلت أكثر</h4>
        <table class="rate-table">
          <tr><th>طلبات مكتملة بالشهر</th><th>العمولة</th></tr>
          <tr><td>1 – ${DB.settings.loyalAt-1} طلبات</td><td><b>${c.standard}%</b></td></tr>
          <tr><td>${DB.settings.loyalAt} – ${DB.settings.eliteAt-1} طلب</td><td><b>${c.loyal}%</b></td></tr>
          <tr><td>${DB.settings.eliteAt}+ طلب (نخبة)</td><td><b>${c.elite}%</b></td></tr>
        </table>
        <p style="font-size:13.5px;color:var(--muted);margin-top:14px">💡 تُحسب العمولة آلياً عند قبول كل طلب حسب سجلّك الفعلي بالنظام — مو كلام، أرقام.</p>
      </div>
    </div>
    <div class="calc">
      <h3>🧮 حاسبة العمولة</h3>
      <div class="field"><label>سعر الخدمة (دينار عراقي)</label><input type="number" id="calcPrice" value="25000" min="1000" step="1000" oninput="calcUpdate()"></div>
      <div class="field"><label>شريحة العمولة</label>
        <select id="calcTier" onchange="calcUpdate()">
          <option value="${c.first}">أول طلب مع زبون جديد — ${c.first}%</option>
          <option value="${c.standard}" selected>قياسي — ${c.standard}%</option>
          <option value="${c.loyal}">ولاء (${DB.settings.loyalAt}–${DB.settings.eliteAt-1} طلب/شهر) — ${c.loyal}%</option>
          <option value="${c.elite}">نخبة (${DB.settings.eliteAt}+ طلب/شهر) — ${c.elite}%</option>
          <option value="${c.delivery}">توصيل ونقل — ${c.delivery}%</option>
        </select>
      </div>
      <div id="calcResult"></div>
      <p style="font-size:12.5px;opacity:.65;margin-top:14px">* الزبون يدفع السعر المعلن بالضبط — العمولة تُخصم من حصة مقدم الخدمة فقط.</p>
    </div>
  </div>`;
  calcUpdate();
}
function calcUpdate(){
  const price=Math.max(1000, parseInt($('calcPrice').value)||1000);
  const rate=parseFloat($('calcTier').value);
  const commission=Math.round(price*rate/100);
  $('calcResult').innerHTML=`
    <div class="calc-row"><span>الزبون يدفع (السعر المعلن)</span><b>${fmt(price)} د.ع</b></div>
    <div class="calc-row"><span>عمولة المنصة (${rate}%)</span><b>− ${fmt(commission)} د.ع</b></div>
    <div class="calc-row total"><span>مقدم الخدمة يستلم</span><b>${fmt(price-commission)} د.ع</b></div>`;
}

/* ---------- 12) شاشة الدخول والتسجيل ---------- */
function renderAuth(mode){
  const u = me();
  if(u){
    go('#/home');
    return;
  }
  const isLogin=mode!=='register';
  window._regRole=window._regRole||'customer';
  const isProv=window._regRole==='provider';
  const areasList=(DB&&DB.settings&&Array.isArray(DB.settings.areas)&&DB.settings.areas.length>=10)?DB.settings.areas:DEF_AREAS;
  
  if(isLogin){
    $('authRoot').innerHTML=`
    <div class="auth-card">
      <div class="auth-tabs"><button class="active">تسجيل الدخول</button><button onclick="go('#/auth/register')">حساب جديد</button></div>
      <h3 style="font-size:21px;font-weight:900;margin-bottom:6px">👋 أهلاً بك في مدللني</h3>
      <p style="font-size:14px;color:var(--muted);margin-bottom:22px">سجّل دخولك برقم هاتفك وكلمة المرور.</p>
      <div class="field"><label>رقم الهاتف</label><input id="lgPhone" placeholder="07XXXXXXXXX" inputmode="tel" maxlength="15" value="${esc(window._lastPhone||'')}"></div>
      <div class="field"><label>كلمة المرور</label><input id="lgPass" type="password" placeholder="••••••••" onkeydown="if(event.key==='Enter')doLogin()"></div>
      <button class="btn btn-primary btn-block" onclick="doLogin()">دخول ←</button>
      <div style="text-align:center;margin-top:16px"><a style="font-size:13.5px;color:var(--muted);cursor:pointer" onclick="go('#/auth/register')">ما عندك حساب؟ <b style="color:var(--ink)">سجّل الآن مجاناً</b></a></div>
    </div>`;
    return;
  }

  $('authRoot').innerHTML=`
  <div class="auth-card">
    <div class="auth-tabs"><button onclick="go('#/auth/login')">تسجيل الدخول</button><button class="active">حساب جديد</button></div>
    <h3 style="font-size:21px;font-weight:900;margin-bottom:6px">📝 أنشئ حسابك الجديد</h3>
    <p style="font-size:14px;color:var(--muted);margin-bottom:20px">دقيقة واحدة وتصير داخل منظومة مدللني.</p>
    <div class="role-pick">
      <div class="rp ${!isProv?'sel':''}" onclick="pickRole('customer')"><span class="ic">🧑</span><b>زبون</b><span>أطلب خدمات لبيتي</span></div>
      <div class="rp ${isProv?'sel':''}" onclick="pickRole('provider')"><span class="ic">🧑‍🔧</span><b>مقدم خدمة</b><span>أشتغل وأستلم طلبات</span></div>
    </div>
    <div class="field"><label>الاسم الكامل</label><input id="rgName" placeholder="مثلاً: حيدر كريم"></div>
    <div class="field"><label>رقم الهاتف</label><input id="rgPhone" placeholder="07XXXXXXXXX" inputmode="tel" maxlength="15" value="${esc(window._lastPhone||'')}"></div>
    <div class="grid grid-2" style="gap:12px">
      <div class="field"><label>كلمة المرور</label><input id="rgPass" type="password" placeholder="6 أحرف على الأقل"></div>
      <div class="field"><label>تأكيد كلمة المرور</label><input id="rgPass2" type="password" placeholder="أعد كتابتها"></div>
    </div>
    <div class="field">
      <label>منطقتك بالناصرية (اكتب منطقتك أو اختر من المقترحات)</label>
      <input id="rgArea" placeholder="اكتب اسم منطقتك بالناصرية (مثلاً: شارع 40 / الحبوبي / الشموخ)">
      <div class="area-cloud">
        ${['الحبوبي / المركز', 'شارع 40', 'الإدارة المحلية', 'حي المعلمين', 'حي الحسين', 'حي الشموخ', 'حي سومر', 'صوب الشامية', 'صوب الجزيرة'].map(a=>`<button type="button" class="area-tag" onclick="$('rgArea').value='${a}'">${a}</button>`).join('')}
      </div>
    </div>
    <div id="rgProvFields" style="display:${isProv?'block':'none'}">
      <div class="field">
        <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:14.5px;font-weight:900">🧰 الخدمات التي تقدمها (اختر حتى 3 خدمات)</span>
          <span id="rgSvcCountBadge" class="chip chip-dark" style="font-size:12px;padding:3px 10px">1 / 3 محددة</span>
        </label>
        
        <div class="svc-dropdown-wrap">
          <div class="svc-trigger-head" onclick="toggleSvcDrawer('rgSvcDrawer')">
            <span class="svc-trigger-btn">🗂️ اضغط هنا لاختيار أو تعديل المهن <span style="font-size:12px">▼</span></span>
            <span style="font-size:12px;color:var(--muted);font-weight:700">تصفح الخدمات</span>
          </div>
          <div id="rgSelectedChips" class="svc-chips-bar">
            <span class="svc-chip-item">🚗 غسيل سيارات متنقل <span class="del-btn" onclick="removeSvcChoice('rgServiceCheck','s1','rgSelectedChips','rgSvcCountBadge')">✕</span></span>
          </div>
          <div id="rgSvcDrawer" class="svc-drawer-panel" style="display:none">
            <input type="text" class="svc-search-input" placeholder="🔍 ابحث عن خدمة (تبريد، كهرباء، تنظيف، سباكة...)" oninput="filterSvcDrawer(this.value, 'rgSvcList')">
            <div class="svc-compact-list" id="rgSvcList">
              ${activeServices().map(s=>`
                <label class="svc-compact-row ${s.id==='s1'?'active':''}" data-name="${s.name.toLowerCase()} ${s.desc.toLowerCase()}">
                  <input type="checkbox" class="rgServiceCheck" value="${s.id}" onchange="updateSvcSelection('rgServiceCheck', 'rgSelectedChips', 'rgSvcCountBadge', this)" ${s.id==='s1'?'checked':''}>
                  <span style="font-size:16px">${s.icon}</span>
                  <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</span>
                  <span style="font-size:10.5px;color:var(--muted)">${priceRange(s)}</span>
                </label>
              `).join('')}
            </div>
            <div style="margin-top:10px;text-align:left">
              <button type="button" class="btn btn-primary btn-sm" onclick="toggleSvcDrawer('rgSvcDrawer')">✓ تم الاختيار</button>
            </div>
          </div>
        </div>

        <div style="margin-top:10px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;cursor:pointer">
            <input type="checkbox" id="rgHasCustomSvc" onchange="var w=$('rgCustomServiceWrap');if(w){w.style.display=this.checked?'block':'none';}updateSvcSelection('rgServiceCheck', 'rgSelectedChips', 'rgSvcCountBadge', this)">
            <span>➕ إضافة مهنة خاصة أخرى غير موجودة بالقائمة</span>
          </label>
        </div>
        <div id="rgCustomServiceWrap" style="display:none;margin-top:10px;padding:12px;background:rgba(201,162,39,0.06);border:1.5px dashed var(--gold);border-radius:12px">
          <div class="field" style="margin-bottom:8px"><label style="font-size:12px">اسم مهنتك / خدمتك بالتفصيل</label><input id="rgCustomName" placeholder="مثلاً: فني صيانة طاقة شمسية / تغليف ديكور" oninput="updateSvcSelection('rgServiceCheck', 'rgSelectedChips', 'rgSvcCountBadge')"></div>
          <div class="field" style="margin-bottom:8px"><label style="font-size:12px">تفاصيل الخدمة وما تقدمه</label><input id="rgCustomDesc" placeholder="نبذة مختصرة عن الخدمة"></div>
          <div class="grid grid-2" style="gap:8px">
            <div class="field"><label style="font-size:12px">أقل سعر (د.ع)</label><input id="rgCustomMin" type="number" value="10000" step="1000"></div>
            <div class="field"><label style="font-size:12px">أعلى سعر (د.ع)</label><input id="rgCustomMax" type="number" value="50000" step="1000"></div>
          </div>
        </div>
      </div>
      <div class="field"><label>سنوات الخبرة</label><input id="rgExp" type="number" min="0" placeholder="مثلاً: 3" value="3"></div>
      <div class="field">
        <label>مناطق الخدمة التي تغطيها (اختر أو أضف منطقتك)</label>
        <div class="area-add-box">
          <input id="rgNewAreaInput" class="area-add-input" placeholder="اكتب اسم منطقة أو حي إضافي بالناصرية واضغط إضافة..." onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomAreaTag('rgAreaCloud','rgNewAreaInput','rgArea2');}">
          <button type="button" class="btn btn-outline btn-sm" onclick="addCustomAreaTag('rgAreaCloud','rgNewAreaInput','rgArea2')">➕ إضافة منطقة</button>
        </div>
        <div class="area-cloud" id="rgAreaCloud">
          <label class="area-tag active">
            <input type="checkbox" class="rgArea2" value="كل الناصرية" checked onchange="this.parentElement.classList.toggle('active', this.checked)"> كل الناصرية
          </label>
          ${areasList.map(a=>`
            <label class="area-tag">
              <input type="checkbox" class="rgArea2" value="${a}" onchange="this.parentElement.classList.toggle('active', this.checked)"> ${a}
            </label>
          `).join('')}
        </div>
      </div>
      <div class="note">🛡️ بعد التسجيل، حسابك يدخل <b>قائمة توثيق الإدارة</b> — ستصلك الطلبات فور مراجعة وتوثيق حسابك.</div>
    </div>
    <div id="rgCustNote" class="note note-gray" style="display:${isProv?'none':'block'}">🔒 بياناتك محفوظة ومحمية بالكامل — سهولة بالطلب وأمان تام.</div>
    <button class="btn btn-primary btn-block" style="margin-top:18px" onclick="doRegister()">🚀 إنشاء الحساب والبدء فوراً ←</button>
    <div style="text-align:center;margin-top:16px"><a style="font-size:13.5px;color:var(--muted);cursor:pointer" onclick="go('#/auth/login')">عندك حساب بالفعل؟ <b style="color:var(--ink)">سجّل دخولك</b></a></div>
  </div>`;
}

function toggleSvcDrawer(id){
  const el = $(id);
  if(el){
    el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
  }
}

function filterSvcDrawer(query, listId){
  const q = (query || '').toLowerCase().trim();
  const list = $(listId);
  if(!list) return;
  list.querySelectorAll('.svc-compact-row').forEach(row => {
    const text = (row.getAttribute('data-name') || '').toLowerCase();
    row.style.display = (!q || text.includes(q)) ? 'flex' : 'none';
  });
}

function updateSvcSelection(checkClass, chipsContainerId, badgeId, el){
  const checks = Array.from(document.querySelectorAll('.' + checkClass));
  const isRg = checkClass === 'rgServiceCheck';
  const customCheck = $(isRg ? 'rgHasCustomSvc' : 'pvfHasCustomSvc');
  const custom = customCheck && customCheck.checked;
  const checkedBoxes = checks.filter(c => c.checked);
  const count = checkedBoxes.length + (custom ? 1 : 0);
  
  if(count > 3){
    if(el) el.checked = false;
    toast('⚠️ يمكنك اختيار 3 خدمات كحد أقصى');
    return updateSvcSelection(checkClass, chipsContainerId, badgeId);
  }

  const badge = $(badgeId);
  if(badge) badge.textContent = count + ' / 3 محددة';

  checks.forEach(c => {
    const row = c.closest('.svc-compact-row') || c.closest('.svc-pick-pill');
    if(row) row.classList.toggle('active', c.checked);
  });

  const chipsWrap = $(chipsContainerId);
  if(chipsWrap){
    let chipsHtml = '';
    checks.filter(c => c.checked).forEach(c => {
      const s = svc(c.value);
      if(s){
        chipsHtml += '<span class="svc-chip-item">'+s.icon+' '+esc(s.name)+' <span class="del-btn" onclick="removeSvcChoice(\''+checkClass+'\',\''+s.id+'\',\''+chipsContainerId+'\',\''+badgeId+'\')">✕</span></span>';
      }
    });
    if(custom){
      const customName = ($(isRg ? 'rgCustomName' : 'pvfCustomName')?.value || '').trim() || 'مهنة خاصة أخرى';
      chipsHtml += '<span class="svc-chip-item">✨ '+esc(customName)+' <span class="del-btn" onclick="removeCustomSvc(\''+(isRg ? 'rgHasCustomSvc' : 'pvfHasCustomSvc')+'\',\''+checkClass+'\',\''+chipsContainerId+'\',\''+badgeId+'\')">✕</span></span>';
    }
    if(!chipsHtml){
      chipsHtml = '<span style="font-size:12.5px;color:var(--muted)">لم يتم اختيار أي خدمة بعد — اضغط أعلاه لاختيار مهنك</span>';
    }
    chipsWrap.innerHTML = chipsHtml;
  }
}

function removeSvcChoice(checkClass, serviceId, chipsContainerId, badgeId){
  const chk = document.querySelector('.' + checkClass + '[value="' + serviceId + '"]');
  if(chk){
    chk.checked = false;
    updateSvcSelection(checkClass, chipsContainerId, badgeId, chk);
  }
}

function removeCustomSvc(customCheckId, checkClass, chipsContainerId, badgeId){
  const chk = $(customCheckId);
  if(chk){
    chk.checked = false;
    const wrap = $(customCheckId === 'rgHasCustomSvc' ? 'rgCustomServiceWrap' : 'pvfCustomServiceWrap');
    if(wrap) wrap.style.display = 'none';
    updateSvcSelection(checkClass, chipsContainerId, badgeId);
  }
}

function addCustomAreaTag(cloudId, inputId, checkClass){
  const inp = $(inputId);
  if(!inp) return;
  const val = inp.value.trim();
  if(!val){ toast('يرجى كتابة اسم المنطقة أولاً'); return; }
  const cloud = $(cloudId);
  if(!cloud) return;
  
  const existing = Array.from(cloud.querySelectorAll('.' + checkClass)).map(c => c.value);
  if(existing.includes(val)){
    toast('هذه المنطقة موجودة بالفعل');
    const match = Array.from(cloud.querySelectorAll('.' + checkClass)).find(c => c.value === val);
    if(match){ match.checked = true; match.parentElement.classList.add('active'); }
    inp.value = '';
    return;
  }

  const label = document.createElement('label');
  label.className = 'area-tag active';
  label.style.display = 'inline-flex';
  label.style.alignItems = 'center';
  label.style.gap = '6px';
  
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.className = checkClass;
  chk.value = val;
  chk.checked = true;
  chk.style.display = 'inline';
  chk.onchange = function(){ label.classList.toggle('active', this.checked); };
  
  label.appendChild(chk);
  label.appendChild(document.createTextNode(' ' + val));
  
  cloud.appendChild(label);
  inp.value = '';
  toast('✓ تم إضافة «' + val + '» إلى مناطقك');
}

function checkServiceLimit(el){
  updateSvcSelection('rgServiceCheck', 'rgSelectedChips', 'rgSvcCountBadge', el);
}

function checkPvfServiceLimit(el){
  updateSvcSelection('pvfServiceCheck', 'pvfSelectedChips', 'pvfSvcCountBadge', el);
}

function pickRole(r){
  window._regRole=r;
  const isProv=r==='provider';
  document.querySelectorAll('.role-pick .rp').forEach((el, i)=>{
    if(i===0) el.classList.toggle('sel', !isProv);
    if(i===1) el.classList.toggle('sel', isProv);
  });
  const pf=$('rgProvFields'); if(pf) pf.style.display=isProv?'block':'none';
  const cn=$('rgCustNote'); if(cn) cn.style.display=isProv?'none':'block';
}

/* ---------- 13) محرك الطلب (3 خطوات) ---------- */
let bookState={ step:1, serviceId:null, desc:'', area:'', address:'', when:'now', whenTime:'', pay:'cash' };
function renderBook(param){
  const u=me(); if(!u){ requireAuth('#/book'); return; }
  if(param&&svc(param)&&svc(param).active!==false){ bookState.serviceId=param; if(bookState.step===1) bookState.step=2; }
  $('bookRoot').innerHTML=`
    <div class="page-head" style="text-align:center;max-width:none;padding-top:44px"><h1>اطلب <span class="hl">خدمة</span></h1><p>ثلاث خطوات وطلبك ينطلق للمقدمين الموثّقين.</p></div>
    <div class="book-steps">
      <div class="bs" id="bs1"><div class="n">1</div>الخدمة</div>
      <div class="bs" id="bs2"><div class="n">2</div>التفاصيل</div>
      <div class="bs" id="bs3"><div class="n">3</div>التأكيد</div>
    </div>
    <div class="book-panel" id="bookPanel"></div>`;
  if(bookState.step===1) bookStep1(); else if(bookState.step===2) bookStep2(); else bookStep3();
}
function bookSetStep(n){ bookState.step=n; renderBook(); }
function paintSteps(){
  [1,2,3].forEach(i=>{ const b=$('bs'+i); if(!b) return; b.className='bs '+(i<bookState.step?'done':i===bookState.step?'active':''); });
}
function bookStep1(){
  paintSteps();
  $('bookPanel').innerHTML=`<h3>اختر الخدمة</h3>
  <div class="pick-grid">${activeServices().map(s=>`<div class="pick ${bookState.serviceId===s.id?'sel':''}" onclick="bookPick('${s.id}')"><div class="ic">${s.icon}</div><div><b>${s.name}</b><span>${s.desc}</span></div><div class="price">${priceRange(s)}</div></div>`).join('')}</div>`;
}
function bookPick(id){ bookState.serviceId=id; bookState.step=2; renderBook(); }
function bookStep2(){
  paintSteps();
  const s=svc(bookState.serviceId);
  if(!s){ bookState.step=1; renderBook(); return; }
  const provs=providersFor(s.id, null).length;
  $('bookPanel').innerHTML=`<h3>${s.icon} ${s.name}</h3>
  ${s.sensitive?'<div class="note">🛡️ <b>خدمة حساسة:</b> مقدمو هذه الخدمة يمرون بتوثيق + مقابلة إلزامية من الإدارة.</div>':''}
  <div class="field"><label>وصف المشكلة أو الطلب</label><textarea id="bkDesc" rows="3">${esc(bookState.desc)}</textarea><div class="hint">كل ما أوضح وصفك، كل ما كان السعر النهائي أدق.</div></div>
  <div class="grid grid-2" style="gap:12px">
    <div class="field">
      <label>المنطقة بالناصرية (اكتب منطقتك أو اختر من المقترحات)</label>
      <input id="bkArea" value="${esc(bookState.area)}" placeholder="اكتب اسم منطقتك بالناصرية (مثلاً: شارع 40 / الحبوبي / الشموخ)">
      <div class="area-cloud" style="margin-top:6px">
        ${['الحبوبي / المركز', 'شارع 40', 'الإدارة المحلية', 'حي المعلمين', 'حي الحسين', 'حي الشموخ', 'حي سومر', 'صوب الشامية', 'صوب الجزيرة'].map(a=>`<button type="button" class="area-tag ${bookState.area===a?'active':''}" onclick="$('bkArea').value='${a}'">${a}</button>`).join('')}
      </div>
    </div>
    <div class="field"><label>العنوان أو أقرب نقطة دالة</label><input id="bkAddr" value="${esc(bookState.address)}" placeholder="مثلاً: قرب جامع الحبوبي"></div>
  </div>
  <div class="grid grid-2" style="gap:12px">
    <div class="field"><label>متى تحتاجها؟</label><select id="bkWhen" onchange="document.getElementById('bkWhenField').style.display=this.value==='scheduled'?'block':'none'"><option value="now" ${bookState.when==='now'?'selected':''}>الآن — بأسرع وقت</option><option value="scheduled" ${bookState.when==='scheduled'?'selected':''}>مجدول — وقت محدد</option></select></div>
    <div class="field" id="bkWhenField" style="display:${bookState.when==='scheduled'?'block':'none'}"><label>حدد الوقت</label><input id="bkWhenTime" type="datetime-local" value="${esc(bookState.whenTime)}"></div>
  </div>
  <div class="field"><label>طريقة الدفع</label><select id="bkPay"><option value="cash" ${bookState.pay==='cash'?'selected':''}>💵 كاش عند الإنجاز</option><option value="wallet" ${bookState.pay==='wallet'?'selected':''}>📱 محفظة إلكترونية (ZainCash / FIB / Qi)</option></select></div>
  <div class="note note-gray">💡 السعر المرجعي لهذه الخدمة: <b>${priceRange(s)} د.ع /${s.unit}</b> · المقدم يؤكد السعر النهائي قبل البدء، وأنت توافق عليه داخل الطلب. ${provs?('👷 '+provs+' مقدم موثّق متاح لهذه الخدمة'):'⚠️ لا يوجد مقدم موثّق بهذه الخدمة بعد — طلبك يصل للإدارة ونوفر لك واحداً'}</div>
  <div style="display:flex;gap:10px;margin-top:8px"><button class="btn btn-ghost" onclick="bookSetStep(1)">→ رجوع</button><button class="btn btn-primary" style="flex:1" onclick="bookNext2()">التالي: التأكيد</button></div>`;
}
function bookNext2(){
  const desc=$('bkDesc').value.trim();
  let area=$('bkArea').value;
  if(area==='__custom__'){
    const ca=$('bkCustomArea')?$('bkCustomArea').value.trim():'';
    if(!ca){ toast('📍 اكتب اسم منطقتك'); return; }
    area=ca;
  }
  const addr=$('bkAddr').value.trim();
  const when=$('bkWhen').value;
  const whenTime=when==='scheduled'&&$('bkWhenTime')?$('bkWhenTime').value:'';
  const pay=$('bkPay').value;
  if(desc.length<5){ toast('✍️ اكتب وصفاً واضحاً للطلب'); return; }
  if(!area){ toast('📍 اختر المنطقة'); return; }
  if(when==='scheduled'&&!whenTime){ toast('🕐 حدد وقت الموعد'); return; }
  bookState.desc=desc; bookState.area=area; bookState.address=addr; bookState.when=when; bookState.whenTime=whenTime; bookState.pay=pay;
  bookState.step=3; renderBook();
}
function bookStep3(){
  paintSteps();
  const s=svc(bookState.serviceId);
  const est=midPrice(s);
  $('bookPanel').innerHTML=`<h3>تأكيد الطلب</h3>
  <div class="summary-line"><span>الخدمة</span><b>${s.icon} ${s.name}</b></div>
  <div class="summary-line"><span>الوصف</span><b>${esc(bookState.desc)}</b></div>
  <div class="summary-line"><span>المنطقة</span><b>${bookState.area}${bookState.address?' — '+esc(bookState.address):''}</b></div>
  <div class="summary-line"><span>الوقت</span><b>${bookState.when==='now'?'الآن — بأسرع وقت':fmtDT(bookState.whenTime)}</b></div>
  <div class="summary-line"><span>الدفع</span><b>${bookState.pay==='cash'?'💵 كاش عند الإنجاز':'📱 محفظة إلكترونية'}</b></div>
  <div class="summary-line total"><span>السعر التقديري</span><b>${fmt(est)} د.ع <span style="font-size:12.5px;color:var(--muted);font-weight:600">(النطاق: ${priceRange(s)})</span></b></div>
  <div class="note">💡 السعر تقديري حسب الكتالوج — مقدم الخدمة يؤكد <b>السعر النهائي</b> عند القبول، وأنت <b>توافق عليه</b> قبل بدء العمل. لا رسوم إضافية على الزبون إطلاقاً.</div>
  <div style="display:flex;gap:10px;margin-top:18px"><button class="btn btn-ghost" onclick="bookSetStep(2)">→ رجوع</button><button class="btn btn-primary" style="flex:1" onclick="bookConfirm(${est})">✓ تأكيد وإرسال الطلب</button></div>`;
}
function bookConfirm(est){
  const u=me(); if(!u){ requireAuth('#/book'); return; }
  const s=svc(bookState.serviceId);
  const o={
    id:'UR-'+(DB.meta.orderSeq++),
    serviceId:s.id, customerId:u.id, providerId:null,
    desc:bookState.desc, area:bookState.area, address:bookState.address,
    when:bookState.when, whenTime:bookState.whenTime, payMethod:bookState.pay,
    estimate:est, finalPrice:null, priceConfirmed:false,
    status:'pending', timeline:[{s:'pending',at:Date.now()}], createdAt:Date.now(),
    commissionRate:null, review:null, disputed:false, rejectedBy:[]
  };
  DB.orders.unshift(o);
  const targets=providersFor(s.id, o.area).filter(p=>p.id!==u.id);
  targets.forEach(p=>notify(p.id,'📥','طلب جديد '+o.id+': '+s.name+' — '+o.area+' ('+fmt(est)+' د.ع)',o.id));
  if(!targets.length) notifyAdmins('⚠️','طلب '+o.id+' ('+s.name+' — '+o.area+') بدون مقدم موثّق متاح',o.id);
  audit('system','طلب جديد '+o.id+' من '+u.name);
  save();
  toast(targets.length?('🚀 طلبك انطلق — وصل لـ '+targets.length+' مقدم موثّق'):'📨 طلبك سُجّل — الإدارة توفر لك مقدماً');
  bookState={ step:1, serviceId:null, desc:'', area:'', address:'', when:'now', whenTime:'', pay:'cash' };
  go('#/order/'+o.id);
}

/* ---------- 14) صفحة الطلب ---------- */
function orderVisible(o,u){ if(!u) return false; return u.role==='admin'||o.customerId===u.id||o.providerId===u.id; }
function renderOrder(id){
  const o=orderById(id);
  const u=me();
  if(!o){ $('orderRoot').innerHTML='<div class="empty card" style="margin-top:50px"><span class="ic">🔍</span><p>الطلب غير موجود.</p><button class="btn btn-primary" style="margin-top:14px" onclick="go(\'#/account\')">طلباتي</button></div>'; return; }
  if(!u||!orderVisible(o,u)){ requireAuth('#/order/'+id); return; }
  const s=svc(o.serviceId);
  const cust=userById(o.customerId);
  const p=o.providerId?userById(o.providerId):null;
  const isCust=o.customerId===u.id, isProv=o.providerId===u.id, isAdm=u.role==='admin';

  let topHtml='';
  if(o.status==='cancelled'){
    topHtml='<div class="banner banner-red"><span class="ic">🚫</span><div><b>هذا الطلب ملغي.</b><br>'+(o.cancelReason?esc(o.cancelReason):'')+'</div></div>';
  } else {
    const idx=STATUS_ORDER.indexOf(o.status);
    topHtml='<div class="status-timeline">'+STATUSES.map((st,i)=>'<div class="st '+(i<idx?'done':i===idx?'now':'')+'"><div class="n">'+(i<idx?'✓':st.icon)+'</div><span>'+st.label+'</span></div>').join('')+'</div>';
  }
  if(o.disputed&&o.status!=='cancelled') topHtml+='<div class="banner banner-amber"><span class="ic">⚖️</span><div><b>يوجد نزاع مفتوح على هذا الطلب</b> — الإدارة تراجعه من مركز التذاكر.</div></div>';

  // بطاقة السعر النهائي
  let priceCard='';
  if(p){
    const e=earningsOf(o);
    priceCard='<div class="order-card"><h4>💰 السعر والعمولة</h4>'
      +'<div class="detail-row"><span>السعر التقديري</span><b>'+fmt(o.estimate)+' د.ع</b></div>'
      +'<div class="detail-row"><span>السعر النهائي</span><b>'+(o.finalPrice!=null?fmt(o.finalPrice)+' د.ع':'—')+(o.priceConfirmed?' <span class="chip chip-green">✓ وافق عليه الزبون</span>':' <span class="chip chip-amber">بانتظار موافقة الزبون</span>')+'</b></div>'
      +(isProv||isAdm? '<div class="detail-row"><span>عمولة المنصة ('+e.rate+'%)</span><b>− '+fmt(e.commission)+' د.ع</b></div><div class="detail-row"><span>صافي المقدم</span><b style="color:var(--ok)">'+fmt(e.net)+' د.ع</b></div>' : '')
      +'</div>';
  }

  // إجراءات
  let actions='';
  if(isCust){
    if(o.status==='pending'||o.status==='accepted') actions+='<button class="btn btn-danger btn-sm" onclick="cancelOrderAsk(\''+o.id+'\')">إلغاء الطلب</button>';
    if(o.status==='accepted'&&o.finalPrice!=null&&!o.priceConfirmed) actions+='<button class="btn btn-primary btn-sm" onclick="confirmPrice(\''+o.id+'\')">✓ أوافق على السعر النهائي ('+fmt(o.finalPrice)+' د.ع)</button>';
    if(['accepted','enroute','started'].includes(o.status)&&!o.disputed) actions+='<button class="btn btn-ghost btn-sm" onclick="openDispute(\''+o.id+'\')">⚖️ افتح نزاع</button>';
    if(o.status==='done') actions+='<button class="btn btn-outline btn-sm" onclick="reorder(\''+o.id+'\')">↺ أعد الطلب</button>';
  }
  if(isProv){
    const i=STATUS_ORDER.indexOf(o.status);
    if(o.status==='accepted') actions+='<button class="btn btn-outline btn-sm" onclick="setFinalPriceAsk(\''+o.id+'\')">💰 عدّل السعر النهائي</button>';
    if(i>0&&i<STATUS_ORDER.length-1){ const next=STATUS_ORDER[i+1]; actions+='<button class="btn btn-primary btn-sm" onclick="advanceOrder(\''+o.id+'\')">'+(next==='done'?'🎉 أكمل الخدمة':'التالي: '+stInfo(next).label)+'</button>'; }
    if(o.status==='accepted') actions+='<button class="btn btn-danger btn-sm" onclick="providerDrop(\''+o.id+'\')">اعتذار عن الطلب</button>';
    if(['enroute','started'].includes(o.status)&&!o.disputed) actions+='<button class="btn btn-ghost btn-sm" onclick="openDispute(\''+o.id+'\')">⚖️ بلّغ عن مشكلة</button>';
  }
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
    <button class="btn btn-ghost btn-sm" onclick="go('#/${isProv?'provider':isAdm?'admin/orders':'account'}')">← رجوع للوحة</button></div>
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
  ${chatBox}
  ${rateBox}
  ${actions?'<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">'+actions+'</div>':''}
  `;
  const cl=$('chatList'); if(cl) cl.scrollTop=cl.scrollHeight;
}
function ratePick(n){ window._rateVal=n; document.querySelectorAll('#rateStars span').forEach(sp=>sp.classList.toggle('on', +sp.dataset.v<=n)); }
function rateSubmit(id){
  const o=orderById(id); if(!o) return;
  const v=window._rateVal||0;
  if(!v){ toast('⭐ اختر عدد النجوم أولاً'); return; }
  const text=$('rateText').value.trim();
  o.review={ stars:v, text, at:Date.now() };
  const p=userById(o.providerId);
  if(p&&p.provider){ p.provider.ratingSum+=v; p.provider.ratingCount++; }
  if(p) notify(p.id,'⭐','تقييم جديد '+v+'/5 على الطلب '+o.id+(text?': "'+text+'"':''),o.id);
  save(); toast('⭐ شكراً — تقييمك انسجّل'); renderOrder(id); renderHeader(currentRoute().name);
}
function sendMsg(orderId){
  const u=me(); const o=orderById(orderId); if(!u||!o) return;
  const inp=$('chatInput'); const text=inp.value.trim();
  if(!text) return;
  DB.messages.push({ id:'m'+(DB.meta.msgSeq++), orderId, fromId:u.id, text, at:Date.now() });
  const otherId=u.id===o.customerId?o.providerId:o.customerId;
  if(otherId) notify(otherId,'💬','رسالة جديدة بالطلب '+orderId+': '+text.slice(0,60)+(text.length>60?'…':''),orderId);
  save(); renderOrder(orderId); renderHeader(currentRoute().name);
}
function confirmPrice(id){ const o=orderById(id); if(!o) return; o.priceConfirmed=true; if(o.providerId) notify(o.providerId,'💰','الزبون وافق على السعر النهائي للطلب '+id+' ('+fmt(o.finalPrice)+' د.ع)',id); save(); toast('✓ وافقت على السعر النهائي'); renderOrder(id); }
function cancelOrderAsk(id){
  const o=orderById(id); if(!o) return;
  modal('<h3>إلغاء الطلب '+id+'؟</h3><p>'+(o.status==='pending'?'الطلب قيد الانتظار — الإلغاء مجاني بالكامل.':'الطلب مقبول — الإلغاء يوصل إشعار فوري لمقدم الخدمة.')+'</p><div class="actions"><button class="btn btn-ghost" onclick="closeModal()">تراجع</button><button class="btn btn-danger" onclick="doCancelOrder(\''+id+'\')">نعم، ألغِ الطلب</button></div>');
}
function doCancelOrder(id){
  const u=me(); const o=orderById(id); if(!o||!u) return;
  o.status='cancelled'; o.cancelledBy=u.id; o.cancelReason='أُلغي بواسطة '+(u.role==='admin'?'الإدارة':u.id===o.customerId?'الزبون':'مقدم الخدمة');
  o.timeline.push({s:'cancelled',at:Date.now()});
  const other=u.id===o.customerId?o.providerId:o.customerId;
  if(other) notify(other,'🚫','تم إلغاء الطلب '+id,id);
  if(u.role==='admin') audit(u.name,'إلغاء إداري للطلب '+id);
  save(); closeModal(); toast('تم إلغاء الطلب'); renderOrder(id); renderHeader(currentRoute().name);
}
function providerDrop(id){
  const u=me(); const o=orderById(id); if(!o||!u) return;
  o.rejectedBy.push(u.id);
  o.providerId=null; o.status='pending'; o.finalPrice=null; o.priceConfirmed=false; o.commissionRate=null;
  o.timeline.push({s:'pending',at:Date.now()});
  notify(o.customerId,'🔄','مقدم الخدمة اعتذر عن الطلب '+id+' — رجع طلبك للمقدمين المتاحين',id);
  audit(u.name,'اعتذار عن الطلب '+id);
  save(); toast('تم الاعتذار — الطلب رجع للسوق'); go('#/provider');
}
function setFinalPriceAsk(id){
  const o=orderById(id); if(!o) return;
  modal('<h3>💰 تأكيد السعر النهائي — '+id+'</h3><p>السعر التقديري كان '+fmt(o.estimate)+' د.ع. حدد السعر النهائي الي تلتزم به — الزبون لازم يوافق عليه قبل بدء العمل.</p><div class="field"><label>السعر النهائي (د.ع)</label><input type="number" id="fpVal" value="'+(o.finalPrice||o.estimate)+'" min="1000" step="500"></div><div class="actions"><button class="btn btn-ghost" onclick="closeModal()">تراجع</button><button class="btn btn-primary" onclick="setFinalPrice(\''+id+'\')">✓ ثبّت السعر</button></div>');
}
function setFinalPrice(id){
  const o=orderById(id); if(!o) return;
  const v=parseInt($('fpVal').value);
  if(!v||v<1000){ toast('أدخل سعراً صحيحاً'); return; }
  o.finalPrice=v; o.priceConfirmed=false;
  notify(o.customerId,'💰','مقدم الخدمة حدد السعر النهائي للطلب '+id+': '+fmt(v)+' د.ع — بانتظار موافقتك',id);
  save(); closeModal(); toast('✓ ثبّت السعر — بانتظار موافقة الزبون'); renderOrder(id);
}
function advanceOrder(id){
  const u=me(); const o=orderById(id); if(!o||!u) return;
  if(o.status==='accepted'&&o.finalPrice!=null&&!o.priceConfirmed){ toast('⚠️ الزبون لازم يوافق على السعر النهائي أولاً'); return; }
  const i=STATUS_ORDER.indexOf(o.status);
  if(i<0||i>=STATUS_ORDER.length-1) return;
  o.status=STATUS_ORDER[i+1];
  o.timeline.push({s:o.status,at:Date.now()});
  if(o.status==='done'){
    o.doneAt=Date.now();
    const p=userById(o.providerId);
    if(p&&p.provider){ p.provider.jobs++; p.provider.balance+=earningsOf(o).net; }
    notify(o.customerId,'🎉','طلبك '+id+' اكتمل! قيّم الخدمة وادفع '+fmt(orderPrice(o))+' د.ع '+(o.payMethod==='wallet'?'بالمحفظة':'كاش'),id);
  } else {
    notify(o.customerId,'🔔','تحديث الطلب '+id+': '+stInfo(o.status).label,id);
  }
  save(); toast('✓ تم تحديث حالة الطلب');
  renderOrder(id); renderHeader(currentRoute().name);
}
function reorder(id){
  const o=orderById(id); if(!o) return;
  bookState={ step:2, serviceId:o.serviceId, desc:o.desc, area:o.area, address:o.address, when:'now', whenTime:'', pay:o.payMethod||'cash' };
  go('#/book');
}
function openDispute(id){
  const o=orderById(id); if(!o) return;
  modal('<h3>⚖️ فتح نزاع — '+id+'</h3><p>اشرح المشكلة بوضوح. يوصل إشعار فوري للإدارة وتتدخل لحلها — الدردشة وسجل الطلب مرجع الحسم.</p><div class="field"><label>وصف المشكلة</label><textarea id="dispText" rows="3" placeholder="مثلاً: المقدم ما حضر بالوقت المتفق عليه…"></textarea></div><div class="actions"><button class="btn btn-ghost" onclick="closeModal()">تراجع</button><button class="btn btn-danger" onclick="submitDispute(\''+id+'\')">إرسال للإدارة</button></div>');
}
function submitDispute(id){
  const u=me(); const o=orderById(id); if(!o||!u) return;
  const text=$('dispText').value.trim();
  if(text.length<5){ toast('اكتب وصف المشكلة'); return; }
  o.disputed=true;
  DB.tickets.unshift({ id:'T-'+(DB.meta.ticketSeq++), userId:u.id, orderId:id, subject:'نزاع على الطلب '+id, status:'open', at:Date.now(), msgs:[{from:u.id,text,at:Date.now()}] });
  notifyAdmins('⚖️','نزاع جديد على الطلب '+id+' من '+u.name,id);
  save(); closeModal(); toast('⚖️ وصل نزاعك للإدارة — نراجعه بأسرع وقت'); renderOrder(id);
}

/* ---------- 15) لوحة الزبون ---------- */
function renderAccount(tab){
  const u=me(); if(!u){ requireAuth('#/account'); return; }
  tab=tab||'orders';
  const mine=DB.orders.filter(o=>o.customerId===u.id);
  const active=mine.filter(o=>['pending','accepted','enroute','started'].includes(o.status));
  const history=mine.filter(o=>['done','cancelled'].includes(o.status));
  const spent=mine.filter(o=>o.status==='done').reduce((s,o)=>s+orderPrice(o),0);
  const rated=mine.filter(o=>o.review).length;

  let content='';
  if(tab==='orders'){
    content='<h3 style="font-size:18px;font-weight:900;margin-bottom:14px">⚡ طلبات جارية ('+active.length+')</h3>';
    content+=active.length? active.map(o=>orderRow(o,true)).join('') : '<div class="empty card"><span class="ic">📭</span>ماكو طلبات جارية — اطلب خدمتك الأولى!<br><button class="btn btn-primary" style="margin-top:14px" onclick="go(\'#/book\')">اطلب خدمة</button></div>';
    content+='<h3 style="font-size:18px;font-weight:900;margin:28px 0 14px">🗂️ السجل ('+history.length+')</h3>';
    content+=history.length? history.map(o=>orderRow(o,false)).join('') : '<div class="empty card"><span class="ic">🧾</span>ماكو طلبات سابقة بعد.</div>';
  } else if(tab==='profile'){
    const areasList=(DB&&DB.settings&&DB.settings.areas)?DB.settings.areas:DEF_AREAS;
    content='<div class="card"><h4 style="font-size:17px;font-weight:900;margin-bottom:18px">✏️ تعديل ملفي</h4>'
      +'<div class="grid grid-2" style="gap:12px">'
      +'<div class="field"><label>الاسم الكامل</label><input id="pfName" value="'+esc(u.name)+'"></div>'
      +'<div class="field"><label>رقم الهاتف</label><input id="pfPhone" value="'+esc(u.phone)+'" maxlength="15"></div>'
      +'</div>'
      +'<div class="field">'
      +'<label>منطقتك بالناصرية (اكتب اسم منطقتك أو اختر من المقترحات)</label>'
      +'<input id="pfArea" value="'+esc(u.area)+'" placeholder="اكتب اسم منطقتك بالناصرية (مثلاً: شارع 40 / الحبوبي / الشموخ)">'
      +'<div class="area-cloud" style="margin-top:8px">'
      +['الحبوبي / المركز', 'شارع 40', 'الإدارة المحلية', 'حي المعلمين', 'حي الحسين', 'حي الشموخ', 'حي سومر', 'صوب الشامية', 'صوب الجزيرة'].map(a=>'<button type="button" class="area-tag '+(u.area===a?'active':'')+'" onclick="$(\'pfArea\').value=\''+a+'\'">'+a+'</button>').join('')
      +'</div></div>'
      +'<button class="btn btn-primary btn-sm" onclick="saveProfile()">✓ حفظ التعديلات</button></div>'
      +'<div class="card" style="margin-top:16px"><h4 style="font-size:17px;font-weight:900;margin-bottom:18px">🔑 تغيير كلمة المرور</h4>'
      +'<div class="grid grid-2" style="gap:12px">'
      +'<div class="field"><label>كلمة المرور الحالية</label><input id="pwOld" type="password" placeholder="••••••••"></div>'
      +'<div class="field"><label>الجديدة (6+ أحرف)</label><input id="pwNew" type="password" placeholder="••••••••"></div>'
      +'</div><button class="btn btn-outline btn-sm" onclick="changePass()">تغيير كلمة المرور</button></div>'
      +'<div class="card" style="margin-top:16px;border:1.5px solid rgba(220,38,38,.3);background:rgba(220,38,38,.02)"><h4 style="font-size:16px;font-weight:900;color:var(--danger);margin-bottom:8px">🚨 منطقة الخطر — إدارة الحساب</h4><p style="font-size:13.5px;color:var(--muted);margin-bottom:14px">عند حذف الحساب، سيتم إزالة ملفك وسجلاتك نهائياً من المنصة.</p><button class="btn btn-danger btn-sm" onclick="askDeleteAccount()">🗑️ طلب حذف الحساب نهائياً</button></div>';
  }

  $('accountRoot').innerHTML=`
  <div class="page-head"><h1>📋 لوحة <span class="hl">الزبون</span></h1><p>طلباتك، أرصدتك، وملفك — كل شيء مسجّل وحقيقي.</p></div>
  <div class="panel">
    <aside class="pside">
      <div class="avatar">${initials(u.name)}</div>
      <h3>${esc(u.name)}</h3>
      <div class="role">📞 ${esc(u.phone)} · 📍 ${esc(u.area)}</div>
      <div class="chips"><span class="chip chip-gray">زبون منذ ${fmtD(u.createdAt)}</span></div>
      <button class="btn btn-outline btn-sm btn-block" onclick="go('#/book')">＋ طلب جديد</button>
      <button class="btn btn-ghost btn-sm btn-block" style="margin-top:9px" onclick="go('#/support')">🎧 الدعم والتذاكر</button>
    </aside>
    <div>
      <div class="stat-cards">
        <div class="stat-card"><b>${active.length}</b><span>طلب جاري</span></div>
        <div class="stat-card"><b>${mine.filter(o=>o.status==='done').length}</b><span>طلب مكتمل</span></div>
        <div class="stat-card"><b>${fmt(spent)}</b><span>د.ع مجموع المدفوع</span></div>
        <div class="stat-card"><b>${rated}</b><span>تقييم أرسلته</span></div>
      </div>
      <div class="ptabs">
        <button class="ptab ${tab==='orders'?'active':''}" onclick="go('#/account/orders')">📦 طلباتي</button>
        <button class="ptab ${tab==='profile'?'active':''}" onclick="go('#/account/profile')">👤 ملفي وكلمة المرور</button>
      </div>
      ${content}
    </div>
  </div>`;
}
function orderRow(o, live){
  const s=svc(o.serviceId); const st=stInfo(o.status);
  const p=o.providerId?userById(o.providerId):null;
  const chipCls=o.status==='done'?'chip-green':o.status==='cancelled'?'chip-red':o.status==='pending'?'chip-amber':'chip-dark';
  return '<div class="req-card"><div class="top"><div class="ic">'+(s?s.icon:'🧰')+'</div>'
    +'<div><b>'+(s?s.name:'خدمة')+' <span class="chip '+chipCls+'" style="font-size:11px;padding:2px 9px">'+st.icon+' '+st.label+'</span>'+(o.disputed?' <span class="chip chip-red" style="font-size:11px;padding:2px 9px">⚖️ نزاع</span>':'')+'</b>'
    +'<span>'+o.id+' · '+esc(o.area||'')+' · '+fmtD(o.createdAt)+(p?' · '+esc(p.name):'')+(o.review?' · ⭐ '+o.review.stars+'/5':'')+'</span></div>'
    +'<div class="price">'+fmt(orderPrice(o))+' د.ع</div></div>'
    +'<div class="actions"><button class="btn btn-ghost btn-sm" onclick="go(\'#/order/'+o.id+'\')">التفاصيل ←</button>'
    +(o.status==='done'&&!o.review?'<button class="btn btn-primary btn-sm" onclick="go(\'#/order/'+o.id+'\')">⭐ قيّم الآن</button>':'')
    +(o.status==='done'?'<button class="btn btn-outline btn-sm" onclick="reorder(\''+o.id+'\')">↺ أعد الطلب</button>':'')
    +'</div></div>';
}
function saveProfile(){
  const u=me(); if(!u) return;
  const name=$('pfName').value.trim(), phone=$('pfPhone').value.replace(/\s/g,''), area=$('pfArea').value;
  if(name.length<2){ toast('اكتب اسمك'); return; }
  if(!validPhone(phone)){ toast('📱 رقم هاتف غير صحيح'); return; }
  if(DB.users.some(x=>x.phone===phone&&x.id!==u.id)){ toast('⚠️ الرقم مستخدم بحساب آخر'); return; }
  u.name=name; u.phone=phone; u.area=area; save(); toast('✓ تم حفظ ملفك'); renderAccount('profile'); renderHeader(currentRoute().name);
}
function changePass(){
  const u=me(); if(!u) return;
  if(u.pass!==hash($('pwOld').value)){ toast('⚠️ كلمة المرور الحالية غلط'); return; }
  if($('pwNew').value.length<6){ toast('🔑 الجديدة 6 أحرف على الأقل'); return; }
  u.pass=hash($('pwNew').value); save(); toast('✓ تغيّرت كلمة المرور'); renderAccount('profile');
}

/* ---------- 16) لوحة مقدم الخدمة ---------- */
function checkPvfServiceLimit(el){
  const allChecks = Array.from(document.querySelectorAll('.pvfServiceCheck'));
  const count = allChecks.filter(c => c.checked).length;
  const badge = $('pvfSvcCountBadge');
  if(badge) badge.textContent = count + ' / 3 محددة';
  if(count > 3){
    if(el) el.checked = false;
    toast('⚠️ يمكنك اختيار 3 خدمات كحد أقصى');
    const newCount = allChecks.filter(c => c.checked).length;
    if(badge) badge.textContent = newCount + ' / 3 محددة';
  }
  allChecks.forEach(c => {
    const pill = c.closest('.svc-pick-pill');
    if(pill) pill.classList.toggle('active', c.checked);
  });
}
function renderProvider(tab){
  const u=me();
  if(!u){ requireAuth('#/provider'); return; }
  if(u.role!=='provider'){ go('#/account'); return; }
  if(!u.provider){
    u.provider = {
      serviceId: 's1', serviceIds: ['s1'], exp: 3, areas: ['كل الناصرية', u.area || 'الناصرية'],
      verified: 'pending', avail: true, ratingSum: 0, ratingCount: 0,
      jobs: 0, balance: 0, settled: 0, sensitive: false
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

  // Multi-service matching: order matches ANY of the provider's active services
  const incoming = orders.filter(o => o && o.status === 'pending'
    && (myServiceIds.includes(o.serviceId))
    && (u.provider.areas.includes('كل الناصرية') || u.provider.areas.includes(o.area))
    && !(Array.isArray(o.rejectedBy) && o.rejectedBy.includes(u.id)) && o.customerId !== u.id);
  const active = orders.filter(o => o && o.providerId === u.id && ['accepted','enroute','started'].includes(o.status));
  const done = orders.filter(o => o && o.providerId === u.id && o.status === 'done');
  const allMyOrders = orders.filter(o => o && o.providerId === u.id);
  const myPayouts = payouts.filter(p => p && p.providerId === u.id);
  const monthNet = done.filter(o => {
    const t = new Date((o && (o.doneAt || o.createdAt)) || Date.now());
    const d = new Date();
    return t.getMonth() === d.getMonth() && t.getFullYear() === d.getFullYear();
  }).reduce((sum, o) => sum + ((earningsOf(o) && earningsOf(o).net) || 0), 0);
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
        +'<button class="btn btn-ghost btn-sm" onclick="rejectOrder(\''+o.id+'\')">✗ تجاهل</button></div></div>';
    });
  } else if(tab==='active'){
    content='<h3 style="font-size:18px;font-weight:900;margin-bottom:14px">🔨 طلباتي الجارية ('+active.length+')</h3>';
    if(!active.length) content+='<div class="empty card"><span class="ic">🧰</span>لا توجد طلبات جارية حالياً. يمكنك قبول طلب من قائمة الوارد.</div>';
    active.forEach(o=>{
      const os=svc(o.serviceId); const st=stInfo(o.status); const i=STATUS_ORDER.indexOf(o.status); const next=STATUS_ORDER[i+1];
      const cust=userById(o.customerId);
      content+='<div class="req-card" style="border:1.5px solid var(--border-strong)"><div class="top"><div class="ic">'+os.icon+'</div>'
        +'<div><b>'+os.name+' <span class="chip chip-dark" style="font-size:11px;padding:2px 9px">'+st.icon+' '+st.label+'</span>'+(o.priceConfirmed?' <span class="chip chip-green" style="font-size:11px;padding:2px 9px">✓ سعر مؤكد</span>':' <span class="chip chip-amber" style="font-size:11px;padding:2px 9px">⏳ بانتظار موافقة السعر</span>')+'</b>'
        +'<span>'+o.id+' · '+esc(o.area||'')+(o.address?' — '+esc(o.address):'')+' · '+whenText(o)+' · الزبون: '+esc(cust?cust.name:'—')+'</span></div>'
        +'<div class="price">'+fmt(orderPrice(o))+' د.ع</div></div>'
        +'<div class="actions" style="gap:8px;flex-wrap:wrap">'
        +(next?'<button class="btn btn-primary btn-sm" onclick="advanceOrder(\''+o.id+'\')">'+(next==='done'?'🎉 إكمال الخدمة بنجاح':'التالي: '+stInfo(next).label)+'</button>':'')
        +(o.status==='accepted'?'<button class="btn btn-outline btn-sm" onclick="setFinalPriceAsk(\''+o.id+'\')">💰 تحديد السعر النهائي</button>':'')
        +(cust&&cust.phone?'<a class="btn btn-ghost btn-sm" href="tel:'+esc(cust.phone)+'">📞 اتصال بالزبون</a>':'')
        +'<button class="btn btn-ghost btn-sm" onclick="go(\'#/order/'+o.id+'\')">💬 الدردشة والتفاصيل ←</button></div></div>';
    });
  } else if(tab==='earnings'){
    const minP=(DB&&DB.settings&&DB.settings.minPayout)||10000;
    const canPayout=(u.provider.balance||0)>=minP;
    content='<div class="card" style="margin-bottom:16px"><h4 style="font-size:17px;font-weight:900;margin-bottom:16px">💼 محفظتي المالية</h4>'
      +'<div class="detail-row"><span>رصيد قابل للتسوية الآن</span><b style="color:var(--ok);font-size:18px">'+fmt(u.provider.balance||0)+' د.ع</b></div>'
      +'<div class="detail-row"><span>صافي أرباح هذا الشهر</span><b>'+fmt(monthNet)+' د.ع</b></div>'
      +'<div class="detail-row"><span>مجموع المسوّى سابقاً</span><b>'+fmt(u.provider.settled||0)+' د.ع</b></div>'
      +'<div class="detail-row"><span>شريحة عمولتك الحالية</span><b>'+currentTierLabel(u)+'</b></div>'
      +'<div style="margin-top:16px"><button class="btn btn-primary btn-sm" '+(canPayout?'':'disabled')+' onclick="requestPayout()">طلب تسوية'+(canPayout?' ('+fmt(u.provider.balance)+' د.ع)':' — الحد الأدنى '+fmt(minP)+' د.ع')+'</button></div>'
      +'<div class="hint" style="font-size:12px;color:var(--faint);margin-top:8px">التسوية تمر باعتماد الإدارة وتُحول لك مباشرة.</div></div>';
    content+='<h3 style="font-size:17px;font-weight:900;margin-bottom:14px">🧾 طلبات التسوية السابقة ('+myPayouts.length+')</h3>';
    content+=myPayouts.length? myPayouts.map(p=>'<div class="req-card"><div class="top"><div class="ic">💸</div><div><b>'+p.id+' <span class="chip '+(p.status==='paid'?'chip-green':'chip-amber')+'" style="font-size:11px;padding:2px 9px">'+(p.status==='paid'?'✓ مدفوعة':'⏳ قيد الاعتماد')+'</span></b><span>'+fmtDT(p.at)+(p.paidAt?' · دُفعت '+fmtDT(p.paidAt):'')+'</span></div><div class="price">'+fmt(p.amount)+' د.ع</div></div></div>').join('')
      :'<div class="empty card"><span class="ic">🧾</span>لا توجد تسويات بعد.</div>';
    content+='<h3 style="font-size:17px;font-weight:900;margin:26px 0 14px">✅ آخر الطلبات المكتملة وتفاصيل العمولات</h3>';
    content+=done.length? done.slice(0,8).map(o=>{ const e=earningsOf(o); return '<div class="req-card"><div class="top"><div class="ic">'+svc(o.serviceId).icon+'</div><div><b>'+svc(o.serviceId).name+'</b><span>'+o.id+' · '+esc(o.area||'')+' · '+fmtD(o.doneAt||o.createdAt)+(o.review?' · ⭐ '+o.review.stars+'/5':'')+'</span></div><div style="margin-inline-start:auto;text-align:left"><b style="color:var(--ok)">+'+fmt(e.net)+' د.ع</b><br><span style="font-size:11.5px;color:var(--muted)">عمولة '+e.rate+'% (−'+fmt(e.commission)+')</span></div></div></div>'; }).join('')
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

  $('providerRoot').innerHTML=`
  <div class="page-head"><h1>🧑‍🔧 لوحة <span class="hl">مقدم الخدمة</span></h1><p>استقبل الطلبات المطابقة لمهنك (${myServiceIds.length} مهن)، أنجزها، وتابع أرباحك.</p></div>
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
      </div>
      <div class="switch"><b>متاح لاستقبال الطلبات</b><button class="toggle ${u.provider.avail?'on':''}" onclick="toggleAvail()" ${verified?'':'disabled'} aria-label="التوفر"></button></div>
      <button class="btn btn-ghost btn-sm btn-block" onclick="go('#/support')">🎧 تواصل مع الإدارة</button>
    </aside>
    <div>
      <div class="stat-cards">
        <div class="stat-card"><b>${incoming.length}</b><span>طلب وارد</span></div>
        <div class="stat-card"><b>${active.length}</b><span>طلب جاري</span></div>
        <div class="stat-card"><b>${fmt(u.provider.balance||0)}</b><span>د.ع رصيد قابل للتسوية</span></div>
        <div class="stat-card"><b>${provRatingTxt(u)}</b><span>تقييمك (${u.provider.ratingCount||0})</span></div>
      </div>
      <div class="ptabs">
        <button class="ptab ${tab==='incoming'?'active':''}" onclick="go('#/provider/incoming')">📥 الوارد (${incoming.length})</button>
        <button class="ptab ${tab==='active'?'active':''}" onclick="go('#/provider/active')">🔨 الجارية (${active.length})</button>
        <button class="ptab ${tab==='earnings'?'active':''}" onclick="go('#/provider/earnings')">💼 الأرباح والتسويات</button>
        <button class="ptab ${tab==='reviews'?'active':''}" onclick="go('#/provider/reviews')">⭐ التقييمات (${reviews.length})</button>
        <button class="ptab ${tab==='history'?'active':''}" onclick="go('#/provider/history')">📦 سجل الطلبات (${allMyOrders.length})</button>
        <button class="ptab ${tab==='profile'?'active':''}" onclick="go('#/provider/profile')">👤 ملفي والإعدادات</button>
      </div>
      ${content}
    </div>
  </div>`;
}
function currentTierLabel(u){
  const c=DB.settings.commission;
  const m=monthDoneOrders(u);
  if(m>=DB.settings.eliteAt) return c.elite+'% — نخبة ('+m+' طلب هذا الشهر)';
  if(m>=DB.settings.loyalAt) return c.loyal+'% — ولاء ('+m+' طلب هذا الشهر)';
  return c.standard+'% — قياسي ('+m+' طلب هذا الشهر)';
}
function toggleAvail(){
  const u=me(); if(!u||!u.provider) return;
  if(u.provider.verified!=='verified'){ toast('⏳ ينتظر توثيق الإدارة'); return; }
  u.provider.avail=!u.provider.avail; save();
  toast(u.provider.avail?'✓ أنت متاح — الطلبات توصلك':'⏸️ أنت مشغول — ما توصلك طلبات');
  renderProvider(currentRoute().param||'incoming');
}
function acceptOrder(id){
  const u=me(); const o=orderById(id);
  if(!u||!u.provider||!o||o.status!=='pending'){ toast('⚠️ الطلب ما عاد متاحاً'); renderProvider('incoming'); return; }
  if(u.provider.verified!=='verified'){ toast('⏳ ينتظر توثيق الإدارة'); return; }
  if(!u.provider.avail){ toast('⏸️ فعّل التوفر أولاً'); return; }
  o.providerId=u.id; o.status='accepted';
  o.finalPrice=o.estimate; o.priceConfirmed=false;
  o.commissionRate=commissionRateFor(u, o);
  o.timeline.push({s:'accepted',at:Date.now()});
  notify(o.customerId,'✅','مقدم موثّق قبل طلبك '+id+': '+u.name+' — راجع السعر النهائي ووافق عليه',id);
  audit(u.name,'قبول الطلب '+id);
  save(); toast('✅ قبلت الطلب — ثبّت السعر النهائي إذا تريد تعديله');
  renderProvider('active'); renderHeader(currentRoute().name);
}
function rejectOrder(id){
  const u=me(); const o=orderById(id); if(!o||!u) return;
  o.rejectedBy.push(u.id); save(); toast('تم التجاهل — ما يظهر عندك مرة ثانية'); renderProvider('incoming');
}
function requestPayout(){
  const u=me(); if(!u||!u.provider) return;
  const amount=u.provider.balance;
  if(amount<DB.settings.minPayout){ toast('⚠️ الرصيد أقل من الحد الأدنى'); return; }
  const p={ id:'PO-'+(DB.meta.payoutSeq++), providerId:u.id, amount, status:'pending', at:Date.now(), paidAt:null };
  DB.payouts.unshift(p);
  u.provider.balance=0;
  notifyAdmins('💸','طلب تسوية جديد '+p.id+' من '+u.name+': '+fmt(amount)+' د.ع',null);
  audit(u.name,'طلب تسوية '+p.id+' بقيمة '+fmt(amount));
  save(); toast('💸 طلب التسوية وصل الإدارة — تعتمدها بأسرع وقت'); renderProvider('earnings');
}
function saveProviderProfile(){
  const u=me(); if(!u||!u.provider) return;
  const name=$('pvfName').value.trim(), phone=normalizePhone($('pvfPhone').value);
  const services = Array.from(document.querySelectorAll('.pvfServiceCheck:checked')).map(c=>c.value);
  const serviceId = services.length ? services[0] : (u.provider.serviceId || 's1');
  const exp=Math.max(0,parseInt($('pvfExp').value)||0);
  const areas=Array.from(document.querySelectorAll('.pvfArea:checked')).map(c=>c.value);
  if(name.length<2){ toast('اكتب اسمك'); return; }
  if(!validPhone(phone)){ toast('📱 رقم هاتف غير صحيح'); return; }
  if(DB.users.some(x=>x.phone===phone&&x.id!==u.id)){ toast('⚠️ الرقم مستخدم بحساب آخر'); return; }
  if(!areas.length){ toast('📍 اختر منطقة واحدة على الأقل'); return; }
  if(!services.length){ toast('🧰 اختر خدمة واحدة على الأقل'); return; }
  if(services.length > 3){ toast('⚠️ يمكنك اختيار 3 خدمات كحد أقصى'); return; }
  
  const newSvc=svc(serviceId);
  u.name=name; u.phone=phone; u.provider.serviceId=serviceId; u.provider.serviceIds=services; u.provider.exp=exp; u.provider.areas=areas;
  if(newSvc&&newSvc.sensitive&&!u.provider.sensitive){ u.provider.sensitive=true; u.provider.verified='pending'; notifyAdmins('🛡️',u.name+' غيّر خدمته إلى خدمة حساسة — يحتاج إعادة توثيق',null); toast('🛡️ خدمة حساسة — حسابك رجع لقائمة التوثيق'); }
  else toast('✓ تم حفظ ملفك (' + services.length + ' مهن)');
  save(); renderProvider('profile'); renderHeader(currentRoute().name);
}

/* ---------- 17) لوحة الإدارة ---------- */
function renderAdmin(tab){
  const u=me(); if(!u||u.role!=='admin'){ window._authNext='#/admin'; go('#/auth/login'); return; }
  tab=tab||'dash';
  const customers=DB.users.filter(x=>x.role==='customer');
  const provs=DB.users.filter(x=>x.role==='provider');
  const pendVerify=provs.filter(x=>x.provider.verified==='pending');
  const openTickets=DB.tickets.filter(t=>t.status==='open');
  const pendPayouts=DB.payouts.filter(p=>p.status==='pending');
  const byStatus=k=>DB.orders.filter(o=>o.status===k).length;

  let content='';
  if(tab==='dash'){
    content='<div class="stat-cards" style="grid-template-columns:repeat(4,1fr)">'
      +'<div class="stat-card"><b>'+DB.orders.length+'</b><span>إجمالي الطلبات</span></div>'
      +'<div class="stat-card"><b>'+fmt(gmv())+'</b><span>د.ع قيمة الطلبات (GMV)</span></div>'
      +'<div class="stat-card"><b style="color:var(--ok)">'+fmt(platformRevenue())+'</b><span>د.ع إيراد المنصة</span></div>'
      +'<div class="stat-card"><b>'+openTickets.length+'</b><span>تذكرة مفتوحة</span></div></div>'
      +'<div class="grid grid-2" style="gap:16px">'
      +'<div class="card"><h4 style="font-size:16px;font-weight:900;margin-bottom:14px">📊 الطلبات حسب الحالة</h4>'
      +STATUSES.map(st=>{ const c=byStatus(st.key); const pct=DB.orders.length?Math.round(c/DB.orders.length*100):0;
        return '<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:5px"><span>'+st.icon+' '+st.label+'</span><b>'+c+'</b></div><div style="height:8px;background:var(--surface2);border-radius:99px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:var(--grad-ink);border-radius:99px"></div></div></div>'; }).join('')
      +'<div style="margin-bottom:4px"><div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:5px"><span>🚫 ملغية</span><b>'+byStatus('cancelled')+'</b></div><div style="height:8px;background:var(--surface2);border-radius:99px;overflow:hidden"><div style="height:100%;width:'+(DB.orders.length?Math.round(byStatus('cancelled')/DB.orders.length*100):0)+'%;background:var(--danger);border-radius:99px"></div></div></div></div>'
      +'<div class="card"><h4 style="font-size:16px;font-weight:900;margin-bottom:14px">⚡ يحتاج إجراءك الآن</h4>'
      +(pendVerify.length?'<div class="detail-row"><span>🛡️ توثيق مقدمين</span><b>'+pendVerify.length+' بانتظار — <a style="text-decoration:underline;cursor:pointer" onclick="go(\'#/admin/verify\')">راجعهم</a></b></div>':'')
      +(pendPayouts.length?'<div class="detail-row"><span>💸 تسويات</span><b>'+pendPayouts.length+' بانتظار — <a style="text-decoration:underline;cursor:pointer" onclick="go(\'#/admin/finance\')">اعتمدها</a></b></div>':'')
      +(openTickets.length?'<div class="detail-row"><span>🎧 تذاكر ونزاعات</span><b>'+openTickets.length+' مفتوحة — <a style="text-decoration:underline;cursor:pointer" onclick="go(\'#/admin/tickets\')">رد عليها</a></b></div>':'')
      +(!pendVerify.length&&!pendPayouts.length&&!openTickets.length?'<div class="empty" style="padding:26px"><span class="ic">✅</span>كل شي تحت السيطرة — ماكو إجراءات معلقة.</div>':'')
      +'<div class="detail-row" style="margin-top:8px"><span>👥 المستخدمون</span><b>'+customers.length+' زبون · '+provs.filter(x=>x.provider.verified==='verified').length+' مقدم موثّق · '+pendVerify.length+' قيد التوثيق</b></div>'
      +'</div></div>';
  }
  else if(tab==='verify'){
    const vTab = window._admVerifyTab || 'pending';
    const verified = provs.filter(x => x.provider && x.provider.verified === 'verified');
    const rejected = provs.filter(x => x.provider && x.provider.verified === 'rejected');
    const pending = provs.filter(x => x.provider && (x.provider.verified === 'pending' || !x.provider.verified));
    
    let activeList = [];
    if(vTab === 'pending') activeList = pending;
    else if(vTab === 'verified') activeList = verified;
    else if(vTab === 'rejected') activeList = rejected;
    else activeList = provs;

    content = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
      <h3 style="font-size:20px;font-weight:900">🛡️ إدارة وتوثيق مقدمي الخدمة (${provs.length})</h3>
    </div>
    <div class="ptabs" style="margin-bottom:18px">
      <button class="ptab ${vTab==='pending'?'active':''}" onclick="window._admVerifyTab='pending';renderAdmin('verify')">⏳ بانتظار التوثيق (${pending.length})</button>
      <button class="ptab ${vTab==='verified'?'active':''}" onclick="window._admVerifyTab='verified';renderAdmin('verify')">✓ الموثقون (${verified.length})</button>
      <button class="ptab ${vTab==='rejected'?'active':''}" onclick="window._admVerifyTab='rejected';renderAdmin('verify')">🚫 المرفوضون (${rejected.length})</button>
      <button class="ptab ${vTab==='all'?'active':''}" onclick="window._admVerifyTab='all';renderAdmin('verify')">👥 الكل (${provs.length})</button>
    </div>`;

    if(!activeList.length){
      content += `<div class="empty card"><span class="ic">🛡️</span>لا يوجد مقدمون في هذا القسم حالياً.</div>`;
    } else {
      activeList.forEach(p => {
        const ps = svc(p.provider.serviceId);
        const isPend = p.provider.verified === 'pending' || !p.provider.verified;
        const isVer = p.provider.verified === 'verified';
        const isRej = p.provider.verified === 'rejected';

        const statusBadge = isVer ? '<span class="stamp" style="font-size:11px;padding:2px 9px">✓ موثّق</span>'
          : isPend ? '<span class="chip chip-amber" style="font-size:11px;padding:2px 9px">⏳ بانتظار التوثيق</span>'
          : '<span class="chip chip-red" style="font-size:11px;padding:2px 9px">🚫 مرفوض</span>';

        const sensitiveBadge = p.provider.sensitive ? '<span class="chip chip-red" style="font-size:11px;padding:2px 9px">🛡️ خدمة حساسة — مقابلة إلزامية</span>' : '';

        const rejectBox = isRej ? `
          <div style="margin-top:10px;background:rgba(220,38,38,.07);border-right:3px solid var(--danger);padding:8px 12px;border-radius:6px;font-size:13px">
            <b style="color:var(--danger)">سبب الرفض:</b> ${esc(p.provider.rejectReason || 'لم يتم تسجيل سبب محدد')}
          </div>` : '';

        const noteBox = isVer && p.provider.adminNote ? `
          <div style="margin-top:10px;background:rgba(16,185,129,.07);border-right:3px solid var(--ok);padding:8px 12px;border-radius:6px;font-size:13px">
            <b style="color:var(--ok)">ملاحظة التوثيق:</b> ${esc(p.provider.adminNote)}
          </div>` : '';

        const areasList = Array.isArray(p.provider.areas) && p.provider.areas.length ? p.provider.areas.join('، ') : 'الناصرية';

        content += `
        <div class="req-card" style="margin-bottom:14px;border:1px solid var(--border)">
          <div class="top">
            <div class="avatar" style="cursor:pointer" onclick="showProviderModal('${p.id}')">${initials(p.name)}</div>
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                <b style="font-size:16px;cursor:pointer" onclick="showProviderModal('${p.id}')">${esc(p.name)}</b>
                ${statusBadge}
                ${sensitiveBadge}
              </div>
              <div style="font-size:13.5px;color:var(--muted)">
                ${ps ? ps.icon+' '+ps.name : 'خدمة'} · <b>${p.provider.exp||0}</b> سنوات خبرة · 📞 <a href="tel:${esc(p.phone)}" style="color:var(--ink);text-decoration:underline">${esc(p.phone)}</a> · 📍 ${esc(areasList)} · انضم ${timeAgo(p.createdAt)}
              </div>
              ${rejectBox}
              ${noteBox}
            </div>
          </div>
          <div class="actions" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button class="btn btn-ghost btn-sm" onclick="showProviderModal('${p.id}')">🔍 تفاصيل الملف الكامل</button>
            ${!isVer ? `<button class="btn btn-primary btn-sm" onclick="askVerifyProvider('${p.id}')">✓ قبول وتوثيق</button>` : ''}
            ${!isRej ? `<button class="btn btn-danger btn-sm" onclick="askRejectProvider('${p.id}')">✗ رفض الطلب مع السبب</button>` : ''}
            ${isRej ? `
              <button class="btn btn-outline btn-sm" onclick="askVerifyProvider('${p.id}')">🔄 إعادة النظر وقبول</button>
              <button class="btn btn-ghost btn-sm" onclick="reconsiderProvider('${p.id}')">⏳ نقل لقائمة المراجعة</button>
            ` : ''}
            ${isVer ? `<button class="btn btn-ghost btn-sm" onclick="unverifyProvider('${p.id}')">⚠️ سحب التوثيق</button>` : ''}
          </div>
        </div>`;
      });
    }
  }
  else if(tab==='users'){
    content='<h3 style="font-size:18px;font-weight:900;margin-bottom:14px">👥 كل المستخدمين ('+DB.users.length+')</h3><div class="table-wrap"><table class="ptable">'
      +'<tr><th>الاسم</th><th>الدور والتوثيق</th><th>الهاتف</th><th>المنطقة</th><th>حالة الحساب</th><th>إجراءات الحساب والتوثيق</th></tr>'
      +DB.users.map(x=>{
        if(x.role==='admin') return '<tr><td><b>'+esc(x.name)+'</b><br><span style="font-size:11.5px;color:var(--muted)">'+x.id+'</span></td><td><span class="chip chip-dark">إدارة مدللني</span></td><td>'+esc(x.phone)+'</td><td>'+esc(x.area)+'</td><td><span class="chip chip-green">نشط</span></td><td>—</td></tr>';
        
        let provActions = '';
        if(x.role==='provider'){
          const pv = x.provider || {};
          if(pv.verified==='verified'){
            provActions = '<button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="askRejectProvider(\''+x.id+'\')">✗ رفض/سحب</button> ';
          } else if(pv.verified==='rejected'){
            provActions = '<button class="btn btn-primary btn-sm" onclick="askVerifyProvider(\''+x.id+'\')">✓ قبول وتوثيق</button> ';
          } else {
            provActions = '<button class="btn btn-primary btn-sm" onclick="askVerifyProvider(\''+x.id+'\')">✓ توثيق</button> ';
          }
        }

        const statusToggle = '<button class="btn '+(x.status==='active'?'btn-ghost':'btn-outline')+' btn-sm" onclick="toggleUserStatus(\''+x.id+'\')">'+(x.status==='active'?'🚫 إيقاف':'✅ تفعيل')+'</button> ';
        const delBtn = '<button class="btn btn-ghost btn-sm" title="حذف الحساب" style="color:var(--danger)" onclick="adminDeleteUser(\''+x.id+'\')">🗑️</button>';

        return '<tr><td><b>'+esc(x.name)+'</b><br><span style="font-size:11.5px;color:var(--muted)">'+x.id+' · '+fmtD(x.createdAt)+'</span></td>'
          +'<td><span class="chip '+(x.role==='provider'?'chip-gray':'chip-gray')+'">'+roleName(x.role)+'</span>'+(x.role==='provider'?(x.provider.verified==='verified'?'<br><span class="stamp" style="font-size:10px;padding:2px 8px;margin-top:4px">✓ موثّق</span>':x.provider.verified==='pending'?'<br><span class="chip chip-amber" style="font-size:10.5px;padding:2px 8px;margin-top:4px">⏳ قيد التوثيق</span>':'<br><span class="chip chip-red" style="font-size:10.5px;padding:2px 8px;margin-top:4px">🚫 مرفوض</span>'):'')+'</td>'
          +'<td>'+esc(x.phone)+'</td><td>'+esc(x.area)+'</td>'
          +'<td>'+(x.status==='active'?'<span class="chip chip-green">نشط</span>':'<span class="chip chip-red">موقوف</span>')+'</td>'
          +'<td style="white-space:nowrap">'+provActions+statusToggle+delBtn+'</td></tr>';
      }).join('')
      +'</table></div>';
  }
  else if(tab==='orders'){
    const f=window._admOrdF||'';
    let list=DB.orders.slice();
    if(f) list=list.filter(o=>o.status===f);
    content='<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap"><h3 style="font-size:18px;font-weight:900">🧾 كل الطلبات ('+list.length+')</h3>'
      +'<select onchange="window._admOrdF=this.value;renderAdmin(\'orders\')" style="height:42px;border:1.5px solid var(--border);border-radius:11px;padding:0 12px;font-weight:700"><option value="">كل الحالات</option>'
      +STATUSES.map(st=>'<option value="'+st.key+'" '+(f===st.key?'selected':'')+'>'+st.label+'</option>').join('')+'<option value="cancelled" '+(f==='cancelled'?'selected':'')+'>ملغية</option></select></div>';
    content+=list.length? '<div class="table-wrap"><table class="ptable"><tr><th>الطلب</th><th>الخدمة</th><th>الزبون</th><th>المقدم</th><th>الحالة</th><th>السعر</th><th></th></tr>'
      +list.map(o=>{ const s=svc(o.serviceId); const c=userById(o.customerId); const p=o.providerId?userById(o.providerId):null; const st=stInfo(o.status);
        return '<tr><td><b>'+o.id+'</b><br><span style="font-size:11.5px;color:var(--muted)">'+fmtD(o.createdAt)+'</span></td>'
        +'<td>'+(s?s.icon+' '+s.name:'—')+(o.disputed?'<br><span class="chip chip-red" style="font-size:10.5px;padding:2px 8px;margin-top:3px">⚖️ نزاع</span>':'')+'</td>'
        +'<td>'+esc(c?c.name:'—')+'</td><td>'+(p?esc(p.name):'<span style="color:var(--faint)">—</span>')+'</td>'
        +'<td><span class="chip '+(o.status==='done'?'chip-green':o.status==='cancelled'?'chip-red':o.status==='pending'?'chip-amber':'chip-dark')+'">'+st.icon+' '+st.label+'</span></td>'
        +'<td><b>'+fmt(orderPrice(o))+'</b></td>'
        +'<td><button class="btn btn-ghost btn-sm" onclick="go(\'#/order/'+o.id+'\')">فتح</button></td></tr>'; }).join('')+'</table></div>'
      :'<div class="empty card"><span class="ic">🧾</span>ماكو طلبات بهذه الحالة.</div>';
  }
  else if(tab==='finance'){
    content='<div class="stat-cards">'
      +'<div class="stat-card"><b>'+fmt(platformRevenue())+'</b><span>د.ع إيراد تراكمي</span></div>'
      +'<div class="stat-card"><b>'+fmt(gmv())+'</b><span>د.ع GMV</span></div>'
      +'<div class="stat-card"><b>'+fmt(DB.payouts.filter(p=>p.status==='paid').reduce((s,p)=>s+p.amount,0))+'</b><span>د.ع تسويات مدفوعة</span></div>'
      +'<div class="stat-card"><b>'+fmt(DB.payouts.filter(p=>p.status==='pending').reduce((s,p)=>s+p.amount,0))+'</b><span>د.ع تسويات معلقة</span></div></div>';
    content+='<h3 style="font-size:17px;font-weight:900;margin-bottom:14px">💸 طلبات التسوية</h3>';
    content+=DB.payouts.length? DB.payouts.map(p=>{ const pv=userById(p.providerId); return '<div class="req-card"><div class="top"><div class="ic">💸</div><div><b>'+p.id+' — '+esc(pv?pv.name:'?')+'</b><span>'+fmtDT(p.at)+(p.paidAt?' · دُفعت '+fmtDT(p.paidAt):'')+'</span></div><div class="price">'+fmt(p.amount)+' د.ع</div></div><div class="actions">'+(p.status==='pending'?'<button class="btn btn-primary btn-sm" onclick="payPayout(\''+p.id+'\')">✓ اعتماد الدفع (كاش/تحويل)</button>':'<span class="chip chip-green">✓ مدفوعة</span>')+'</div></div>'; }).join('')
      :'<div class="empty card"><span class="ic">💸</span>ماكو طلبات تسوية.</div>';
    const doneOrders=DB.orders.filter(o=>o.status==='done');
    content+='<h3 style="font-size:17px;font-weight:900;margin:26px 0 14px">🧮 آخر العمولات المحصلة</h3>';
    content+=doneOrders.length? '<div class="table-wrap"><table class="ptable"><tr><th>الطلب</th><th>السعر</th><th>الشريحة</th><th>العمولة</th><th>صافي المقدم</th></tr>'
      +doneOrders.slice(0,12).map(o=>{ const e=earningsOf(o); return '<tr><td><b>'+o.id+'</b></td><td>'+fmt(orderPrice(o))+'</td><td>'+e.rate+'%</td><td style="color:var(--ok);font-weight:800">'+fmt(e.commission)+'</td><td>'+fmt(e.net)+'</td></tr>'; }).join('')+'</table></div>'
      :'<div class="empty card"><span class="ic">🧮</span>لا عمولات بعد — تظهر بعد أول طلب مكتمل.</div>';
  }
  else if(tab==='catalog'){
    content='<h3 style="font-size:18px;font-weight:900;margin-bottom:14px">🧰 كتالوج الخدمات ('+DB.services.length+')</h3>';
    content+='<div class="card" style="margin-bottom:18px"><h4 style="font-size:16px;font-weight:900;margin-bottom:14px">➕ إضافة خدمة جديدة</h4>'
      +'<div class="grid grid-4" style="gap:12px">'
      +'<div class="field"><label>الأيقونة (إيموجي)</label><input id="csIcon" placeholder="🧰" maxlength="4"></div>'
      +'<div class="field"><label>اسم الخدمة</label><input id="csName" placeholder="مثلاً: تنظيف واجهات"></div>'
      +'<div class="field"><label>الفئة</label><select id="csCat">'+DB.cats.map(c=>'<option value="'+c.id+'">'+c.icon+' '+c.name+'</option>').join('')+'</select></div>'
      +'<div class="field"><label>الوحدة</label><input id="csUnit" placeholder="زيارة / جلسة / مهمة"></div>'
      +'<div class="field"><label>أقل سعر (د.ع)</label><input id="csMin" type="number" min="1000" step="500" placeholder="10000"></div>'
      +'<div class="field"><label>أعلى سعر (د.ع)</label><input id="csMax" type="number" min="1000" step="500" placeholder="50000"></div>'
      +'<div class="field"><label>الموجة</label><select id="csWave"><option value="1">1 — إطلاق</option><option value="2">2 — موسعة</option><option value="3">3 — ذهبية</option></select></div>'
      +'<div class="field"><label>الوصف</label><input id="csDesc" placeholder="وصف قصير"></div>'
      +'</div>'
      +'<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;font-size:13.5px;font-weight:700">'
      +'<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="csPop" style="width:auto;height:auto"> الأكثر طلباً</label>'
      +'<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="csSens" style="width:auto;height:auto"> خدمة حساسة (توثيق+مقابلة)</label>'
      +'</div>'
      +'<button class="btn btn-primary btn-sm" onclick="addService()">✓ أضف للكتالوج</button></div>';
    content+='<div class="table-wrap"><table class="ptable"><tr><th>الخدمة</th><th>الفئة</th><th>السعر</th><th>مقدمون موثّقون</th><th>الحالة</th><th>إجراء</th></tr>'
      +DB.services.map(s=>'<tr><td><b>'+s.icon+' '+esc(s.name)+'</b></td><td>'+catOf(s.cat).name+'</td><td>'+priceRange(s)+' /'+esc(s.unit)+'</td><td>'+providersCount(s.id)+'</td>'
        +'<td>'+(s.active!==false?'<span class="chip chip-green">فعّالة</span>':'<span class="chip chip-gray">معطّلة</span>')+'</td>'
        +'<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" onclick="toggleService(\''+s.id+'\')">'+(s.active!==false?'تعطيل':'تفعيل')+'</button> <button class="btn btn-danger btn-sm" onclick="delService(\''+s.id+'\')">حذف</button></td></tr>').join('')
      +'</table></div>';
  }
  else if(tab==='tickets'){
    content='<h3 style="font-size:18px;font-weight:900;margin-bottom:14px">🎧 التذاكر والنزاعات ('+DB.tickets.length+')</h3>';
    content+=DB.tickets.length? DB.tickets.map(t=>{ const tu=userById(t.userId); return '<div class="req-card"><div class="top"><div class="ic">'+(t.orderId?'⚖️':'🎧')+'</div><div><b>'+esc(t.subject)+' <span class="chip '+(t.status==='open'?'chip-amber':'chip-green')+'" style="font-size:11px;padding:2px 9px">'+(t.status==='open'?'مفتوحة':'مغلقة')+'</span></b><span>'+t.id+' · '+esc(tu?tu.name:'?')+' · '+timeAgo(t.at)+' · '+t.msgs.length+' رسالة</span></div></div><div class="actions"><button class="btn btn-primary btn-sm" onclick="go(\'#/support/'+t.id+'\')">فتح المحادثة ←</button>'+(t.status==='open'?'<button class="btn btn-ghost btn-sm" onclick="closeTicket(\''+t.id+'\')">إغلاق التذكرة</button>':'')+'</div></div>'; }).join('')
      :'<div class="empty card"><span class="ic">🎧</span>ماكو تذاكر — كل شي تمام.</div>';
  }
  else if(tab==='settings'){
    const c=DB.settings.commission;
    content='<div class="grid grid-2" style="gap:16px">'
      +'<div class="card"><h4 style="font-size:16px;font-weight:900;margin-bottom:16px">💰 شرائح العمولة (%)</h4>'
      +'<div class="grid grid-2" style="gap:12px">'
      +'<div class="field"><label>أول طلب مع زبون</label><input type="number" id="stFirst" value="'+c.first+'" min="0" max="40"></div>'
      +'<div class="field"><label>قياسي</label><input type="number" id="stStd" value="'+c.standard+'" min="0" max="40"></div>'
      +'<div class="field"><label>ولاء</label><input type="number" id="stLoyal" value="'+c.loyal+'" min="0" max="40"></div>'
      +'<div class="field"><label>نخبة</label><input type="number" id="stElite" value="'+c.elite+'" min="0" max="40"></div>'
      +'<div class="field"><label>توصيل ونقل</label><input type="number" id="stDeliv" value="'+c.delivery+'" min="0" max="40"></div>'
      +'<div class="field"><label>حد التسوية الأدنى (د.ع)</label><input type="number" id="stMinPay" value="'+DB.settings.minPayout+'" step="1000"></div>'
      +'<div class="field"><label>عتبة الولاء (طلب/شهر)</label><input type="number" id="stLoyalAt" value="'+DB.settings.loyalAt+'"></div>'
      +'<div class="field"><label>عتبة النخبة (طلب/شهر)</label><input type="number" id="stEliteAt" value="'+DB.settings.eliteAt+'"></div>'
      +'</div><button class="btn btn-primary btn-sm" onclick="saveSettings()">✓ حفظ الإعدادات</button></div>'
      +'<div class="card"><h4 style="font-size:16px;font-weight:900;margin-bottom:16px">📍 مناطق الناصرية المغطاة</h4>'
      +'<div class="field"><label>منطقة بكل سطر</label><textarea id="stAreas" rows="8">'+DB.settings.areas.join('\n')+'</textarea></div>'
      +'<button class="btn btn-primary btn-sm" onclick="saveAreas()">✓ حفظ المناطق</button>'
      +'<div class="note note-gray" style="margin-top:14px">تنعكس مباشرة على التسجيل والطلب والمطابقة.</div></div>'
      +'<div class="card"><h4 style="font-size:16px;font-weight:900;margin-bottom:16px">🔑 كلمة مرور الإدارة</h4>'
      +'<div class="grid grid-2" style="gap:12px"><div class="field"><label>الحالية</label><input type="password" id="admOld"></div><div class="field"><label>الجديدة</label><input type="password" id="admNew"></div></div>'
      +'<button class="btn btn-outline btn-sm" onclick="adminChangePass()">تغيير</button></div>'
      +'<div class="card"><h4 style="font-size:16px;font-weight:900;margin-bottom:14px">💾 البيانات</h4>'
      +'<p style="font-size:13.5px;color:var(--muted);margin-bottom:14px">نسخة احتياطية كاملة بصيغة JSON، أو استعادة من ملف، أو تصفير النظام للبدء من جديد.</p>'
      +'<div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn btn-outline btn-sm" onclick="exportData()">⬇️ تصدير نسخة احتياطية</button><label class="btn btn-ghost btn-sm" style="margin:0">⬆️ استعادة<input type="file" accept=".json" style="display:none" onchange="importData(event)"></label><button class="btn btn-danger btn-sm" onclick="resetAsk()">🗑️ تصفير النظام</button></div></div>'
      +'</div>';
  }
  else if(tab==='audit'){
    content='<h3 style="font-size:18px;font-weight:900;margin-bottom:14px">📜 سجل الأحداث ('+DB.audit.length+')</h3>';
    content+=DB.audit.length? DB.audit.slice(0,60).map(a=>'<div class="req-card" style="padding:14px 18px"><div style="display:flex;gap:11px;align-items:center"><span style="font-size:12px;color:var(--faint);white-space:nowrap">'+fmtDT(a.at)+'</span><span style="font-size:13.5px"><b>'+esc(a.who)+'</b> — '+esc(a.action)+'</span></div></div>').join('')
      :'<div class="empty card"><span class="ic">📜</span>السجل فارغ بعد.</div>';
  }

  $('adminRoot').innerHTML=`
  <div class="page-head"><h1>🛡️ لوحة <span class="hl">الإدارة</span></h1><p>تحكم كامل بالمنصة: توثيق، مستخدمين، طلبات، مالية، كتالوج، إعدادات.</p></div>
  <div class="ptabs" style="padding-bottom:4px">
    <button class="ptab ${tab==='dash'?'active':''}" onclick="go('#/admin/dash')">📊 القيادة</button>
    <button class="ptab ${tab==='verify'?'active':''}" onclick="go('#/admin/verify')">🛡️ التوثيق (${pendVerify.length})</button>
    <button class="ptab ${tab==='users'?'active':''}" onclick="go('#/admin/users')">👥 المستخدمون</button>
    <button class="ptab ${tab==='orders'?'active':''}" onclick="go('#/admin/orders')">🧾 الطلبات</button>
    <button class="ptab ${tab==='finance'?'active':''}" onclick="go('#/admin/finance')">💸 المالية (${pendPayouts.length})</button>
    <button class="ptab ${tab==='catalog'?'active':''}" onclick="go('#/admin/catalog')">🧰 الكتالوج</button>
    <button class="ptab ${tab==='tickets'?'active':''}" onclick="go('#/admin/tickets')">🎧 التذاكر (${openTickets.length})</button>
    <button class="ptab ${tab==='settings'?'active':''}" onclick="go('#/admin/settings')">⚙️ الإعدادات</button>
    <button class="ptab ${tab==='audit'?'active':''}" onclick="go('#/admin/audit')">📜 السجل</button>
  </div>
  <div style="padding-bottom:80px">${content}</div>`;
}
function verifyProvider(id){ const p=userById(id); if(!p||!p.provider) return; p.provider.verified='verified'; notify(p.id,'🎉','مبروك! الإدارة وثّقت حسابك — صار بإمكانك استقبال الطلبات',null); audit(me().name,'توثيق المقدم '+p.name); save(); toast('✓ تم توثيق '+p.name); renderAdmin('verify'); }
function rejectProvider(id){ const p=userById(id); if(!p||!p.provider) return; p.provider.verified='rejected'; notify(p.id,'🚫','طلب التوثيق مرفوض — تواصل مع الإدارة عبر الدعم لمعرفة السبب',null); audit(me().name,'رفض توثيق '+p.name); save(); toast('تم الرفض'); renderAdmin('verify'); }
function unverifyProvider(id){ const p=userById(id); if(!p||!p.provider) return; p.provider.verified='pending'; notify(p.id,'⏳','الإدارة أعادت حسابك لقائمة التوثيق',null); audit(me().name,'سحب توثيق '+p.name); save(); toast('تم سحب التوثيق'); renderAdmin('verify'); }
function toggleUserStatus(id){ const x=userById(id); if(!x) return; x.status=x.status==='active'?'suspended':'active'; notify(x.id, x.status==='active'?'✅':'🚫', x.status==='active'?'حسابك أعيد تفعيله':'حسابك أوقف — راجع الإدارة', null); audit(me().name,(x.status==='active'?'تفعيل':'إيقاف')+' حساب '+x.name); save(); toast('✓ تم'); renderAdmin('users'); }
function payPayout(id){ const p=DB.payouts.find(x=>x.id===id); if(!p) return; p.status='paid'; p.paidAt=Date.now(); const pv=userById(p.providerId); if(pv){ pv.provider.settled+=p.amount; notify(pv.id,'💸','تم اعتماد تسويتك '+p.id+': '+fmt(p.amount)+' د.ع — استلمها كاش/تحويل',null); } audit(me().name,'اعتماد تسوية '+p.id); save(); toast('✓ تم اعتماد الدفع'); renderAdmin('finance'); }
function addService(){
  const icon=$('csIcon').value.trim()||'🧰'; const name=$('csName').value.trim();
  const cat=$('csCat').value; const unit=$('csUnit').value.trim()||'خدمة';
  const min=parseInt($('csMin').value), max=parseInt($('csMax').value);
  const wave=parseInt($('csWave').value); const desc=$('csDesc').value.trim();
  if(name.length<3){ toast('اكتب اسم الخدمة'); return; }
  if(!min||!max||max<min){ toast('⚠️ تحقق من نطاق السعر'); return; }
  const id='s'+(Math.max(0,...DB.services.map(s=>parseInt(s.id.slice(1))||0))+1);
  DB.services.push({ id, icon, name, cat, min, max, unit, popular:$('csPop').checked, wave, active:true, sensitive:$('csSens').checked, gold:wave===3, desc:desc||name });
  audit(me().name,'إضافة خدمة: '+name); save(); toast('✓ انضافت الخدمة للكتالوج'); renderAdmin('catalog');
}
function toggleService(id){ const s=svc(id); if(!s) return; s.active=s.active===false?true:false; audit(me().name,(s.active?'تفعيل':'تعطيل')+' خدمة '+s.name); save(); toast('✓ تم'); renderAdmin('catalog'); }
function delService(id){
  const s=svc(id); if(!s) return;
  if(DB.orders.some(o=>o.serviceId===id)){ toast('⚠️ لا يمكن حذف خدمة عليها طلبات — عطّلها بدلاً من ذلك'); return; }
  DB.services=DB.services.filter(x=>x.id!==id);
  audit(me().name,'حذف خدمة '+s.name); save(); toast('🗑️ حُذفت الخدمة'); renderAdmin('catalog');
}
function saveSettings(){
  const c=DB.settings.commission;
  c.first=Math.min(40,Math.max(0,parseInt($('stFirst').value)||0));
  c.standard=Math.min(40,Math.max(0,parseInt($('stStd').value)||0));
  c.loyal=Math.min(40,Math.max(0,parseInt($('stLoyal').value)||0));
  c.elite=Math.min(40,Math.max(0,parseInt($('stElite').value)||0));
  c.delivery=Math.min(40,Math.max(0,parseInt($('stDeliv').value)||0));
  DB.settings.minPayout=Math.max(1000,parseInt($('stMinPay').value)||10000);
  DB.settings.loyalAt=Math.max(1,parseInt($('stLoyalAt').value)||11);
  DB.settings.eliteAt=Math.max(DB.settings.loyalAt+1,parseInt($('stEliteAt').value)||31);
  audit(me().name,'تعديل إعدادات العمولة'); save(); toast('✓ حُفظت الإعدادات — تطبق على الطلبات الجديدة'); renderAdmin('settings');
}
function saveAreas(){
  const lines=$('stAreas').value.split('\n').map(x=>x.trim()).filter(Boolean);
  if(lines.length<2){ toast('⚠️ أدخل منطقتين على الأقل'); return; }
  DB.settings.areas=lines; audit(me().name,'تعديل قائمة المناطق'); save(); toast('✓ حُفظت المناطق'); renderAdmin('settings');
}
function adminChangePass(){ const u=me(); if(u.pass!==hash($('admOld').value)){ toast('⚠️ كلمة المرور الحالية غلط'); return; } if($('admNew').value.length<6){ toast('6 أحرف على الأقل'); return; } u.pass=hash($('admNew').value); audit(u.name,'تغيير كلمة مرور الإدارة'); save(); toast('✓ تغيّرت'); renderAdmin('settings'); }
function exportData(){
  const blob=new Blob([JSON.stringify(DB,null,1)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='ur-backup-'+new Date().toISOString().slice(0,10)+'.json'; a.click();
  audit(me().name,'تصدير نسخة احتياطية'); toast('⬇️ نزّلت النسخة الاحتياطية');
}
function importData(ev){
  const f=ev.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=function(){ try{ const d=JSON.parse(r.result); if(!d.users||!d.meta) throw 0; DB=d; save(); toast('✓ تمت الاستعادة'); render(); }catch(e){ toast('⚠️ ملف غير صالح'); } };
  r.readAsText(f);
}
function resetAsk(){ modal('<h3>🗑️ تصفير النظام بالكامل؟</h3><p>سيتم حذف كل المستخدمين والطلبات والبيانات نهائياً والعودة للوضع الافتراضي (حساب الإدارة فقط). لا يمكن التراجع.</p><div class="actions"><button class="btn btn-ghost" onclick="closeModal()">تراجع</button><button class="btn btn-danger" onclick="closeModal();resetDB();toast(\'تم التصفير\');go(\'#/home\')">نعم، صفّر كل شي</button></div>'); }

/* ---------- 18) مركز الدعم والتذاكر ---------- */
function renderSupport(ticketId){
  const u=me(); if(!u){ requireAuth('#/support'); return; }
  if(ticketId){
    const t=DB.tickets.find(x=>x.id===ticketId);
    if(!t||(t.userId!==u.id&&u.role!=='admin')){ $('supportRoot').innerHTML='<div class="empty card" style="margin-top:50px"><span class="ic">🔍</span>التذكرة غير موجودة.</div>'; return; }
    const o=t.orderId?orderById(t.orderId):null;
    $('supportRoot').innerHTML=`
    <div class="page-head"><h1>${t.orderId?'⚖️':'🎧'} ${esc(t.subject)}</h1><p>${t.id} · فُتحت ${timeAgo(t.at)} · <span class="chip ${t.status==='open'?'chip-amber':'chip-green'}">${t.status==='open'?'مفتوحة':'مغلقة'}</span>${o?' · <a style="text-decoration:underline;cursor:pointer" onclick="go(\'#/order/'+o.id+'\')">الطلب '+o.id+'</a>':''}</p></div>
    <div class="card" style="max-width:760px;margin-bottom:80px">
      <div class="chat-list" id="chatList" style="max-height:420px">
        ${t.msgs.map(m=>{ const mu=userById(m.from); return '<div class="msg '+(m.from===u.id?'me':'them')+'"><b style="font-size:11.5px;opacity:.7;display:block;margin-bottom:3px">'+esc(mu?mu.name:'؟')+(mu&&mu.role==='admin'?' 🛡️':'')+'</b>'+esc(m.text)+'<time>'+timeAgo(m.at)+'</time></div>'; }).join('')}
      </div>
      ${t.status==='open'?'<div class="chat-box"><input id="tkInput" placeholder="اكتب ردك…" onkeydown="if(event.key===\'Enter\')replyTicket(\''+t.id+'\')"><button class="btn btn-primary btn-sm" onclick="replyTicket(\''+t.id+'\')">إرسال</button></div>'
      :'<div class="note note-gray" style="margin-top:12px">هذه التذكرة مغلقة.</div>'}
    </div>`;
    const cl=$('chatList'); if(cl) cl.scrollTop=cl.scrollHeight;
    return;
  }
  const mine=u.role==='admin'?DB.tickets:DB.tickets.filter(t=>t.userId===u.id);
  $('supportRoot').innerHTML=`
  <div class="page-head"><h1>🎧 مركز <span class="hl">الدعم</span></h1><p>أي مشكلة أو سؤال؟ افتح تذكرة والإدارة ترد عليك هنا مباشرة.</p></div>
  <div class="grid" style="grid-template-columns:1fr 1.2fr;gap:20px;padding-bottom:80px">
    <div class="card" style="align-self:start"><h4 style="font-size:17px;font-weight:900;margin-bottom:16px">➕ تذكرة جديدة</h4>
      <div class="field"><label>الموضوع</label><input id="tkSubject" placeholder="مثلاً: استفسار عن التسوية"></div>
      <div class="field"><label>التفاصيل</label><textarea id="tkBody" rows="4" placeholder="اشرح الموضوع بوضوح…"></textarea></div>
      <button class="btn btn-primary btn-sm btn-block" onclick="newTicket()">إرسال التذكرة</button>
      <div class="note note-gray" style="margin-top:14px">⚖️ عندك مشكلة بطلب معيّن؟ افتح النزاع من صفحة الطلب نفسها حتى يترابط معه.</div>
    </div>
    <div><h4 style="font-size:17px;font-weight:900;margin-bottom:14px">🗂️ تذاكري (${mine.length})</h4>
    ${mine.length? mine.map(t=>'<div class="req-card"><div class="top"><div class="ic">'+(t.orderId?'⚖️':'🎧')+'</div><div><b>'+esc(t.subject)+' <span class="chip '+(t.status==='open'?'chip-amber':'chip-green')+'" style="font-size:11px;padding:2px 9px">'+(t.status==='open'?'مفتوحة':'مغلقة')+'</span></b><span>'+t.id+' · '+timeAgo(t.at)+' · '+t.msgs.length+' رسالة</span></div></div><div class="actions"><button class="btn btn-ghost btn-sm" onclick="go(\'#/support/'+t.id+'\')">فتح المحادثة ←</button></div></div>').join('')
    :'<div class="empty card"><span class="ic">🎧</span>ماكو تذاكر — كل شي تمام!</div>'}</div>
  </div>`;
}
function newTicket(){
  const u=me(); if(!u) return;
  const subject=$('tkSubject').value.trim(), body=$('tkBody').value.trim();
  if(subject.length<3){ toast('اكتب الموضوع'); return; }
  if(body.length<5){ toast('اكتب التفاصيل'); return; }
  const t={ id:'T-'+(DB.meta.ticketSeq++), userId:u.id, orderId:null, subject, status:'open', at:Date.now(), msgs:[{from:u.id,text:body,at:Date.now()}] };
  DB.tickets.unshift(t);
  notifyAdmins('🎧','تذكرة جديدة: '+subject+' — من '+u.name,null);
  save(); toast('✓ وصلت تذكرتك للإدارة'); go('#/support/'+t.id);
}
function replyTicket(id){
  const u=me(); const t=DB.tickets.find(x=>x.id===id); if(!t||!u) return;
  const text=$('tkInput').value.trim(); if(!text) return;
  t.msgs.push({from:u.id,text,at:Date.now()});
  if(u.role==='admin'){ notify(t.userId,'🎧','رد من الإدارة على تذكرتك '+id+': '+text.slice(0,60),t.orderId); }
  else{ notifyAdmins('🎧','رد جديد على التذكرة '+id+' من '+u.name,t.orderId); }
  save(); renderSupport(id); renderHeader(currentRoute().name);
}
function closeTicket(id){ const t=DB.tickets.find(x=>x.id===id); if(!t) return; t.status='closed'; notify(t.userId,'✅','أُغلقت تذكرتك '+id,t.orderId); audit(me().name,'إغلاق التذكرة '+id); save(); toast('✓ أُغلقت'); renderAdmin('tickets'); }

function showProviderModal(id){
  const p=userById(id);
  if(!p||!p.provider){ toast('مقدم الخدمة غير موجود'); return; }
  const ps=svc(p.provider.serviceId);
  const isPending = p.provider.verified==='pending' || !p.provider.verified;
  const isVerified = p.provider.verified==='verified';
  const isRejected = p.provider.verified==='rejected';
  
  const statusBadge = isVerified ? '<span class="stamp" style="font-size:12px;padding:3px 10px">✓ موثّق</span>'
    : isPending ? '<span class="chip chip-amber" style="font-size:12px;padding:3px 10px">⏳ قيد المراجعة</span>'
    : '<span class="chip chip-red" style="font-size:12px;padding:3px 10px">🚫 مرفوض</span>';

  const sensBadge = p.provider.sensitive ? '<div class="banner banner-red" style="margin:12px 0;padding:10px 14px"><span class="ic">🛡️</span><div><b>خدمة حساسة — مقابلة إلزامية!</b><br>تتطلب هذه الخدمة مقابلة شخصية والتحقق من الهوية قبل الاعتماد.</div></div>' : '';

  const rejBanner = isRejected && p.provider.rejectReason ? `
    <div style="background:rgba(220,38,38,.07);border-right:3px solid var(--danger);padding:10px 14px;border-radius:8px;margin:12px 0">
      <div style="font-size:12.5px;font-weight:700;color:var(--danger);margin-bottom:3px">🚫 سبب الرفض المسجل:</div>
      <div style="font-size:14px;color:var(--ink)">${esc(p.provider.rejectReason)}</div>
    </div>` : '';

  const noteBanner = isVerified && p.provider.adminNote ? `
    <div style="background:rgba(16,185,129,.07);border-right:3px solid var(--ok);padding:10px 14px;border-radius:8px;margin:12px 0">
      <div style="font-size:12.5px;font-weight:700;color:var(--ok);margin-bottom:3px">📝 ملاحظة التوثيق:</div>
      <div style="font-size:14px;color:var(--ink)">${esc(p.provider.adminNote)}</div>
    </div>` : '';

  const areasHtml = Array.isArray(p.provider.areas) && p.provider.areas.length ?
    p.provider.areas.map(a=>'<span class="chip chip-gray" style="margin:2px 3px">'+esc(a)+'</span>').join('') : 'الناصرية';

  modal(`
    <div style="text-align:right">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
        <div class="avatar" style="width:52px;height:52px;font-size:20px">${initials(p.name)}</div>
        <div>
          <h3 style="font-size:20px;font-weight:900;margin:0 0 4px">${esc(p.name)}</h3>
          <div>${statusBadge} <span style="font-size:13px;color:var(--muted);margin-inline-start:6px">انضم منذ ${timeAgo(p.createdAt)}</span></div>
        </div>
      </div>

      ${sensBadge}
      ${rejBanner}
      ${noteBanner}

      <div class="grid grid-2" style="gap:10px;margin-top:14px">
        <div class="card" style="padding:12px 14px;background:var(--surface2)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:2px">📞 رقم الهاتف</div>
          <b style="font-size:15px;direction:ltr;display:inline-block"><a href="tel:${esc(p.phone)}" style="color:var(--ink);text-decoration:underline">${esc(p.phone)}</a></b>
        </div>
        <div class="card" style="padding:12px 14px;background:var(--surface2)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:2px">📍 المنطقة السكنية</div>
          <b style="font-size:15px">${esc(p.area||'الناصرية')}</b>
        </div>
        <div class="card" style="padding:12px 14px;background:var(--surface2)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:2px">🧰 المهنة / الخدمة</div>
          <b style="font-size:15px">${ps?ps.icon+' '+ps.name:'خدمة'} (${p.provider.exp||0} سنوات خبرة)</b>
        </div>
        <div class="card" style="padding:12px 14px;background:var(--surface2)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:2px">📊 الطلبات المنجزة والتقييم</div>
          <b style="font-size:15px">${p.provider.jobs||0} طلب · ⭐ ${provRatingTxt(p)}</b>
        </div>
      </div>

      <div style="margin-top:14px">
        <div style="font-size:13px;font-weight:700;margin-bottom:6px">مناطق التغطية المحددة (${(p.provider.areas||[]).length}):</div>
        <div>${areasHtml}</div>
      </div>

      <div class="actions" style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px;display:flex;gap:8px;flex-wrap:wrap">
        ${!isVerified ? '<button class="btn btn-primary btn-sm" onclick="askVerifyProvider(\''+p.id+'\')">✓ قبول وتوثيق الحساب</button>' : ''}
        ${!isRejected ? '<button class="btn btn-danger btn-sm" onclick="askRejectProvider(\''+p.id+'\')">✗ رفض الطلب مع السبب</button>' : ''}
        ${isRejected ? '<button class="btn btn-outline btn-sm" onclick="askVerifyProvider(\''+p.id+'\')">🔄 إعادة النظر والقبول</button><button class="btn btn-ghost btn-sm" onclick="reconsiderProvider(\''+p.id+'\')">⏳ نقل للمراجعة (معلق)</button>' : ''}
        ${isVerified ? '<button class="btn btn-ghost btn-sm" onclick="unverifyProvider(\''+p.id+'\')">⚠️ سحب التوثيق</button>' : ''}
        <button class="btn btn-ghost btn-sm" style="margin-inline-start:auto" onclick="closeModal()">إغلاق</button>
      </div>
    </div>
  `);
}

function askVerifyProvider(id){
  const p=userById(id);
  if(!p) return;
  const isSensitive = p.provider && p.provider.sensitive;
  modal(`
    <div style="text-align:right">
      <h3 style="font-size:19px;font-weight:900;margin-bottom:8px">✓ توثيق حساب: ${esc(p.name)}</h3>
      <p style="font-size:14px;color:var(--muted);margin-bottom:14px">سيتم اعتماد مقدم الخدمة فوراً ليصبح حسابه موثقاً وقادراً على استقبال وقبول طلبات العمل في مناطقه.</p>
      ${isSensitive ? '<div class="banner banner-amber" style="margin-bottom:14px"><span class="ic">⚠️</span><div><b>تنبيه خدمة حساسة:</b> تأكد من إتمام المقابلة والتحقق من الهوية قبل الاعتماد.</div></div>' : ''}
      <div class="field"><label>ملاحظة أو رسالة ترحيبية للمقدم (اختياري)</label><input id="vNoteInput" placeholder="مثلاً: تم التحقق والاعتماد بنجاح" value="تم التحقق والاعتماد بنجاح"></div>
      <div class="actions" style="margin-top:18px">
        <button class="btn btn-ghost" onclick="showProviderModal('${p.id}')">رجوع</button>
        <button class="btn btn-primary" onclick="verifyProvider('${p.id}', $('vNoteInput').value.trim())">✓ تأكيد التوثيق والقبول</button>
      </div>
    </div>
  `);
}

function askRejectProvider(id){
  const p=userById(id);
  if(!p) return;
  modal(`
    <div style="text-align:right">
      <h3 style="font-size:19px;font-weight:900;margin-bottom:8px;color:var(--danger)">🚫 رفض طلب توثيق: ${esc(p.name)}</h3>
      <p style="font-size:14px;color:var(--muted);margin-bottom:14px">يرجى تحديد سبب الرفض ليظهر لمقدم الخدمة بوضوح في لوحته ويتمكن من تعديل بياناته إذا لزم.</p>
      
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">أسباب شائعة (اضغط لاختيار سريع):</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        <button class="chip chip-gray" style="cursor:pointer" onclick="$('rejReasonInput').value=this.textContent">المستمسكات غير واضحة</button>
        <button class="chip chip-gray" style="cursor:pointer" onclick="$('rejReasonInput').value=this.textContent">المنطقة غير مشمولة بالخدمة حالياً</button>
        <button class="chip chip-gray" style="cursor:pointer" onclick="$('rejReasonInput').value=this.textContent">عدم توفر شروط الخدمة والخبرة الكافية</button>
        <button class="chip chip-gray" style="cursor:pointer" onclick="$('rejReasonInput').value=this.textContent">عدم اجتياز المقابلة للخدمة الحساسة</button>
        <button class="chip chip-gray" style="cursor:pointer" onclick="$('rejReasonInput').value=this.textContent">رقم الهاتف غير متاح للتواصل</button>
      </div>

      <div class="field"><label>سبب الرفض (سيصل للمقدم)</label><textarea id="rejReasonInput" rows="3" placeholder="اكتب سبب الرفض بالتفصيل…">المستمسكات غير واضحة — يرجى التواصل مع الدعم أو إعادة رفع البيانات</textarea></div>
      
      <div class="actions" style="margin-top:18px">
        <button class="btn btn-ghost" onclick="showProviderModal('${p.id}')">رجوع</button>
        <button class="btn btn-danger" onclick="var r=$('rejReasonInput').value.trim(); if(!r){ toast('يرجى كتابة سبب الرفض'); return; } rejectProvider('${p.id}', r);">🚫 تأكيد الرفض مع إشعار المقدم</button>
      </div>
    </div>
  `);
}

function verifyProvider(id, note){
  const u=userById(id); if(!u||!u.provider) return;
  u.provider.verified='verified';
  if(note) u.provider.adminNote=note;
  notify(u.id,'🎉','الإدارة وثّقت حسابك'+(note?' — ملاحظة: '+note:''),null);
  audit(me().name,'توثيق '+u.name+(note?' ('+note+')':''));
  save(); toast('✓ تم توثيق '+u.name); closeModal(); renderAdmin('verify');
}
function rejectProvider(id, reason){
  const u=userById(id); if(!u||!u.provider) return;
  u.provider.verified='rejected';
  if(reason) u.provider.rejectReason=reason;
  notify(u.id,'🚫','طلب التوثيق مرفوض'+(reason?' — السبب: '+reason:''),null);
  audit(me().name,'رفض '+u.name+(reason?' ('+reason+')':''));
  save(); toast('🚫 تم رفض طلب التوثيق'); closeModal(); renderAdmin('verify');
}
function reconsiderProvider(id, note){
  const u=userById(id); if(!u||!u.provider) return;
  u.provider.verified='pending';
  if(note) u.provider.adminNote=note;
  notify(u.id,'⏳','أُعيد حسابك لقائمة التوثيق للمراجعة'+(note?' — ملاحظة: '+note:''),null);
  audit(me().name,'إعادة نظر في '+u.name);
  save(); toast('🔄 أُعيد الحساب للمراجعة'); closeModal(); renderAdmin('verify');
}
function askDeleteAccount(){
  const u = me();
  if(!u) return;
  modal(`
    <div style="text-align:right">
      <h3 style="font-size:19px;font-weight:900;margin-bottom:8px;color:var(--danger)">🗑️ حذف الحساب نهائياً</h3>
      <p style="font-size:14px;color:var(--muted);margin-bottom:14px">هل أنت متأكد من رغبتك بحذف حسابك؟ سيتم حذف جميع بياناتك وسجلاتك نهائياً من المنصة ولا يمكن التراجع بعد الحذف.</p>
      
      <div class="field">
        <label>لتأكيد العملية، يرجى كتابة كلمة المرور الخاصة بحسابك:</label>
        <input id="delAccountPass" type="password" placeholder="••••••••">
      </div>

      <div class="actions" style="margin-top:18px">
        <button class="btn btn-ghost" onclick="closeModal()">تراجع</button>
        <button class="btn btn-danger" onclick="doDeleteMyAccount()">🗑️ نعم، احذف حسابي نهائياً</button>
      </div>
    </div>
  `);
}

function doDeleteMyAccount(){
  const pass = $('delAccountPass') ? $('delAccountPass').value : '';
  if(!pass){ toast('يرجى كتابة كلمة المرور لتأكيد الحذف'); return; }
  cloudCall('deleteAccount', { pass: pass }).then(function(){
    closeModal();
    setToken(null);
    toast('✓ تم حذف حسابك بنجاح');
    go('#/home');
    setTimeout(function(){ location.reload(); }, 600);
  }).catch(function(e){
    if(e && e.code === 'bad_credentials') toast('⚠️ كلمة المرور غير صحيحة');
    else toast(errMsg(e && e.code));
  });
}

function adminDeleteUser(id){
  const u = userById(id);
  if(!u) return;
  modal(`
    <div style="text-align:right">
      <h3 style="font-size:19px;font-weight:900;margin-bottom:8px;color:var(--danger)">🗑️ حذف مستخدم: ${esc(u.name)}</h3>
      <p style="font-size:14px;color:var(--muted);margin-bottom:14px">هل أنت متأكد من حذف حساب (${esc(u.name)} - ${esc(u.phone)}) نهائياً؟ سيتم حذف كافة بياناته وسجلاته.</p>
      <div class="actions" style="margin-top:18px">
        <button class="btn btn-ghost" onclick="closeModal()">تراجع</button>
        <button class="btn btn-danger" onclick="cloudCall('deleteAccount', {userId:'${u.id}'}).then(function(){ closeModal(); toast('✓ تم حذف المستخدم'); renderAdmin('users'); }).catch(function(e){ toast(errMsg(e&&e.code)); });">🗑️ تأكيد الحذف النهائي</button>
      </div>
    </div>
  `);
}

/* ---------- 19) التشغيل ---------- */
$('modalBg').addEventListener('click', function(e){ if(e.target.id==='modalBg') closeModal(); });
/* الإقلاع تديره طبقة السحابة أدناه */