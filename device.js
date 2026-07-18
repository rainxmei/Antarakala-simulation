/* =========================================================
   ANTARAKALA — Physical Device Simulation
   Satu halaman LCD (sesuai referensi), 3 tombol (kiri/pilih/kanan).
   Device adalah "sumber kebenaran": saat merekam titik di device,
   perangkat mengirim event yang didengarkan oleh simulasi HP (app.js)
   agar progres & hasil selalu identik.
   ========================================================= */
(function(){
  "use strict";

  const POINT_NAMES = [
    "Posterior Atas Kiri","Posterior Atas Kanan","Posterior Bawah Kiri",
    "Posterior Bawah Kanan","Anterior Atas Kiri","Anterior Atas Kanan"
  ];
  const REC_SECONDS = 2;          // durasi rekam per titik (dipercepat utk demo)
  const BAD_SIGNAL_CHANCE = 0.16; // peluang kualitas sinyal rendah per rekaman
  const RESULT_COLORS = { crackle:"#D9364A", wheeze:"#C98A00", normal:"#0E6E4A" };
  const RESULT_LABELS = { crackle:"CRACKLE", wheeze:"WHEEZE", normal:"NORMAL" };

  const D = {
    state: "idle",   // idle | recording | badsignal | complete | allDone
    cursor: 0,
    done: [false,false,false,false,false,false],
    results: [null,null,null,null,null,null], // {result, confidence}
    recElapsed: 0,
    recTimer: null,
    phoneReady: false, // true only when phone/HP is on the "proses-auskultasi" screen
  };

  const $ = (sel) => document.querySelector(sel);
  const lcd = () => $("#deviceLcd");

  function emit(name, detail){
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function weightedResult(){
    const r = Math.random();
    if(r < 0.40) return "crackle";
    if(r < 0.56) return "wheeze";
    return "normal";
  }

  /* ---------- body diagram SVG ---------- */
  function bodySVG(){
    const positions = [
      {n:1, x:44, y:40}, {n:2, x:70, y:40},
      {n:3, x:42, y:62}, {n:4, x:72, y:62},
      {n:5, x:152, y:46}, {n:6, x:178, y:46},
    ];
    const circles = positions.map((p,i)=>{
      const isActive = i === D.cursor;
      const res = D.results[i];
      let fill = "#fff", stroke = "#9AA39D", strokeW = 1.4, textFill = "#3A423F", glow = "";

      if(res){ fill = RESULT_COLORS[res.result]; stroke = fill; textFill = "#fff"; }
      if(isActive && D.state === "idle"){ stroke = "#1C7FD6"; strokeW = 2.4; if(!res){ textFill = "#1C7FD6"; } }
      if(isActive && (D.state === "recording")){
        fill = "#E8720C"; stroke = "#E8720C"; textFill = "#fff";
        glow = `<circle cx="${p.x}" cy="${p.y}" r="12" fill="#E8720C" opacity="0.35"><animate attributeName="r" values="9;14;9" dur="1.1s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.45;0.05;0.45" dur="1.1s" repeatCount="indefinite"/></circle>`;
      }
      if(isActive && D.state === "badsignal"){
        fill = "#fff"; stroke = "#C98A00"; strokeW = 2.4; textFill = "#C98A00";
        glow = `<circle cx="${p.x}" cy="${p.y}" r="12" fill="none" stroke="#C98A00" stroke-width="1.6" opacity="0.7"><animate attributeName="r" values="9;15;9" dur=".8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0.1;0.8" dur=".8s" repeatCount="indefinite"/></circle>`;
      }
      return `${glow}<circle cx="${p.x}" cy="${p.y}" r="7.5" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/><text x="${p.x}" y="${p.y+3}" font-size="8" font-weight="800" text-anchor="middle" fill="${textFill}" font-family="Poppins, sans-serif">${p.n}</text>`;
    }).join("");

    return `<svg class="dlcd-diagram" viewBox="0 0 220 90" xmlns="http://www.w3.org/2000/svg">
      <circle cx="55" cy="16" r="11" fill="none" stroke="#9AA39D" stroke-width="1.4"/>
      <path d="M28 38 Q55 22 82 38 L79 76 Q55 84 31 76 Z" fill="none" stroke="#9AA39D" stroke-width="1.4"/>
      <circle cx="165" cy="16" r="11" fill="none" stroke="#9AA39D" stroke-width="1.4"/>
      <path d="M138 40 Q165 26 192 40 L189 74 Q165 80 141 74 Z" fill="none" stroke="#9AA39D" stroke-width="1.4"/>
      ${circles}
    </svg>`;
  }

  function battWifi(){
    return `<div class="dlcd-status">
      <div class="dlcd-batt"><i></i><i></i><i></i><span class="cap"></span></div>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9AA39D" stroke-width="2.4" stroke-linecap="round"><path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 017 0"/><path d="M5 13a9 9 0 018-2.6M19 13a9 9 0 00-3-2.1"/><circle cx="12" cy="20" r="1" fill="#9AA39D" stroke="none"/></svg>
    </div>`;
  }

  function updateLED(){
    const led = $("#deviceLed");
    if(!led) return;
    const isRecording = D.state === "recording";
    led.classList.toggle("led-green", isRecording);
    led.classList.toggle("led-red", !isRecording);
  }

  /* ---------- single-page render ---------- */
  function render(){
    const el = lcd();
    if(!el) return;
    updateLED();

    if(!D.phoneReady && D.state === "idle"){
      el.innerHTML = `
        <div class="dlcd-header"><b>ANTARAKALA</b>${battWifi()}</div>
        <div class="dlcd-gate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg>
          <b>Menunggu HP</b>
          <span>Buka menu "Panduan Auskultasi" di HP untuk mengaktifkan perangkat ini</span>
        </div>`;
      return;
    }

    const allDone = D.state === "allDone";
    const headerLabel = allDone ? "Selesai 6/6" : `Titik ${D.cursor+1}/6`;

    // progress bar
    let pct = 0, timeLabel = `${REC_SECONDS} detik`;
    if(D.state === "recording"){
      pct = Math.min(100, (D.recElapsed/REC_SECONDS)*100);
      timeLabel = `${Math.max(0, REC_SECONDS - Math.floor(D.recElapsed))} detik`;
    } else if(D.state === "complete" || D.state === "badsignal" || allDone){
      pct = 100; timeLabel = "0 detik";
    }

    // bottom-left status block
    let resultHTML;
    const res = D.results[D.cursor];
    if(allDone){
      resultHTML = `<b style="color:#0E6E4A; font-size:16px;">✓ SELESAI</b><span>Lanjutkan di HP / tablet</span>`;
    } else if(D.state === "recording"){
      resultHTML = `<b style="color:#3A423F;">MEREKAM…</b><span>Jangan gerakkan sensor</span>`;
    } else if(D.state === "badsignal"){
      resultHTML = `<b style="color:#C98A00;">SINYAL RENDAH</b><span>Mengulang otomatis…</span>`;
    } else if(res){
      resultHTML = `<b style="color:${RESULT_COLORS[res.result]};">${RESULT_LABELS[res.result]}</b><span>${res.confidence}% Keyakinan</span>`;
    } else {
      resultHTML = `<b style="color:#3A423F;">SIAP MEREKAM</b><span>Tekan PILIH untuk mulai</span>`;
    }

    const pointLabel = allDone ? "6/6 Titik Terekam" : POINT_NAMES[D.cursor];

    el.innerHTML = `
      <div class="dlcd-header"><b>${headerLabel}</b>${battWifi()}</div>
      <div class="dlcd-bar-row" style="padding:0 6%;">
        <div class="dlcd-bar"><div class="dlcd-bar-fill" style="width:${pct}%"></div></div>
        <b>${timeLabel}</b>
      </div>
      <div class="dlcd-body">
        ${bodySVG()}
        <div class="dlcd-labels"><span>Belakang</span><span>Depan</span></div>
      </div>
      <div class="dlcd-resultrow">
        <div class="dlcd-result">${resultHTML}</div>
        <div class="dlcd-pointname">${pointLabel}</div>
      </div>`;
  }

  /* ---------- transitions ---------- */
  function flashDenied(){
    const el = $(".device");
    if(!el) return;
    el.classList.remove("denied");
    void el.offsetWidth; // restart animation
    el.classList.add("denied");
  }

  function pressKiri(){
    if(!D.phoneReady){ flashDenied(); return; }
    if(D.state !== "idle") return;
    D.cursor = (D.cursor + 5) % 6;
    render();
  }
  function pressKanan(){
    if(!D.phoneReady){ flashDenied(); return; }
    if(D.state !== "idle") return;
    D.cursor = (D.cursor + 1) % 6;
    render();
  }
  function pressPilih(){
    if(!D.phoneReady){ flashDenied(); return; }
    if(D.state === "idle"){
      startRecording();
      return;
    }
    if(D.state === "allDone"){
      D.done = [false,false,false,false,false,false];
      D.results = [null,null,null,null,null,null];
      D.cursor = 0;
      D.state = "idle";
      render();
      emit("antarakala:reset", {});
      return;
    }
    // recording / badsignal: tombol tidak berfungsi, otomatis berjalan
  }

  function startRecording(){
    D.state = "recording";
    D.recElapsed = 0;
    render();
    emit("antarakala:point-start", { index: D.cursor, name: POINT_NAMES[D.cursor], duration: REC_SECONDS });

    clearInterval(D.recTimer);
    D.recTimer = setInterval(()=>{
      D.recElapsed += 0.1;
      if(D.recElapsed >= REC_SECONDS){
        clearInterval(D.recTimer);
        finishRecording();
        return;
      }
      render();
    }, 100);
  }

  function finishRecording(){
    const badSignal = Math.random() < BAD_SIGNAL_CHANCE;
    if(badSignal){
      D.state = "badsignal";
      render();
      emit("antarakala:signal-warning", { index: D.cursor });
      setTimeout(()=>{ startRecording(); }, 1500);
      return;
    }

    const result = weightedResult();
    const confidence = Math.round(85 + Math.random()*14);
    D.results[D.cursor] = { result, confidence };
    D.done[D.cursor] = true;
    D.state = "complete";
    render();
    emit("antarakala:point-result", { index: D.cursor, name: POINT_NAMES[D.cursor], result, confidence });

    setTimeout(()=>{
      const next = D.done.findIndex(v=>!v);
      if(next === -1){
        D.state = "allDone";
        render();
        emit("antarakala:all-done", {});
      } else {
        D.cursor = next;
        D.state = "idle";
        render();
      }
    }, 1100);
  }

  /* ---------- public snapshot for app.js ---------- */
  window.AntarakalaDevice = {
    getSnapshot(){
      return {
        state: D.state,
        cursor: D.cursor,
        done: D.done.slice(),
        results: D.results.slice(),
        pointNames: POINT_NAMES.slice(),
      };
    }
  };

  /* ---------- button wiring with press visual feedback ---------- */
  function bind(){
    document.querySelectorAll(".device-btn").forEach(btn=>{
      const fire = ()=>{
        btn.classList.add("pressed");
        setTimeout(()=>btn.classList.remove("pressed"), 160);
        const which = btn.dataset.devbtn;
        if(which==="kiri") pressKiri();
        else if(which==="kanan") pressKanan();
        else if(which==="pilih") pressPilih();
      };
      btn.addEventListener("click", fire);
    });
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    bind();
    render();
  });

  document.addEventListener("antarakala:phone-nav", (e)=>{
    const ready = e.detail.screen === "proses-auskultasi";
    if(ready !== D.phoneReady){
      D.phoneReady = ready;
      render();
    }
  });
})();
