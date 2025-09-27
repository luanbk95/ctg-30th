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
  async function refreshStats(){
    try{
      const r = await fetch('/stats', {cache:'no-store'});
      if(!r.ok) return;
      const data = await r.json();
      const cap = data.capacityMorning || 400;
      const morning = data.morning || 0;
      const afternoon = data.afternoon || 0;

      const p = Math.max(0, Math.min(100, Math.round(morning*100/cap)));
      const barMorning   = document.getElementById('barMorning');
      const barAfternoon = document.getElementById('barAfternoon');
      const txtMorning   = document.getElementById('txtMorning');
      const txtAfternoon = document.getElementById('txtAfternoon');

      if(barMorning){ barMorning.style.width = p + '%'; }
      if(txtMorning){ txtMorning.textContent = `${morning} / ${cap}`; }
      if(barAfternoon){ barAfternoon.style.width = '100%'; }
      if(txtAfternoon){ txtAfternoon.textContent = `${afternoon}`; }

      // If morning already full, disable the option on UI
      const sessionSel = document.getElementById('session');
      if (sessionSel && (morning >= cap)){
        const optMorning = [...sessionSel.options].find(o=>o.value==='Sáng');
        if (optMorning) optMorning.disabled = true;
      }
    }catch(e){ /* silent */ }
  }
  refreshStats();
  setInterval(refreshStats, 15000);

  // ===== Populate Niên khóa options (1992-1995 ... 2022-2025) =====
  const gySel = document.getElementById('graduationYear');
  if(gySel){
    const start = 1992, endInclusive = 2025; // so we render 1992-1995 ... 2022-2025
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
  const GALLERY_PAGE_COUNT = 5; // adjust to actual number of folders page1..pageN
  const AUTO_INTERVAL_MS = 6000;
  const IMAGES_PER_PAGE = 4;

  const grid = document.getElementById('galleryGrid');
  const dotsWrap = document.getElementById('galDots');
  const btnPrev = document.getElementById('galPrev');
  const btnNext = document.getElementById('galNext');
  const galleryFrame = document.querySelector('.gallery-frame');

  let pages = new Array(GALLERY_PAGE_COUNT);
  let current = 0;
  let timer = null;

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
    img.src = src;
    img.alt = fileCaption(src);
    wrap.appendChild(img);
    card.appendChild(wrap);
    const cap = document.createElement('div');
    cap.className = 'gallery-caption';
    cap.textContent = fileCaption(src);
    card.appendChild(cap);
    card.addEventListener('click',()=>openLightbox(src));
    return card;
  }
  function renderPage(index){
    if(index<0) return;
    current = (index + GALLERY_PAGE_COUNT) % GALLERY_PAGE_COUNT;
    const imgs = ensurePage(current);
    if (grid){
      grid.innerHTML='';
      imgs.forEach(src=>grid.appendChild(createCard(src)));
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
      dot.addEventListener('click',()=>{ stopAuto(); renderPage(i); startAuto(); });
      dotsWrap.appendChild(dot);
    }
  }
  function ensurePage(idx){
    if(pages[idx]) return pages[idx];
    const folder = `${GALLERY_BASE}/page${idx+1}`;
    const imgs = [];
    for(let n=1;n<=IMAGES_PER_PAGE;n++){ imgs.push(`${folder}/${n}.jpg`); }
    pages[idx]=imgs;

    // prefetch next page's first image
    const nextFirst = `${GALLERY_BASE}/page${((idx+1)%GALLERY_PAGE_COUNT)+1}/1.jpg`;
    const pre=new Image(); pre.loading='eager'; pre.src=nextFirst;

    return imgs;
  }
  function nextPage(){ renderPage(current+1); }
  function prevPage(){ renderPage(current-1); }
  function startAuto(){ stopAuto(); timer=setInterval(nextPage,AUTO_INTERVAL_MS); }
  function stopAuto(){ if(timer){ clearInterval(timer); timer=null; } }

  if (btnNext) btnNext.addEventListener('click',()=>{ stopAuto(); nextPage(); startAuto(); });
  if (btnPrev) btnPrev.addEventListener('click',()=>{ stopAuto(); prevPage(); startAuto(); });
  if (galleryFrame){
    galleryFrame.addEventListener('mouseenter',stopAuto);
    galleryFrame.addEventListener('mouseleave',startAuto);
  }

  // Lightbox simple
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
      lightbox.addEventListener('click',()=>{ lightbox.style.display='none'; });
      document.body.appendChild(lightbox);
    }
    lightbox.querySelector('img').src=src;
    lightbox.style.display='flex';
  }

  // Initialize gallery
  for(let i=0;i<GALLERY_PAGE_COUNT;i++){ ensurePage(i); }
  renderPage(0);
  updateDots();
  startAuto();

  // ===== Form validation, submit, and QR modal handling =====
  const form = document.getElementById('registrationForm');
  const messageDiv = document.getElementById('formMessage');
  const btnSubmit = form ? form.querySelector('button[type="submit"]') : null;

  // Modal elements (may not exist if HTML not updated)
  const modal           = document.getElementById('qrModal');
  const btnDownloadQR   = document.getElementById('btnDownloadQR');
  const btnCopyLink     = document.getElementById('btnCopyLink');
  const qrImage         = document.getElementById('qrImage');
  const qrClose         = document.getElementById('qrClose');
  const ticketLinkText  = document.getElementById('ticketLinkText');
  let   qrSaved         = false; // set true when user downloads or copies link

  function openModal(){ if(!modal) return; modal.hidden=false; document.body.style.overflow='hidden'; }
  function closeModal(){ if(!modal) return; modal.hidden=true; document.body.style.overflow=''; }
  function showError(msg){ if(!messageDiv) return; messageDiv.textContent=msg; messageDiv.style.color='red'; }
  function showSuccess(msg){ if(!messageDiv) return; messageDiv.textContent=msg; messageDiv.style.color='green'; }

  // Warn on closing if QR not saved
  window.addEventListener('beforeunload',(e)=>{
    if(modal && !modal.hidden && !qrSaved){
      e.preventDefault();
      e.returnValue='Hãy lưu ảnh QR hoặc copy link vé trước khi rời trang.';
    }
  });
  window.addEventListener('popstate',()=>{
    if(modal && !modal.hidden && !qrSaved){
      if(!confirm('Hãy lưu ảnh QR hoặc copy link vé trước khi rời trang.')){ history.pushState(null,''); }
    }
  });
  if (qrClose){
    qrClose.addEventListener('click',()=>{
      if(!qrSaved){
        if(!confirm('Bạn đã lưu ảnh QR hoặc copy link chưa?')) return;
      }
      closeModal();
    });
  }
  if (btnDownloadQR){
    btnDownloadQR.addEventListener('click',()=>{ qrSaved = true; });
  }
  if (btnCopyLink){
    btnCopyLink.addEventListener('click', async ()=>{
      try {
        // Prefer absolute URL from dataset; only prepend origin if relative path
        let urlToCopy = (ticketLinkText?.dataset?.url) || ticketLinkText?.textContent || '';
        if (!/^https?:\/\//i.test(urlToCopy)) {
          urlToCopy = location.origin + urlToCopy;
        }
        await navigator.clipboard.writeText(urlToCopy);
        qrSaved = true;
        alert('Đã copy link vé');
      } catch(_){ alert('Không copy được link.'); }
    });
  }

  if (form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();

      // Honeypot
      const hp = document.getElementById('website');
      if(hp && hp.value){ showError('Có lỗi xảy ra.'); return; }

      // Collect
      const name = form.name.value.trim();
      const session = form.session.value;
      const phone = form.phone.value.trim();
      const email = (form.email.value||'').trim();
      const className = form.class.value;
      const graduationYear = form.graduationYear.value;
      const message = (form.message.value||'').trim();

      // Validate
      const emailOk = /[^\s@]+@[^\s@]+\.[^\s@]+/.test(email);
      const phoneOk = (/[0-9]{7,15}/).test(phone.replace(/[^0-9]/g,''));
      if(!name||!session||!phone||!email||!className||!graduationYear){
        showError('Vui lòng điền đầy đủ các trường có dấu *'); return;
      }
      if(!emailOk){ showError('Email chưa hợp lệ'); return; }
      if(!phoneOk){ showError('Số điện thoại chưa hợp lệ'); return; }

      if(btnSubmit){ btnSubmit.disabled=true; btnSubmit.dataset.oldText = btnSubmit.textContent; btnSubmit.textContent='Đang gửi...'; }
      const payload = { name, session, phone, email, className, graduationYear, message };

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

          // Expect these fields from server.js
          const ticketId = json.ticketId;
          const qrUrl    = json.qrUrl;
          const ticketUrl= json.ticketUrl;

          if (qrImage)        { qrImage.src = qrUrl; qrImage.alt = `QR ${ticketId}`; }
          if (btnDownloadQR)  { btnDownloadQR.href = qrUrl; btnDownloadQR.download = `ticket-${ticketId}.png`; }
          if (ticketLinkText) {
            ticketLinkText.dataset.url = ticketUrl; // lưu URL tuyệt đối để copy
            ticketLinkText.innerHTML = `<a href="${ticketUrl}" target="_blank" rel="noopener">${ticketUrl}</a>`;
          }

          qrSaved = false;
          openModal();

        } else if (json.status==='full'){
          showError('Buổi sáng đã đủ 400 chỗ. Vui lòng chọn Buổi chiều.');
          // Disable morning option immediately
          const optMorning = [...form.session.options].find(o=>o.value==='Sáng');
          if (optMorning) optMorning.disabled = true;
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