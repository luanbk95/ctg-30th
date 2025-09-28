(async function(){
  const $tbody = document.getElementById('tbody');
  const $count = document.getElementById('count');
  const $btnRefresh = document.getElementById('btnRefresh');
  const $btnExportCsv = document.getElementById('btnExportCsv');

  let data = [];

  function esc(s=''){
    return String(s).replace(/[&<>"']/g, m =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])
    );
  }

  function sessionsToText(r){
    // hỗ trợ cả schema cũ (session) và mới (sessions[])
    if (Array.isArray(r.sessions) && r.sessions.length){
      const map = {ceremony:'Phần Lễ', festival:'Phần Hội', sports:'Thể thao'};
      return r.sessions.map(x => map[x] || x).join(', ');
    }
    return r.session || '';
  }

  function render(){
    $tbody.innerHTML = data.map(r => `
      <tr>
        <td>${esc(r.timestamp || '')}</td>
        <td>${esc(r.name || '')}</td>
        <td>${esc(r.phone || '')}</td>
        <td>${esc(r.email || '')}</td>
        <td>${esc(r.className || r.class || '')}</td>
        <td>${esc(r.graduationYear || '')}</td>
        <td class="wrap">${esc(r.message || '')}</td> <!-- 🆕 hiện Lời nhắn -->
        <td class="mono">${esc(r.meta?.ip || '')}</td>
        <td class="wrap">${esc(r.meta?.userAgent || '')}</td>
        <td class="mono">${esc(r.ticketId || '')}</td>
        <td>${esc(sessionsToText(r))}</td>
      </tr>
    `).join('');
    $count.textContent = `Tổng: ${data.length}`;
  }

  async function load(){
    const res = await fetch('/registrations', {cache:'no-store'});
    if(!res.ok){ alert('Không tải được dữ liệu'); return; }
    data = await res.json();

    // mặc định sắp xếp mới nhất lên đầu
    data.sort((a,b) => (b.timestamp||'').localeCompare(a.timestamp||''));
    render();
  }

  // Export CSV (có cột Lời nhắn)
  function toCsvRow(arr){
    return arr.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    }).join(',');
  }
  function exportCsv(){
    const header = [
      'timestamp','name','phone','email','className','graduationYear',
      'message', // 🆕
      'ip','userAgent','ticketId','sessions'
    ];
    const rows = data.map(r => [
      r.timestamp || '',
      r.name || '',
      r.phone || '',
      r.email || '',
      r.className || r.class || '',
      r.graduationYear || '',
      r.message || '',                               // 🆕
      r.meta?.ip || '',
      r.meta?.userAgent || '',
      r.ticketId || '',
      Array.isArray(r.sessions) ? r.sessions.join('|') : (r.session || '')
    ]);
    const csv = [toCsvRow(header), ...rows.map(toCsvRow)].join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `registrations-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // Bind
  $btnRefresh.addEventListener('click', load);
  $btnExportCsv.addEventListener('click', exportCsv);

  // First load
  load();
})();