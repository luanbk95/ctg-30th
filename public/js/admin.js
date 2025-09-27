(async function(){
  async function fetchJson(url){
    const r = await fetch(url, {cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }
  function esc(s){ return String(s||'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
  function formatSessions(arr){
    if(!Array.isArray(arr) || !arr.length) return '';
    const map = { ceremony:'Phần Lễ (sáng T7)', festival:'Phần Hội (chiều tối T7)', sports:'Giao lưu thể thao (CN sáng)' };
    return arr.map(s=>map[s]||s).join(' • ');
  }
  function toCsvCell(v){ 
    const s = String(v==null?'':v).replace(/"/g,'""');
    // wrap every field in quotes for safety
    return `"${s}"`;
  }

  let data = [];
  try{
    // /registrations có Basic Auth theo server.js
    const r = await fetch('/registrations', {cache:'no-store'});
    if(!r.ok){
      document.getElementById('tbody').innerHTML = `<tr><td colspan="11">Failed to load (${r.status})</td></tr>`;
      return;
    }
    data = await r.json();
  }catch(e){
    document.getElementById('tbody').innerHTML = `<tr><td colspan="11">Error: ${esc(e.message)}</td></tr>`;
    return;
  }

  const tbody = document.getElementById('tbody');
  tbody.innerHTML = '';
  data.forEach((rec, idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx+1}</td>
      <td>${esc(rec.timestamp)}</td>
      <td>${esc(rec.name)}</td>
      <td>${esc(rec.email)}</td>
      <td>${esc(rec.phone)}</td>
      <td>${esc(rec.className)}</td>
      <td>${esc(rec.graduationYear)}</td>
      <td>${esc(formatSessions(rec.sessions))}</td>
      <td>${esc(rec.meta?.ip || '')}</td>
      <td>${esc(rec.meta?.userAgent || '')}</td>
      <td>${esc(rec.ticketId || '')}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('metaCount').textContent = `${data.length} bản ghi`;

  // Export CSV (Excel mở được)
  document.getElementById('btnExportCsv').addEventListener('click', ()=>{
    const headers = ['#','timestamp','name','email','phone','className','graduationYear','sessions','ip','userAgent','ticketId'];
    const rows = data.map((rec, i)=>[
      i+1,
      rec.timestamp||'',
      rec.name||'',
      rec.email||'',
      rec.phone||'',
      rec.className||'',
      rec.graduationYear||'',
      Array.isArray(rec.sessions)? rec.sessions.join('|') : '',
      rec.meta?.ip || '',
      rec.meta?.userAgent || '',
      rec.ticketId || ''
    ]);
    const csv = [headers, ...rows].map(r=>r.map(toCsvCell).join(',')).join('\r\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `registrations_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });
})();