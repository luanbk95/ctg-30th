// Execute on: your deployment server (file path: public/js/admin.js)
async function fetchRegs(){
  const res = await fetch('/registrations', { cache: 'no-store' });
  if(!res.ok){ throw new Error('Failed to load registrations'); }
  return await res.json();
}

function escapeCell(s){
  if(s===null||s===undefined) return '';
  return String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderTable(rows){
  const tbody = document.querySelector('#regTable tbody');
  tbody.innerHTML = '';
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    const ip = r.ip || r?.meta?.ip || '';
    const cells = [r.timestamp, r.name, r.session, r.phone, r.email, r.className||r.class, r.graduationYear, r.message, ip];
    cells.forEach(val=>{ const td=document.createElement('td'); td.innerHTML = escapeCell(val); tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  document.getElementById('rowCount').textContent = `${rows.length} record(s)`;
}

function toCsv(rows){
  const headers = ['timestamp','name','session','phone','email','className','graduationYear','message','ip'];
  const csv = [headers.join(',')].concat(
    rows.map(r=>{
      const ip = r.ip || (r.meta&&r.meta.ip) || '';
      const arr = [r.timestamp, r.name, r.session, r.phone, r.email, r.className||r.class, r.graduationYear, (r.message||'').replace(/\n/g,' '), ip];
      return arr.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',');
    })
  ).join('\n');
  return csv;
}

function downloadCsv(filename, csv){
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

async function main(){
  const btnRefresh = document.getElementById('btnRefresh');
  const btnExportCsv = document.getElementById('btnExportCsv');

  async function load(){
    try{ const rows = await fetchRegs(); renderTable(rows); }
    catch(err){ alert('Không tải được dữ liệu: ' + err.message); }
  }
  btnRefresh.addEventListener('click', load);
  btnExportCsv.addEventListener('click', async ()=>{
    try{ const rows = await fetchRegs(); const csv = toCsv(rows); downloadCsv(`registrations-${Date.now()}.csv`, csv); }
    catch(err){ alert('Không export được: ' + err.message); }
  });

  await load();
}

main();