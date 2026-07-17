/* =========================================================
   ANTARAKALA — Demo App Logic
   Semua data & inferensi AI pada file ini adalah SIMULASI
   untuk keperluan demonstrasi antarmuka (lihat modal "Tentang").
   ========================================================= */
(function(){
  "use strict";

  /* ---------------- constants ---------------- */
  const POINTS = [
    { id:1, name:"Posterior Atas Kiri"  },
    { id:2, name:"Posterior Atas Kanan" },
    { id:3, name:"Posterior Bawah Kiri" },
    { id:4, name:"Posterior Bawah Kanan"},
    { id:5, name:"Anterior Atas Kiri"   },
    { id:6, name:"Anterior Atas Kanan"  },
  ];

  const DANGER_SIGNS = [
    { key:"minum", title:"Tidak Bisa Minum atau Menyusu", desc:"Kesulitan asupan cairan oral yang mengancam hidrasi.",
      icon:'<path d="M6 3h12l-1.5 15a2 2 0 01-2 1.8h-5a2 2 0 01-2-1.8L6 3z"/><path d="M6 3l-1-2M18 3l1-2"/>' },
    { key:"muntah", title:"Muntah Setiap Kali", desc:"Tidak dapat mempertahankan makanan atau cairan di lambung.",
      icon:'<circle cx="12" cy="12" r="9"/><path d="M9 10c.5 1 1.5 1 2 0M13 10c.5 1 1.5 1 2 0"/><path d="M9 15c1.5 1.5 4.5 1.5 6 0"/>' },
    { key:"kejang", title:"Kejang", desc:"Riwayat atau episode kejang aktif selama sakit saat ini.",
      icon:'<path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>' },
    { key:"letargis", title:"Letargis atau Tidak Sadar", desc:"Penurunan kesadaran signifikan, tidak merespons rangsangan wajar.",
      icon:'<rect x="2" y="13" width="16" height="6" rx="1.5"/><path d="M2 13v-2a3 3 0 013-3h6a3 3 0 013 3M20 15v4M2 19v1M2 13V9"/>' },
    { key:"stridor", title:"Stridor pada Anak yang Tenang", desc:"Suara napas kasar saat inspirasi tanpa anak menangis.",
      icon:'<path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0" />' },
  ];

  /* ---------------- state ---------------- */
  const state = {
    patient:{ name:"", age:"", gender:"", pcv:"", chest:"" },
    danger:{},              // key -> 'ada' | 'tidak'
    vitals:{ temp:36.8, spo2:97, flare:"", grunt:"" },
    points:[],              // {id,name,result:'crackle'|'wheeze'|'normal'}
    result:null,            // computed after AI step
    lastExamScreen:"beranda",
    meetingNo: 1,
  };

  const RESULT_TEXT = {
    high:{ label:"RISIKO TINGGI", action:"Rujuk segera ke RS/IGD, berikan oksigen, siapkan IV & cairan resusitasi." },
    mid: { label:"RISIKO SEDANG", action:"Berikan antibiotik oral sesuai pedoman IMCI, observasi kondisi selama 24 jam, dan edukasi tanda bahaya untuk kembali segera." },
    low: { label:"RISIKO RENDAH", action:"Rawat jalan di rumah, edukasi orang tua mengenai tanda bahaya, dan jadwalkan kontrol ulang." },
  };

  /* ---------------- history (localStorage) ---------------- */
  const HKEY = "antarakala_history_v1";
  function loadHistory(){
    try{
      const raw = localStorage.getItem(HKEY);
      if(raw) return JSON.parse(raw);
    }catch(e){}
    // seed demo data so the screen isn't empty on first visit
    return [
      { name:"Asep Santoso", id:"RM-2024-0891", complaint:"Sesak napas", tier:"high", spo2:92, hr:110, when:"Hari ini, 09:45" },
      { name:"Budi Darmawan", id:"RM-2024-0889", complaint:"Kejang", tier:"low", spo2:97, hr:82, when:"17 Juli 2026, 10:15" },
      { name:"Tiara Andini", id:"RM-2024-0888", complaint:"Pemantauan lanjutan", tier:"mid", spo2:94, hr:95, when:"16 Juli 2026, 16:00" },
    ];
  }
  function saveHistory(list){
    try{ localStorage.setItem(HKEY, JSON.stringify(list)); }catch(e){}
  }
  let history = loadHistory();

  /* ---------------- helpers ---------------- */
  const $  = (sel,root)=> (root||document).querySelector(sel);
  const $$ = (sel,root)=> Array.from((root||document).querySelectorAll(sel));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function rand(min,max){ return Math.random()*(max-min)+min; }
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  function isScreenVisible(name){
    const el = $(`.screen[data-screen="${name}"]`);
    return !!(el && el.classList.contains("visible"));
  }

  function showToast(msg){
    const t = $("#toast");
    $("#toastText").textContent = msg;
    t.classList.add("show");
    clearTimeout(showToast._tm);
    showToast._tm = setTimeout(()=>t.classList.remove("show"), 2200);
  }

  /* ---------------- navigation ---------------- */
  const NAV_GROUP = {
    "beranda":"beranda",
    "input-pasien":"pasien",
    "tanda-bahaya":"pasien",
    "riwayat":"pasien",
    "panduan-auskultasi":"pemeriksaan",
    "proses-auskultasi":"pemeriksaan",
    "input-parameter":"pemeriksaan",
    "proses-ai":"pemeriksaan",
    "hasil-skrining":"pemeriksaan",
    "penjelasan-ai":"analisis",
    "faktor-risiko":"analisis",
    "faktor-kontribusi":"analisis",
  };

  const NAV_ITEMS = [
    { key:"beranda", label:"Beranda", target:"beranda",
      icon:'<path d="M3 11l9-8 9 8"/><path d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9"/>' },
    { key:"pasien", label:"Pasien", target:"riwayat",
      icon:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1.2A4.8 4.8 0 017.8 14h2.4A4.8 4.8 0 0115 18.8V20"/><circle cx="17" cy="8.5" r="2.4"/><path d="M20.5 20v-1a3.8 3.8 0 00-2.7-3.6"/>' },
    { key:"pemeriksaan", label:"Pemeriksaan", target:"__exam__",
      icon:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M9 13h6M12 10v6"/>' },
    { key:"analisis", label:"Analisis", target:"__analysis__",
      icon:'<path d="M4 20V10M11 20V4M18 20v-7"/>' },
  ];

  function renderBottomNav(){
    $$("[data-navbar]").forEach(nav=>{
      nav.innerHTML = NAV_ITEMS.map(it=>`
        <button class="nav-item" data-navkey="${it.key}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${it.icon}</svg>
          <span>${it.label}</span>
        </button>`).join("");
    });
  }

  function goTo(screenName){
    if(!screenName) return;
    $$(".screen").forEach(s=>s.classList.remove("visible"));
    const target = $(`.screen[data-screen="${screenName}"]`);
    if(!target){ return; }
    target.classList.add("visible");
    $("#appScroll").scrollTop = 0;
    const grp = NAV_GROUP[screenName];
    $$(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.navkey===grp));
    if(NAV_GROUP[screenName]==="pemeriksaan") state.lastExamScreen = screenName;
    afterNav(screenName);
    document.dispatchEvent(new CustomEvent("antarakala:phone-nav", { detail: { screen: screenName } }));
  }

  function afterNav(screenName){
    if(screenName==="beranda") renderBeranda();
    if(screenName==="tanda-bahaya") renderDangerList();
    if(screenName==="proses-auskultasi") syncAuscultationScreen();
    if(screenName==="input-parameter") prefillParameter();
    if(screenName==="hasil-skrining") renderHasil();
    if(screenName==="penjelasan-ai") renderPenjelasan();
    if(screenName==="faktor-risiko") renderFaktorRisiko();
    if(screenName==="faktor-kontribusi") renderFaktorKontribusi();
    if(screenName==="riwayat") renderRiwayat();
  }

  /* delegate all nav / action clicks */
  document.addEventListener("click", (e)=>{
    const navBtn = e.target.closest("[data-nav]");
    if(navBtn){ goTo(navBtn.dataset.nav); return; }

    const navItem = e.target.closest(".nav-item");
    if(navItem){
      const item = NAV_ITEMS.find(i=>i.key===navItem.dataset.navkey);
      if(item.target==="__exam__"){
        goTo(state.result ? "hasil-skrining" : (state.patient.name ? state.lastExamScreen : "input-pasien"));
      } else if(item.target==="__analysis__"){
        if(state.result) goTo("hasil-skrining");
        else showToast("Belum ada hasil pemeriksaan pada sesi ini");
      } else {
        goTo(item.target);
      }
      return;
    }

    const actionBtn = e.target.closest("[data-action]");
    if(actionBtn){ handleAction(actionBtn.dataset.action); return; }

    // segmented control selection
    const segBtn = e.target.closest(".seg button");
    if(segBtn){
      const seg = segBtn.closest(".seg");
      $$("button", seg).forEach(b=>b.classList.remove("selected"));
      segBtn.classList.add("selected");
      if(segBtn.dataset.danger==="1") segBtn.classList.add("danger");
      onSegChange(seg.id, segBtn.dataset.val);
      return;
    }
  });

  function handleAction(action){
    if(action==="open-about") $("#aboutModal").classList.add("visible");
    if(action==="close-about") $("#aboutModal").classList.remove("visible");
    if(action==="download-report") downloadReport();
    if(action==="save-finish") finishAndSave();
  }

  /* ---------------- BERANDA ---------------- */
  function renderBeranda(){
    $("#statPasien").textContent = history.length;
    $("#statBahaya").textContent = history.filter(h=>h.tier==="high").length;
    const list = history.slice(0,3);
    $("#homeHistoryList").innerHTML = list.map(h=>historyItemHTML(h)).join("") ||
      `<p style="font-size:12.5px;color:var(--ink-300);">Belum ada riwayat pemeriksaan.</p>`;
  }

  function historyItemHTML(h){
    const tierMap = { high:{cls:"high", pill:"pill-red", text:"Rujukan"}, mid:{cls:"", pill:"pill-amber", text:"Pemantauan"}, low:{cls:"", pill:"pill-green", text:"Selesai"} };
    const t = tierMap[h.tier] || tierMap.low;
    return `<div class="history-item ${t.cls}">
      <div class="num">${h.tier==="high" ? "!" : "✓"}</div>
      <div class="content">
        <h4>${h.name}</h4>
        <p>Keluhan: ${h.complaint}</p>
        <span class="pill ${t.pill}">${t.text}</span>
      </div>
    </div>`;
  }

  /* ---------------- INPUT PASIEN ---------------- */
  function onSegChange(segId, val){
    if(segId==="pGender") state.patient.gender = val;
    if(segId==="pPCV") state.patient.pcv = val;
    if(segId==="pChest") state.patient.chest = val;
    if(segId==="vFlare") state.vitals.flare = val;
    if(segId==="vGrunt") state.vitals.grunt = val;
    if(segId.startsWith("danger-")) state.danger[segId.replace("danger-","")] = val;
    validatePatientForm();
  }

  function validatePatientForm(){
    const p = state.patient;
    const ok = $("#pName").value.trim().length>1 && $("#pAge").value && p.gender && p.pcv && p.chest;
    $("#btnToDanger").disabled = !ok;
  }
  $("#pName") && $("#pName").addEventListener("input", ()=>{ state.patient.name=$("#pName").value; validatePatientForm(); });
  $("#pAge") && $("#pAge").addEventListener("input", ()=>{ state.patient.age=$("#pAge").value; validatePatientForm(); });

  $("#btnToDanger") && $("#btnToDanger").addEventListener("click", ()=>{
    if($("#btnToDanger").disabled) return;
    goTo("tanda-bahaya");
  });

  /* ---------------- TANDA BAHAYA ---------------- */
  function renderDangerList(){
    $("#dangerList").innerHTML = DANGER_SIGNS.map(d=>{
      const val = state.danger[d.key] || "tidak";
      return `<div class="danger-item">
        <div class="danger-item-top">
          <div class="danger-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d.icon}</svg></div>
          <div><h4>${d.title}</h4><p>${d.desc}</p></div>
        </div>
        <div class="seg seg-2" id="danger-${d.key}">
          <button data-val="tidak" class="${val==="tidak"?"selected":""}">Tidak Ada</button>
          <button data-val="ada" data-danger="1" class="${val==="ada"?"selected danger":""}">Ada</button>
        </div>
      </div>`;
    }).join("");
  }

  /* ---------------- PANDUAN → PROSES AUSKULTASI (disinkronkan dengan perangkat fisik) ---------------- */
  function renderPointList(activeIdx, mode){
    $("#pointList").innerHTML = POINTS.map((p,i)=>{
      const done = state.points[i];
      let cls = "point-row";
      if(i===activeIdx && (mode==="recording"||mode==="badsignal")) cls+=" active"; else if(done) cls+=" done";
      let statusHtml = "";
      if(done){
        const map = { crackle:["tag-crackle","⚠ Crackle"], wheeze:["tag-wheeze","~ Wheeze"], normal:["tag-normal","✓ Normal"] };
        statusHtml = `<span class="point-status ${map[done.result][0]}">${map[done.result][1]}</span>`;
      } else if(i===activeIdx && mode==="recording"){
        statusHtml = `<span class="point-status" style="color:var(--green-700)">Merekam…</span>`;
      } else if(i===activeIdx && mode==="badsignal"){
        statusHtml = `<span class="point-status tag-wheeze">⚠ Sinyal lemah</span>`;
      }
      return `<div class="${cls}"><div class="point-num">${done?"✓":p.id}</div><div class="point-name">${p.id}. ${p.name}</div>${statusHtml}</div>`;
    }).join("");
    updateLanjutButton();
  }

  function updateLanjutButton(){
    const btn = $("#btnLanjutAuskultasi");
    if(!btn) return;
    const allDone = state.points.length===6 && state.points.every(p=>p && p.result);
    btn.disabled = !allDone;
  }

  function setTimerDisplay(pct, secLabel){
    $("#timerBarFill").style.width = (pct*100)+"%";
    $("#timerNum").textContent = secLabel;
  }

  function syncAuscultationScreen(){
    state.points = new Array(6).fill(null);
    const snap = window.AntarakalaDevice ? window.AntarakalaDevice.getSnapshot() : null;
    if(snap){
      snap.results.forEach((r,i)=>{ if(r) state.points[i] = { id:i+1, name:snap.pointNames[i], result:r.result }; });
      if(snap.state === "recording"){
        $("#activePointLabel").textContent = `Titik Aktif: ${snap.cursor+1}. ${snap.pointNames[snap.cursor]}`;
        renderPointList(snap.cursor, "recording");
      } else if(snap.state === "badsignal"){
        $("#activePointLabel").textContent = `⚠ Sinyal Lemah — Mengulang Titik ${snap.cursor+1}`;
        renderPointList(snap.cursor, "badsignal");
      } else if(snap.state === "allDone"){
        $("#activePointLabel").textContent = "✓ 6 Titik Selesai Direkam";
        renderPointList(-1, "waiting");
      } else {
        $("#activePointLabel").textContent = "Menunggu perangkat mulai merekam…";
        renderPointList(-1, "waiting");
      }
    } else {
      $("#activePointLabel").textContent = "Menunggu perangkat mulai merekam…";
      renderPointList(-1, "waiting");
    }
    setTimerDisplay(0, "00:00 / 00:04");
  }

  let phoneAusTimer = null;

  document.addEventListener("antarakala:point-start", (e)=>{
    const { index, name, duration } = e.detail;
    if(!isScreenVisible("proses-auskultasi")) return;
    $("#activePointLabel").textContent = `Titik Aktif: ${index+1}. ${name}`;
    renderPointList(index, "recording");
    let elapsed = 0;
    clearInterval(phoneAusTimer);
    phoneAusTimer = setInterval(()=>{
      elapsed += 100;
      const pct = clamp(elapsed/(duration*1000), 0, 1);
      setTimerDisplay(pct, `00:${String(Math.min(duration,Math.ceil(elapsed/1000))).padStart(2,"0")} / 00:0${duration}`);
      if(elapsed >= duration*1000) clearInterval(phoneAusTimer);
    }, 100);
  });

  document.addEventListener("antarakala:signal-warning", (e)=>{
    if(!isScreenVisible("proses-auskultasi")) return;
    clearInterval(phoneAusTimer);
    $("#activePointLabel").textContent = `⚠ Sinyal Lemah — Mengulang Titik ${e.detail.index+1}`;
    setTimerDisplay(1, "Mengulang…");
    renderPointList(e.detail.index, "badsignal");
  });

  document.addEventListener("antarakala:point-result", (e)=>{
    const { index, name, result } = e.detail;
    state.points[index] = { id:index+1, name, result };
    if(isScreenVisible("proses-auskultasi")){
      renderPointList(index, "waiting");
      setTimerDisplay(0, "00:00 / 00:04");
      const doneCount = state.points.filter(Boolean).length;
      $("#activePointLabel").textContent = doneCount>=6
        ? "✓ 6 Titik Selesai Direkam"
        : `✓ Titik ${index+1} selesai — bersiap titik berikutnya…`;
    }
  });

  document.addEventListener("antarakala:all-done", ()=>{
    if(isScreenVisible("proses-auskultasi")){
      $("#activePointLabel").textContent = "✓ 6 Titik Selesai Direkam";
      showToast("Auskultasi 6 titik selesai — silakan lanjutkan");
    }
    updateLanjutButton();
  });

  document.addEventListener("antarakala:reset", ()=>{
    if(isScreenVisible("proses-auskultasi")) syncAuscultationScreen();
  });

  $("#btnLanjutAuskultasi") && $("#btnLanjutAuskultasi").addEventListener("click", ()=>{
    if($("#btnLanjutAuskultasi").disabled) return;
    goTo("input-parameter");
  });

  /* ---------------- INPUT PARAMETER SKORING ---------------- */
  function prefillParameter(){
    const idNum = "884-" + String(291 + history.length).padStart(3,"0");
    $("#paramPatientLine").innerHTML = `Pasien: ${state.patient.name || "—"} (ID: ${idNum})<br>Pertemuan: #${13 + history.length}`;
    checkSpo2Warning();
  }
  function checkSpo2Warning(){
    const v = parseFloat($("#vSpo2").value);
    $("#spo2Warning").style.display = (v && v < 93) ? "flex" : "none";
    $("#vSpo2").closest(".unit-input").style.borderRadius="10px";
  }
  $("#vSpo2") && $("#vSpo2").addEventListener("input", checkSpo2Warning);

  $("#btnToProses") && $("#btnToProses").addEventListener("click", ()=>{
    state.vitals.temp = parseFloat($("#vTemp").value) || 36.8;
    state.vitals.spo2 = parseFloat($("#vSpo2").value) || 97;
    if(!state.vitals.flare) state.vitals.flare = "tidak";
    if(!state.vitals.grunt) state.vitals.grunt = "tidak";
    goTo("proses-ai");
    runAIProcessing();
  });

  /* ---------------- PROSES AI ---------------- */
  function runAIProcessing(){
    const rows = $$("#aiSteps .step-row");
    rows.forEach(r=>{ r.classList.remove("done","current"); $(".step-tag",r).textContent="ANTRIAN"; });
    let i=0;
    function next(){
      if(!isScreenVisible("proses-ai")) return;
      if(i>0){ rows[i-1].classList.remove("current"); rows[i-1].classList.add("done"); $(".step-tag",rows[i-1]).textContent="SELESAI"; }
      if(i>=rows.length){
        computeResult();
        setTimeout(()=>{ if(isScreenVisible("proses-ai")) goTo("hasil-skrining"); }, 450);
        return;
      }
      rows[i].classList.add("current");
      $(".step-tag",rows[i]).textContent="MEMPROSES";
      i++;
      setTimeout(next, 750);
    }
    next();
  }

  /* ---------------- SCORING SIMULATION ---------------- */
  function computeResult(){
    const p = state.patient, v = state.vitals;
    const dangerAda = Object.values(state.danger).some(x=>x==="ada");
    const chestAda = p.chest === "ada";
    const override = dangerAda || chestAda || v.spo2 < 90;

    const crackleCount = state.points.filter(pt=>pt && pt.result==="crackle").length;
    const wheezeCount  = state.points.filter(pt=>pt && pt.result==="wheeze").length;

    // component scores (0-2 style, matches paper's weighting logic)
    const spo2Score = v.spo2 < 90 ? 2 : (v.spo2 <= 92 ? 2 : (v.spo2 <= 94 ? 1 : 0));
    const crackleScore = crackleCount >= 1 ? 2 : 0;
    // simulated respiratory rate estimation, loosely tied to age + acoustic findings
    const ageM = parseInt(p.age||"18",10);
    const rrThreshold = ageM < 2 ? 60 : (ageM <= 11 ? 50 : 40);
    const rrBias = crackleCount>=2 ? 14 : (crackleCount===1 ? 6 : -4);
    const rrValue = Math.round(rrThreshold + rrBias + rand(-6,10));
    const rrScore = rrValue >= rrThreshold+10 ? 2 : (rrValue >= rrThreshold ? 1 : 0);
    const tempScore = v.temp >= 38 ? 1 : 0;
    const nasalScore = (v.flare==="ada" || v.grunt==="ada") ? 1 : 0;

    const wheezeDominant = wheezeCount > crackleCount && wheezeCount >= 1;
    let total = spo2Score + crackleScore + rrScore + tempScore + nasalScore;
    if(wheezeDominant) total = Math.max(0, total-2);

    let tier;
    if(override) tier = "high";
    else if(total >= 4) tier = "mid";
    else tier = "low";

    const confidence = tier==="high" ? rand(92,98) : tier==="mid" ? rand(82,92) : rand(75,89);

    // build ranked factors (label, rawValue text, weight 0-100, positive=increases risk)
    const factors = [];
    factors.push({ label:`Oksigen ${v.spo2<95?"Rendah":"Normal"} (${v.spo2}%)`, weight:spo2Score/2*100, positive: spo2Score>0 || v.spo2<90 });
    factors.push({ label:"Tarikan Dinding Dada", weight: chestAda?100:0, positive:true, skip: !chestAda });
    factors.push({ label:`Bunyi Crackle Paru${crackleCount?` (${crackleCount} Titik)`:""}`, weight:crackleScore/2*100, positive:crackleCount>0, skip:crackleCount===0 });
    factors.push({ label:`Demam (${v.temp.toFixed(1)}°C)`, weight:tempScore*100, positive:tempScore>0, skip:tempScore===0 });
    factors.push({ label:`Laju Napas Cepat (${rrValue}/mnt)`, weight:rrScore/2*100, positive:rrScore>0, skip:rrScore===0 });
    factors.push({ label:"Nasal Flaring / Grunting", weight:nasalScore*100, positive:nasalScore>0, skip:nasalScore===0 });
    if(dangerAda){
      const activeSign = DANGER_SIGNS.find(d=>state.danger[d.key]==="ada");
      factors.push({ label:`Tanda Bahaya: ${activeSign?activeSign.title:"Danger Sign"}`, weight:100, positive:true });
    }
    if(wheezeDominant) factors.push({ label:`Wheeze Dominan (${wheezeCount} Titik)`, weight:60, positive:false });

    const finalFactors = factors.filter(f=>!f.skip).sort((a,b)=>b.weight-a.weight).slice(0,5);
    // normalize relative importance (%) for the "kontribusi utama" screen
    const sumW = finalFactors.reduce((s,f)=>s+f.weight,0) || 1;
    finalFactors.forEach(f=> f.relPct = Math.round((f.weight/sumW)*100));

    state.result = {
      tier, confidence, total, override, crackleCount, wheezeCount, rrValue, rrThreshold,
      factors: finalFactors,
    };
  }

  /* ---------------- HASIL SKRINING ---------------- */
  function renderHasil(){
    const r = state.result;
    if(!r) return;
    const banner = $("#resultBanner");
    banner.className = "result-banner " + r.tier;
    $("#resultTitle").textContent = RESULT_TEXT[r.tier].label;
    $("#resultAction").textContent = RESULT_TEXT[r.tier].action;

    const colorMap = { crackle:"#D9364A", wheeze:"#C98A00", normal:"#0E6E4A" };
    const labelMap = { crackle:"Crackle", wheeze:"Wheeze", normal:"Normal" };

    state.points.forEach((pt,i)=>{
      if(!pt) return;
      const dot = $(`#dotPt${i+1}`);
      if(dot) dot.setAttribute("fill", colorMap[pt.result]);
    });

    $("#pointResultList").innerHTML = state.points.filter(Boolean).map((pt,i)=>`
      <div class="point-result">
        <div class="left">
          <div class="circ" style="background:${colorMap[pt.result]}">${i+1}</div>
          <b>${pt.name.toUpperCase()}</b>
        </div>
        <span class="tag-${pt.result}">${labelMap[pt.result]}</span>
      </div>`).join("");
  }

  /* ---------------- PENJELASAN AI ---------------- */
  function renderPenjelasan(){
    const r = state.result;
    if(!r) return;
    const box = $("#aiConclusionBox");
    box.className = "alert " + (r.tier==="high"?"alert-red":r.tier==="mid"?"alert-amber":"alert-green");
    $("#aiConclusionTitle").textContent = "Kesimpulan AI";
    const top = r.factors.slice(0,3).map(f=>f.label.replace(/\s*\(.*?\)/,"").toLowerCase());
    const implication = r.tier==="high" ? "Pneumonia Berat yang membutuhkan rujukan segera ke RS/IGD."
      : r.tier==="mid" ? "kemungkinan Pneumonia yang memerlukan terapi antibiotik oral dan observasi ketat."
      : "kondisi stabil tanpa tanda pneumonia yang signifikan.";
    $("#aiConclusionText").textContent =
      `Pasien dinilai ${RESULT_TEXT[r.tier].label.replace("RISIKO ","Risiko ")} karena ditemukan ${top.join(", ")}. Kondisi ini menunjukkan ${implication}`;

    drawSpectrogram(r.tier, r.crackleCount);
  }

  function drawSpectrogram(tier, crackleCount){
    const canvas = $("#spectroCanvas");
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = "#070908";
    ctx.fillRect(0,0,W,H);

    const cols = 48, rows = 22;
    const cw = W/cols, ch = H/rows;
    const hotChance = tier==="high" ? 0.34 : tier==="mid" ? 0.20 : 0.08;

    for(let x=0;x<cols;x++){
      for(let y=0;y<rows;y++){
        const centerBias = 1 - Math.abs((y/rows)-0.5)*1.3;
        let v = Math.random()*0.5 + Math.random()*centerBias*0.5;
        if(Math.random() < hotChance*centerBias) v = 0.7 + Math.random()*0.3;
        const hue = v>0.62 ? lerpColor([201,54,74], [255,196,0], (v-0.62)/0.38) : lerpColor([12,70,60],[80,190,150], v/0.62);
        ctx.fillStyle = `rgb(${hue[0]},${hue[1]},${hue[2]})`;
        ctx.globalAlpha = 0.55 + v*0.45;
        ctx.fillRect(x*cw, H-(y+1)*ch, cw+0.6, ch+0.6);
      }
    }
    ctx.globalAlpha = 1;
  }
  function lerpColor(a,b,t){
    t = clamp(t,0,1);
    return [ Math.round(a[0]+(b[0]-a[0])*t), Math.round(a[1]+(b[1]-a[1])*t), Math.round(a[2]+(b[2]-a[2])*t) ];
  }

  /* ---------------- FAKTOR RISIKO / KONTRIBUSI ---------------- */
  function factorRowHTML(f, showRightPct){
    const fillClass = !f.positive ? "fill-low" : (f.weight>=70?"fill-high":"fill-mid");
    const barWidth = showRightPct ? f.weight : f.weight; // visual length uses raw weight either way
    return `<div class="factor-row">
      <div class="factor-top">
        <b>${f.label}</b>
        ${showRightPct ? `<span style="color:${f.positive?'var(--red-600)':'var(--green-700)'}">${f.relPct}%</span>` : ""}
      </div>
      <div class="factor-track"><div class="factor-fill ${f.positive? (f.weight>=70?'fill-high':'fill-mid') : 'fill-low'}" style="width:${barWidth}%"></div></div>
    </div>`;
  }

  function renderFaktorRisiko(){
    const r = state.result; if(!r) return;
    $("#whyTitle").textContent = "Mengapa " + RESULT_TEXT[r.tier].label.replace("RISIKO ","Risiko ") + "?";
    $("#factorBars").innerHTML = r.factors.map(f=>factorRowHTML(f,false)).join("");
    $("#confidenceVal").textContent = r.confidence.toFixed(1)+"%";
  }

  function renderFaktorKontribusi(){
    const r = state.result, v = state.vitals, p = state.patient; if(!r) return;
    $("#factorBars2").innerHTML = r.factors.map(f=>factorRowHTML(f,true)).join("");
    $("#vgSpo2").textContent = v.spo2 + "%";
    $("#vgSpo2").className = "val " + (v.spo2<93?"val-danger":"val-ok");
    $("#vgFlare").textContent = v.flare==="ada" ? "Ada" : "Tidak";
    $("#vgFlare").className = "val " + (v.flare==="ada"?"val-danger":"val-ok");
    $("#vgTemp").textContent = v.temp.toFixed(1) + " °C";
    $("#vgTemp").className = "val " + (v.temp>=38?"val-danger":"val-ok");
    $("#vgChest").textContent = p.chest==="ada" ? "Ada" : "Tidak";
    $("#vgChest").className = "val " + (p.chest==="ada"?"val-danger":"val-ok");
    $("#vgGrunt").textContent = v.grunt==="ada" ? "Ada" : "Tidak";
    $("#vgGrunt").className = "val " + (v.grunt==="ada"?"val-danger":"val-ok");
  }

  /* ---------------- SAVE / FINISH ---------------- */
  function finishAndSave(){
    const r = state.result, p = state.patient;
    if(!r){ showToast("Belum ada hasil untuk disimpan"); return; }
    const entry = {
      name: p.name || "Pasien Tanpa Nama",
      id: "RM-2026-" + String(1000+history.length),
      complaint: r.factors[0] ? r.factors[0].label.replace(/\s*\(.*?\)/,"") : "Skrining pneumonia",
      tier: r.tier,
      spo2: state.vitals.spo2,
      hr: Math.round(rand(85,118)),
      when: "Hari ini, " + nowHHMM(),
    };
    history.unshift(entry);
    saveHistory(history);
    showToast("Hasil pemeriksaan tersimpan ke riwayat");
    // reset for next exam
    state.patient = { name:"", age:"", gender:"", pcv:"", chest:"" };
    state.danger = {};
    state.vitals = { temp:36.8, spo2:97, flare:"", grunt:"" };
    state.points = new Array(6).fill(null);
    state.result = null;
    resetPatientForm();
    setTimeout(()=> goTo("beranda"), 300);
  }

  function resetPatientForm(){
    if($("#pName")) $("#pName").value = "";
    if($("#pAge")) $("#pAge").value = "";
    $$(".seg button").forEach(b=>b.classList.remove("selected","danger"));
    if($("#vTemp")) $("#vTemp").value = "36.8";
    if($("#vSpo2")) $("#vSpo2").value = "97";
    validatePatientForm();
  }

  /* ---------------- RIWAYAT ---------------- */
  function renderRiwayat(list){
    const data = list || history;
    const tierMap = { high:{pill:"pill-red", label:"Rujukan"}, mid:{pill:"pill-amber", label:"Pemantauan"}, low:{pill:"pill-green", label:"Selesai"} };
    $("#riwayatList").innerHTML = data.map(h=>{
      const t = tierMap[h.tier];
      return `<div class="history-item ${h.tier==='high'?'high':''}" style="border-left-color:${h.tier==='high'?'var(--red-600)':h.tier==='mid'?'var(--amber-600)':'var(--green-500)'}">
        <div class="num" style="background:${h.tier==='high'?'var(--red-600)':h.tier==='mid'?'var(--amber-600)':'var(--green-700)'}">${h.tier==="high"?"!":"✓"}</div>
        <div class="content" style="width:100%;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <span class="pill ${t.pill}">${t.label}</span>
            <span style="font-size:11px; color:var(--ink-300);">${h.when}</span>
          </div>
          <h4 style="margin-top:6px;">${h.name}</h4>
          <p>ID: ${h.id}</p>
          <p style="margin-top:6px; display:flex; gap:14px;">
            <span>♥ HR: ${h.hr} bpm</span><span>≋ SpO2: ${h.spo2}%</span>
          </p>
        </div>
      </div>`;
    }).join("") || `<p style="font-size:12.5px;color:var(--ink-300);">Tidak ada data ditemukan.</p>`;
  }
  $("#searchRiwayat") && $("#searchRiwayat").addEventListener("input",(e)=>{
    const q = e.target.value.toLowerCase();
    renderRiwayat(history.filter(h=> h.name.toLowerCase().includes(q) || h.id.toLowerCase().includes(q)));
  });

  /* ---------------- REPORT DOWNLOAD ---------------- */
  function downloadReport(){
    const r = state.result;
    if(!r){ showToast("Belum ada hasil untuk diunduh"); return; }
    const p = state.patient, v = state.vitals;
    const html = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">
    <title>Laporan Skrining ANTARAKALA — ${p.name||"Pasien"}</title>
    <style>
      body{font-family:Arial,sans-serif; max-width:640px; margin:40px auto; color:#151A18;}
      h1{color:#0E6E4A; font-size:22px; margin-bottom:2px;}
      .tag{display:inline-block; padding:6px 14px; border-radius:20px; font-weight:700; color:#fff; margin:10px 0 18px;
           background:${r.tier==='high'?'#D9364A':r.tier==='mid'?'#C98A00':'#0E6E4A'};}
      table{width:100%; border-collapse:collapse; margin-bottom:18px;}
      td{padding:7px 4px; border-bottom:1px solid #eee; font-size:13.5px;}
      td:first-child{color:#6B746F; width:45%;}
      h3{font-size:14px; color:#0E6E4A; margin:18px 0 8px;}
      .factor{display:flex; justify-content:space-between; font-size:13px; padding:5px 0; border-bottom:1px dashed #eee;}
      footer{margin-top:26px; font-size:11px; color:#9AA39D; line-height:1.6;}
    </style></head><body>
      <h1>Laporan Hasil Skrining — ANTARAKALA</h1>
      <div class="tag">${RESULT_TEXT[r.tier].label}</div>
      <table>
        <tr><td>Nama Pasien</td><td>${p.name||"—"}</td></tr>
        <tr><td>Usia</td><td>${p.age||"—"} bulan</td></tr>
        <tr><td>Jenis Kelamin</td><td>${p.gender==="L"?"Laki-laki":p.gender==="P"?"Perempuan":"—"}</td></tr>
        <tr><td>SpO2</td><td>${v.spo2}%</td></tr>
        <tr><td>Suhu Tubuh</td><td>${v.temp.toFixed(1)} °C</td></tr>
        <tr><td>Estimasi Laju Napas</td><td>${r.rrValue}/menit (ambang usia: ${r.rrThreshold}/menit)</td></tr>
        <tr><td>Rekomendasi Tindakan</td><td>${RESULT_TEXT[r.tier].action}</td></tr>
        <tr><td>Tingkat Kepercayaan AI</td><td>${r.confidence.toFixed(1)}%</td></tr>
      </table>
      <h3>Faktor Kontribusi Utama (TreeSHAP)</h3>
      ${r.factors.map(f=>`<div class="factor"><span>${f.label}</span><span>${f.relPct}%</span></div>`).join("")}
      <footer>
        Dokumen ini dihasilkan oleh prototipe antarmuka ANTARAKALA untuk keperluan demonstrasi KMIPN VIII 2026.
        Seluruh nilai bersifat simulasi dan tidak merepresentasikan hasil diagnosis medis sesungguhnya.
        Dibuat: ${new Date().toLocaleString("id-ID")}
      </footer>
    </body></html>`;
    const blob = new Blob([html], {type:"text/html"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Laporan_ANTARAKALA_${(p.name||"pasien").replace(/\s+/g,"_")}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Laporan berhasil diunduh");
  }

  /* ---------------- clock ---------------- */
  function nowHHMM(){
    const d = new Date();
    return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
  }
  function tickClock(){ const el = $("#clock"); if(el) el.textContent = nowHHMM(); }

  /* ---------------- init ---------------- */
  function init(){
    renderBottomNav();
    goTo("beranda");
    tickClock();
    setInterval(tickClock, 15000);
    // re-bind nav-item active state after nav render
    const grp = NAV_GROUP["beranda"];
    $$(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.navkey===grp));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
