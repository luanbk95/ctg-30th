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
      // Lazy-attach the src on first play to avoid network before user gesture
      if (!audio.getAttribute('src')) {
        const realSrc = audio.getAttribute('data-src');
        if (realSrc) {
          audio.setAttribute('src', realSrc);
          // Ensure it re-reads source without starting a download until play()
          audio.load();
        }
      }
  
      audio.muted = false;
      audio.volume = 1.0;
  
      if (audio.paused){
        await audio.play();   // user gesture already occurred -> allowed
      }
      started = true;
    } catch (_){}
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

  // ===== Stats (capacity 3 mục) =====
  const txtCeremony = document.getElementById('txtCeremony');
  const txtFestival = document.getElementById('txtFestival');
  const txtSports   = document.getElementById('txtSports');
  const barCeremony = document.getElementById('barCeremony');
  const barFestival = document.getElementById('barFestival');
  const barSports   = document.getElementById('barSports');

  function colorFromPercent(p){
    // 0% -> xanh lá (120), 100% -> đỏ (0)
    const hue = Math.max(0, Math.min(120, 120 - (p * 1.2)));
    return `hsl(${hue}, 65%, 40%)`;
  }

  async function refreshStats(){
    try{
      const r = await fetch('/stats', {cache:'no-store'});
      if(!r.ok) return;
      const data = await r.json();
      const cap = data.capacityCeremony || 200;
      const ceremony = data.ceremony || 0;
      const festival = data.festival || 0;
      const sports   = data.sports   || 0;

      const p = Math.max(0, Math.min(100, Math.round(ceremony*100/cap)));

      if (txtCeremony) txtCeremony.textContent = `${ceremony} / ${cap}`;
      if (barCeremony){
        barCeremony.style.width = p + '%';
        barCeremony.style.backgroundColor = colorFromPercent(p);
      }
      if (txtFestival) txtFestival.textContent = `${festival}`;
      if (barFestival){ barFestival.style.width = '100%'; barFestival.style.backgroundColor = '#2e7d32'; }
      if (txtSports)   txtSports.textContent   = `${sports}`;
      if (barSports)  { barSports.style.width  = '100%'; barSports.style.backgroundColor  = '#2e7d32'; }

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
  const GALLERY_PAGE_COUNT = 15; // chỉnh theo số thư mục pageN
  const IMAGES_PER_PAGE = 4;

  const grid       = document.getElementById('galleryGrid');
  const dotsWrap   = document.getElementById('galDots');
  const btnPrev    = document.getElementById('galPrev');
  const btnNext    = document.getElementById('galNext');
  const galleryFrame = document.querySelector('.gallery-frame');

  // Cache: chỉ lưu URL trước; DOM card sẽ tạo khi render trang lần đầu
  const pagesSrc = new Array(GALLERY_PAGE_COUNT); // string[]
  const pagesDom = new Array(GALLERY_PAGE_COUNT); // HTMLElement[] (gallery-card)
  let current = 0;

  function fileCaption(path){
    const name = path.split('/').pop().split('?')[0];
    return name.replace(/\.(jpg|jpeg|png|webp)$/i,'').replace(/[._-]+/g,' ');
  }

  function buildUrlsFor(idx){
    if (pagesSrc[idx]) return pagesSrc[idx];
    const folder = `${GALLERY_BASE}/page${idx+1}`;
    const urls = [];
    for(let n=1;n<=IMAGES_PER_PAGE;n++){ urls.push(`${folder}/${n}.jpg`); }
    pagesSrc[idx] = urls;
    return urls;
  }

  function buildDomCardsFor(idx){
    if (pagesDom[idx]) return pagesDom[idx];
    // Chỉ khi thực sự cần render mới tạo DOM + gán src (=> lúc đó mới tải ảnh)
    const cards = buildUrlsFor(idx).map(src=>{
      const card = document.createElement('div');
      card.className='gallery-card';
      const wrap=document.createElement('div');
      wrap.className='imgwrap';
      const img=document.createElement('img');
      img.loading='lazy';
      img.decoding='async';
      img.src = src;                // tải lần đầu khi page được mở
      img.alt = fileCaption(src);
      wrap.appendChild(img);
      card.appendChild(wrap);
      const cap=document.createElement('div');
      cap.className='gallery-caption';
      cap.textContent=fileCaption(src);
      card.appendChild(cap);
      card.addEventListener('click',()=>openLightbox(src));
      return card;
    });
    pagesDom[idx] = cards;
    return cards;
  }

  function renderPage(index){
    if(index<0) return;
    current = (index + GALLERY_PAGE_COUNT) % GALLERY_PAGE_COUNT;
    const cards = buildDomCardsFor(current);
    if (grid){
      grid.innerHTML='';
      cards.forEach(c=>grid.appendChild(c));
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
      dot.addEventListener('click',()=>{ renderPage(i); });
      dotsWrap.appendChild(dot);
    }
  }

  function nextPage(){ renderPage(current+1); }
  function prevPage(){ renderPage(current-1); }

  if (btnNext) btnNext.addEventListener('click', nextPage);
  if (btnPrev) btnPrev.addEventListener('click', prevPage);

  // Không tự động chuyển trang; không prefetch.
  // Ưu tiên tải tài nguyên khác trước: chỉ render page1 sau khi window đã load xong.
  window.addEventListener('load', ()=>{
    updateDots();
    renderPage(0); // lúc này mới GET 4 ảnh page1
  }, {once:true});

  // Lightbox + Back trên mobile để thoát
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
      lightbox.addEventListener('click',()=>{ closeLightbox(); });
      document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && isLightboxOpen()) closeLightbox(); });
      document.body.appendChild(lightbox);
    }
    lightbox.querySelector('img').src=src;
    lightbox.style.display='flex';
    document.body.style.overflow='hidden';
    try{ history.pushState({lightbox:true}, ''); }catch(_){}
  }
  function isLightboxOpen(){ return lightbox && lightbox.style.display!=='none'; }
  function closeLightbox(){
    if(!lightbox) return;
    lightbox.style.display='none';
    document.body.style.overflow='';
  }
  window.addEventListener('popstate',(e)=>{
    if (e.state && e.state.lightbox){
      closeLightbox();
    } else if (isLightboxOpen()){
      closeLightbox();
      try{ history.pushState({}, ''); }catch(_){}
    }
  });

  // ===== QR modal elements (nếu đang dùng popup QR) =====
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

          if (json.ticketId && json.qrUrl && json.ticketUrl){
            if (qrImage)        { qrImage.src = json.qrUrl; qrImage.alt = `QR ${json.ticketId}`; }
            if (btnDownloadQR)  { btnDownloadQR.href = json.qrUrl; btnDownloadQR.download = `ticket-${json.ticketId}.png`; }
            if (ticketLinkText) { ticketLinkText.dataset.url = json.ticketUrl; ticketLinkText.innerHTML = `<a href="${json.ticketUrl}" target="_blank" rel="noopener">${json.ticketUrl}</a>`; }
            qrSaved = false;
            openModal();
          }
        } else if (json.status==='full'){
          showError('Phần Lễ (sáng Thứ 7) đã đủ 200 chỗ. Vui lòng bỏ chọn mục này hoặc chọn phần khác.');
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