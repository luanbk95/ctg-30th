// File: public/js/script.js
document.addEventListener('DOMContentLoaded',()=>{
  // ===== Audio logic (click-to-start, mute toggle) =====
  const audio = document.getElementById('backgroundAudio');
  const audioControl = document.getElementById('audioControl');
  const scrollButton = document.getElementById('scrollToForm');
  const quickRsvp = document.getElementById('quickRsvp');

  let started = false;   // first click started
  let userMuted = false; // user explicitly muted

  function syncIcon(){
    if (!audioControl) return;
    audioControl.textContent = (audio.muted || audio.paused) ? '🔇' : '🔈';
  }
  async function playLoud(){
    try{
      audio.muted = false;
      audio.volume = 1.0;
      if (audio.paused){ await audio.play(); }
      started = true;
    }catch(_){}
    syncIcon();
  }
  function firstClickPlay(){
    if(!started && !userMuted){ playLoud(); }
  }
  document.addEventListener('click', firstClickPlay, {capture:true});
  document.addEventListener('pointerdown', firstClickPlay, {capture:true});
  if (audioControl){
    audioControl.addEventListener('click', async ()=>{
      if(audio.muted || audio.paused){
        userMuted=false; await playLoud();
      }else{
        audio.muted=true; userMuted=true; syncIcon();
      }
    });
  }
  function scrollToForm(){
    const sec = document.getElementById('registration-section');
    if (sec) sec.scrollIntoView({behavior:'smooth'});
  }
  if (scrollButton) scrollButton.addEventListener('click', scrollToForm);
  if (quickRsvp)   quickRsvp.addEventListener('click',   scrollToForm);

  // ===== Countdown (to 18/10/2025 in Asia/Ho_Chi_Minh) =====
  const target = new Date('2025-10-18T00:00:00+07:00');
  const elDays  = document.getElementById('cd-days');
  const elHours = document.getElementById('cd-hours');
  const elMins  = document.getElementById('cd-mins');
  const elSecs  = document.getElementById('cd-secs');
  function updateCountdown(){
    const now = new Date();
    const diff = Math.max(0, target - now);
    const sec = Math.floor(diff/1000);
    const d = Math.floor(sec/86400);
    const h = Math.floor((sec%86400)/3600);
    const m = Math.floor((sec%3600)/60);
    const s = sec%60;
    if(elDays)  elDays.textContent  = String(d).padStart(2,'0');
    if(elHours) elHours.textContent = String(h).padStart(2,'0');
    if(elMins)  elMins.textContent  = String(m).padStart(2,'0');
    if(elSecs)  elSecs.textContent  = String(s).padStart(2,'0');
  }
  updateCountdown();
  setInterval(updateCountdown, 1000);

  // ===== Stats (capacity) =====
  const txtCeremony = document.getElementById('txtCeremony');
  const txtFestival = document.getElementById('txtFestival');
  const txtSports   = document.getElementById('txtSports');
  const barCeremony = document.getElementById('barCeremony');
  const barFestival = document.getElementById('barFestival');
  const barSports   = document.getElementById('barSports');

  function colorFromPercent(p){
    // 0% -> hue 120 (green), 100% -> hue 0 (red)
    const hue = Math.max(0, Math.min(120, 120 - (p * 1.2)));
    return `hsl(${hue}, 65%, 40%)`;
  }

  async function refreshStats(){
    try{
      const r = await fetch('/stats', {cache:'no-store'});
      if(!r.ok) return;
      const data = await r.json();
      const cap = data.capacityCeremony || 400;
      const ceremony = data.ceremony || 0;
      const festival = data.festival || 0;
      const sports   = data.sports   || 0;

      const p = Math.max(0, Math.min(100, Math.round(ceremony*100/cap)));

      // Ceremony: width + màu theo %
      if (txtCeremony) txtCeremony.textContent = `${ceremony} / ${cap}`;
      if (barCeremony){
        barCeremony.style.width = p + '%';
        barCeremony.style.backgroundColor = colorFromPercent(p);
      }

      // Festival/Sports: luôn full width + xanh lá
      if (txtFestival) txtFestival.textContent = `${festival}`;
      if (barFestival){
        barFestival.style.width = '100%';
        barFestival.style.backgroundColor = '#2e7d32';
      }

      if (txtSports)   txtSports.textContent   = `${sports}`;
      if (barSports){
        barSports.style.width = '100%';
        barSports.style.backgroundColor = '#2e7d32';
      }

      // Disable ceremony nếu đã full
      const chkCeremony = document.getElementById('sessCeremony');
      if (chkCeremony) chkCeremony.disabled = ceremony >= cap;
    }catch(e){ /* silent */ }
  }
  refreshStats();
  setInterval(refreshStats, 30000);

  // ===== Populate Niên khóa options (1992-1995 ... 2022-2025) =====
  const gySel = document.getElementById('graduationYear');
  if(gySel){
    const start = 1992, endInclusive = 2025; // 1992-1995 ... 2022-2025
    const frag = document.createDocumentFragment();
    const ph = document.createElement('option');
    ph.value=''; ph.textContent='-- Chọn --'; ph.disabled=true; ph.selected=true;
    frag.appendChild(ph);
    for(let s=start; s<=endInclusive-3; s++){
      const e = s+3;
      const opt = document.createElement('option');
      opt.value = `${s} - ${e}`;
      opt.textContent = opt.value;
      frag.appendChild(opt);
    }
    gySel.innerHTML=''; gySel.appendChild(frag);
  }

  // ===== Gallery (Hình ảnh kỷ niệm) =====
  const GALLERY_BASE = 'images/gallery';
  const GALLERY_PAGE_COUNT = 12;
  const AUTO_INTERVAL_MS = 6000;
  const IMAGES_PER_PAGE = 4;

  const grid = document.getElementById('galleryGrid');
  const dotsWrap = document.getElementById('galDots');
  const btnPrev = document.getElementById('galPrev');
  const btnNext = document.getElementById('galNext');
  const galleryFrame = document.querySelector('.gallery-frame');

  // --- (1) Cache DOM phần tử mỗi page để không GET lại khi chuyển trang ---
  // pagesSrc[idx] = array các URL ảnh của page idx
  // pagesDom[idx] = array các <div.gallery-card> đã tạo (sẽ "move" qua lại, không recreate)
  const pagesSrc = new Array(GALLERY_PAGE_COUNT);
  const pagesDom = new Array(GALLERY_PAGE_COUNT);
  let current = 0;
  let timer = null;
  let userInteractedGallery = false; // (2) khi true, tắt auto-rotate vĩnh viễn cho phiên hiện tại

  function fileCaption(path){
    const name = path.split('/').pop().split('?')[0];
    return name.replace(/\.(jpg|jpeg|png|webp)$/i,'').replace(/[._-]+/g,' ');
  }

  function createCard(src){
    const card = document.createElement('div');
    card.className = 'gallery-card';
    const wrap = document.createElement('div');
    wrap.className = 'imgwrap';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = src;                // tải 1 lần, sau đó tái sử dụng element
    img.alt = fileCaption(src);
    wrap.appendChild(img);
    card.appendChild(wrap);
    const cap = document.createElement('div');
    cap.className = 'gallery-caption';
    cap.textContent = fileCaption(src);
    card.appendChild(cap);
    card.addEventListener('click',()=>{
      userInteracted();           // tắt auto khi người dùng xem ảnh
      openLightbox(src);
    });
    return card;
  }

  function ensurePage(idx){
    if (pagesDom[idx]) return pagesDom[idx];

    // Tạo danh sách URL 1 lần
    if (!pagesSrc[idx]){
      const folder = `${GALLERY_BASE}/page${idx+1}`;
      const urls = [];
      for(let n=1;n<=IMAGES_PER_PAGE;n++){ urls.push(`${folder}/${n}.jpg`); }
      pagesSrc[idx] = urls;
    }

    // Tạo DOM card 1 lần, giữ trong cache để "move" qua lại
    const domList = pagesSrc[idx].map(u => createCard(u));
    pagesDom[idx] = domList;

    // Prefetch ảnh đầu của trang kế tiếp (tối thiểu)
    const nextFirst = `${GALLERY_BASE}/page${((idx+1)%GALLERY_PAGE_COUNT)+1}/1.jpg`;
    const pre = new Image(); pre.loading='eager'; pre.src = nextFirst;

    return pagesDom[idx];
  }

  function renderPage(index){
    if(index<0) return;
    current = (index + GALLERY_PAGE_COUNT) % GALLERY_PAGE_COUNT;
    const cards = ensurePage(current);
    if (grid){
      grid.innerHTML = '';
      // move các node đã cache vào grid (không tạo lại, không GET lại)
      cards.forEach(card => grid.appendChild(card));
    }
    updateDots();
  }

  function updateDots(){
    if (!dotsWrap) return;
    dotsWrap.innerHTML='';
    for(let i=0;i<GALLERY_PAGE_COUNT;i++){
      const dot=document.createElement('button');
      dot.className='gal-dot'+(i===current?' active':'');
      dot.setAttribute('aria-label',`Trang ${i+1}`);
      dot.addEventListener('click',()=>{
        userInteracted();
        renderPage(i);
      });
      dotsWrap.appendChild(dot);
    }
  }

  function nextPage(){ renderPage(current+1); }
  function prevPage(){ renderPage(current-1); }

  function startAuto(){
    if (userInteractedGallery) return; // đã có tương tác thì không auto nữa
    stopAuto();
    timer = setInterval(nextPage, AUTO_INTERVAL_MS);
  }
  function stopAuto(){ if(timer){ clearInterval(timer); timer=null; } }
  function userInteracted(){
    // bất kỳ tương tác nào với gallery sẽ tắt auto vĩnh viễn cho phiên này
    userInteractedGallery = true;
    stopAuto();
  }

  // Nút điều khiển trang
  if (btnNext) btnNext.addEventListener('click',()=>{ userInteracted(); nextPage(); });
  if (btnPrev) btnPrev.addEventListener('click',()=>{ userInteracted(); prevPage(); });

  // Tương tác trong frame (click/scroll/drag) => tắt auto
  if (galleryFrame){
    ['pointerdown','wheel','touchstart','keydown'].forEach(evt=>{
      galleryFrame.addEventListener(evt, userInteracted, {passive:true});
    });
  }

  // --- (3) Lightbox: đóng bằng Back trên mobile (history back) ---
  let lightbox=null;
  function openLightbox(src){
    if(!lightbox){
      lightbox=document.createElement('div');
      lightbox.id='lightbox';
      Object.assign(lightbox.style,{
        position:'fixed',top:0,left:0,width:'100%',height:'100%',
        background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',
        justifyContent:'center',zIndex:10000
      });
      const img=document.createElement('img');
      Object.assign(img.style,{maxWidth:'92%',maxHeight:'92%',boxShadow:'0 10px 30px rgba(0,0,0,.5)',borderRadius:'8px'});
      lightbox.appendChild(img);

      // click nền để đóng
      lightbox.addEventListener('click',()=>{ closeLightbox(); });

      // ESC để đóng
      document.addEventListener('keydown',(e)=>{
        if(e.key==='Escape' && isLightboxOpen()){ closeLightbox(); }
      });

      document.body.appendChild(lightbox);
    }
    lightbox.querySelector('img').src=src;
    lightbox.style.display='flex';
    document.body.style.overflow='hidden';

    // push state để nút Back thoát lightbox thay vì rời trang
    try{ history.pushState({lightbox:true}, ''); }catch(_){}
  }
  function isLightboxOpen(){ return lightbox && lightbox.style.display!=='none'; }
  function closeLightbox(){
    if(!lightbox) return;
    lightbox.style.display='none';
    document.body.style.overflow='';
    // Nếu state top là lightbox thì pop về trước đó (tránh lùi khỏi trang)
    // Không gọi history.back() ở đây để tránh vòng lặp; rely on popstate handler
  }
  window.addEventListener('popstate',(e)=>{
    // Nếu Back và đang mở lightbox => chỉ đóng lightbox, không rời trang
    if (e.state && e.state.lightbox){
      // do nothing: trạng thái đã back về state trước; đảm bảo lightbox đóng
      closeLightbox();
    } else if (isLightboxOpen()){
      // Một số trình duyệt không giữ state => vẫn đảm bảo đóng
      closeLightbox();
      // Và đẩy lại state hiện tại để user nhấn back lần nữa mới rời trang
      try{ history.pushState({}, ''); }catch(_){}
    }
  });

  // Khởi tạo gallery
  for(let i=0;i<GALLERY_PAGE_COUNT;i++){ ensurePage(i); } // chuẩn bị cache URL/DOM
  renderPage(0);
  updateDots();
  startAuto();

  // ===== QR modal elements (nếu bạn đang dùng popup QR) =====
  const modal           = document.getElementById('qrModal');
  const btnDownloadQR   = document.getElementById('btnDownloadQR');
  const btnCopyLink     = document.getElementById('btnCopyLink');
  const qrImage         = document.getElementById('qrImage');
  const qrClose         = document.getElementById('qrClose');
  const ticketLinkText  = document.getElementById('ticketLinkText');
  let   qrSaved         = false;

  function openModal(){ if(!modal) return; modal.hidden=false; document.body.style.overflow='hidden'; }
  function closeModal(){ if(!modal) return; modal.hidden=true; document.body.style.overflow=''; }
  function showError(msg){ const m=document.getElementById('formMessage'); if(m){ m.textContent=msg; m.style.color='red'; } }
  function showSuccess(msg){ const m=document.getElementById('formMessage'); if(m){ m.textContent=msg; m.style.color='green'; } }

  window.addEventListener('beforeunload',(e)=>{
    if(modal && !modal.hidden && !qrSaved){ e.preventDefault(); e.returnValue='Hãy lưu ảnh QR hoặc copy link vé trước khi rời trang.'; }
  });
  if (qrClose){
    qrClose.addEventListener('click',()=>{
      if(!qrSaved && !confirm('Bạn đã lưu ảnh QR hoặc copy link chưa?')) return;
      closeModal();
    });
  }
  if (btnDownloadQR){ btnDownloadQR.addEventListener('click',()=>{ qrSaved = true; }); }
  if (btnCopyLink){
    btnCopyLink.addEventListener('click', async ()=>{
      try {
        let urlToCopy = (ticketLinkText?.dataset?.url) || ticketLinkText?.textContent || '';
        if (!/^https?:\/\//i.test(urlToCopy)) urlToCopy = location.origin + urlToCopy;
        await navigator.clipboard.writeText(urlToCopy);
        qrSaved = true;
        alert('Đã copy link vé');
      } catch(_){ alert('Không copy được link.'); }
    });
  }

  // ===== Form validation & submit (sessions: checklist) =====
  const form = document.getElementById('registrationForm');
  const btnSubmit = form ? form.querySelector('button[type="submit"]') : null;

  function getSelectedSessions(){
    return Array.from(document.querySelectorAll('input[name="sessions"]:checked')).map(i=>i.value);
  }

  if (form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();

      // Honeypot
      const hp = document.getElementById('website');
      if(hp && hp.value){ showError('Có lỗi xảy ra.'); return; }

      // Collect
      const name = form.name.value.trim();
      const phone = form.phone.value.trim();
      const email = (form.email.value||'').trim();
      const className = form.class.value;
      const graduationYear = form.graduationYear.value;
      const message = (form.message.value||'').trim();
      const sessions = getSelectedSessions(); // ['ceremony','festival','sports']

      // Validate
      const emailOk = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(email);
      const phoneOk = (/[0-9]{7,15}/).test(phone.replace(/[^0-9]/g,''));
      if(!name||!phone||!email||!className||!graduationYear){
        showError('Vui lòng điền đầy đủ các trường có dấu *'); return;
      }
      if (!sessions.length){
        showError('Vui lòng chọn ít nhất một mục trong "Tham gia".'); return;
      }
      if(!emailOk){ showError('Email chưa hợp lệ'); return; }
      if(!phoneOk){ showError('Số điện thoại chưa hợp lệ'); return; }

      if(btnSubmit){ btnSubmit.disabled=true; btnSubmit.dataset.oldText = btnSubmit.textContent; btnSubmit.textContent='Đang gửi...'; }
      const payload = { name, phone, email, className, graduationYear, message, sessions };

      try{
        const res = await fetch('/submit',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)
        });
        const json = await res.json();

        if(res.ok && json.status==='success'){
          showSuccess('Cảm ơn bạn đã đăng ký! Thông tin đã được gửi.');
          form.reset();
          refreshStats();

          // Nếu backend trả QR
          if (json.ticketId && json.qrUrl && json.ticketUrl){
            if (qrImage)        { qrImage.src = json.qrUrl; qrImage.alt = `QR ${json.ticketId}`; }
            if (btnDownloadQR)  { btnDownloadQR.href = json.qrUrl; btnDownloadQR.download = `ticket-${json.ticketId}.png`; }
            if (ticketLinkText) { ticketLinkText.dataset.url = json.ticketUrl; ticketLinkText.innerHTML = `<a href="${json.ticketUrl}" target="_blank" rel="noopener">${json.ticketUrl}</a>`; }
            qrSaved = false;
            openModal();
          }
        } else if (json.status==='full'){
          // ceremony full
          showError('Phần Lễ (sáng Thứ 7) đã đủ 400 chỗ. Vui lòng bỏ chọn mục này hoặc chọn phần khác.');
          // disable checkbox ceremony ngay
          const chkCeremony = document.getElementById('sessCeremony');
          if (chkCeremony) chkCeremony.disabled = true;
        } else {
          showError(json.message || 'Đã xảy ra lỗi khi gửi thông tin.');
        }
      }catch(_){
        showError('Lỗi kết nối. Vui lòng thử lại sau.');
      }finally{
        if(btnSubmit){ btnSubmit.disabled=false; btnSubmit.textContent = btnSubmit.dataset.oldText || 'Gửi xác nhận'; }
      }
    });
  }
});