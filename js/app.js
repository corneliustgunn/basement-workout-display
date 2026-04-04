(async function () {
  // ─── Load Data ─────────────────────────────────────────────
  const [workouts, mobility] = await Promise.all([
    fetch('js/data/workouts.json').then(r => r.json()),
    fetch('js/data/mobility.json').then(r => r.json())
  ]);

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // ─── Date Calculation ──────────────────────────────────────
  const PROGRAM_START = new Date('2026-04-06T00:00:00');
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function getProgramInfo(date) {
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const start = new Date(PROGRAM_START.getFullYear(), PROGRAM_START.getMonth(), PROGRAM_START.getDate());
    const diffMs = today - start;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { status: 'pre', daysUntilStart: Math.abs(diffDays), dayOfWeek: DAYS[today.getDay()] };
    }

    const totalWeeks = 52; // 13 cycles × 4 weeks
    const weekNumber = Math.floor(diffDays / 7); // 0-indexed

    if (weekNumber >= totalWeeks) {
      return { status: 'post', dayOfWeek: DAYS[today.getDay()] };
    }

    const cycle = Math.floor(weekNumber / 4) + 1;       // 1-indexed
    const weekInCycle = (weekNumber % 4) + 1;            // 1-4 (4 = deload)
    const dayOfWeek = DAYS[today.getDay()];
    const isDeload = weekInCycle === 4;
    const fiveThreeOneWeek = isDeload ? 'deload' : String(weekInCycle);

    // Determine BBB percentage for this cycle
    let bbbPercent = 0.50;
    for (const prog of workouts.bbbProgression) {
      if (prog.cycles.includes(cycle)) {
        bbbPercent = prog.percent;
        break;
      }
    }

    // Get cardio block from calendar if available
    let cardioBlock = '';
    const calWeek = workouts.calendar.find(w => w.week === weekNumber + 1);
    if (calWeek) cardioBlock = calWeek.cardioBlock;

    return {
      status: 'active',
      cycle,
      weekInCycle,
      fiveThreeOneWeek,
      isDeload,
      dayOfWeek,
      bbbPercent,
      cardioBlock,
      weekNumber: weekNumber + 1
    };
  }

  // ─── Weight Calculation ────────────────────────────────────
  function roundTo5(weight) {
    return Math.round(weight / 5) * 5;
  }

  function getMainSets(liftKey, weekType) {
    const tm = workouts.lifts[liftKey].tm;
    const percentages = workouts.weekSchemes[weekType];
    const reps = workouts.weekReps[weekType];

    return percentages.map((pct, i) => ({
      reps: reps[i],
      weight: roundTo5(tm * pct),
      percent: Math.round(pct * 100),
      isAmrap: reps[i].includes('+')
    }));
  }

  function getWarmupSets(liftKey) {
    const tm = workouts.lifts[liftKey].tm;
    return workouts.warmupSets.map(s => ({
      reps: s.reps,
      weight: roundTo5(tm * s.percent),
      percent: Math.round(s.percent * 100)
    }));
  }

  function getBBBWeight(liftKey, bbbPercent) {
    const tm = workouts.lifts[liftKey].tm;
    return roundTo5(tm * bbbPercent);
  }

  // ─── Quote Rotation ────────────────────────────────────────
  let quoteIndex = Math.floor(Math.random() * QUOTES.length);

  function getNextQuote() {
    quoteIndex = (quoteIndex + 1) % QUOTES.length;
    return QUOTES[quoteIndex];
  }

  function shuffleQuotes() {
    for (let i = QUOTES.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [QUOTES[i], QUOTES[j]] = [QUOTES[j], QUOTES[i]];
    }
  }
  shuffleQuotes();

  // ─── Render Functions ──────────────────────────────────────
  function renderHeader(date, info) {
    const dayIdx = date.getDay();
    document.getElementById('day-name').textContent = DAY_LABELS[dayIdx];
    document.getElementById('date-display').textContent = date.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });

    if (info.status === 'active') {
      const schedule = workouts.weeklySchedule[info.dayOfWeek];
      let title = schedule.name;
      if (info.isDeload && schedule.type === 'lift') {
        title += ' (Deload)';
      }
      document.getElementById('workout-title').textContent = title;

      let cycleText = `Cycle ${info.cycle} · Week ${info.weekInCycle}`;
      if (info.isDeload) cycleText += ' (Deload)';
      if (info.cardioBlock) cycleText += ` · ${info.cardioBlock}`;
      document.getElementById('cycle-info').textContent = cycleText;
    } else {
      document.getElementById('workout-title').textContent = '';
      document.getElementById('cycle-info').textContent = '';
    }
  }

  function renderMobility(dayOfWeek, liftKey, info) {
    const container = document.getElementById('mobility-content');
    const dayMobility = mobility[dayOfWeek];

    if (!dayMobility) {
      container.innerHTML = '<p style="color: var(--text-muted);">No mobility routine for today.</p>';
      return;
    }

    let html = '';

    // Dynamic warm-up section
    html += `<div class="mobility-section">`;
    html += `<div class="mobility-section-title">Dynamic Warm-Up</div>`;
    html += `<div class="target-areas">${dayMobility.targetAreas}</div>`;
    html += `<ul class="exercise-list">`;
    for (const ex of dayMobility.exercises) {
      html += `
        <li class="exercise-item">
          <span class="exercise-number">${ex.order}</span>
          <div class="exercise-details">
            <span class="exercise-name">${ex.name}</span>
            <span class="exercise-reps">${ex.reps}</span>
            <div class="exercise-cue">${ex.cue}</div>
          </div>
        </li>`;
    }
    html += `</ul></div>`;

    // Barbell ramp-up sets
    if (liftKey) {
      const warmups = getWarmupSets(liftKey);
      html += `<div class="mobility-section">`;
      html += `<div class="mobility-section-title">Barbell Ramp-Up</div>`;
      html += `<ul class="rampup-list">`;
      for (const set of warmups) {
        html += `
          <li class="rampup-item">
            <span class="rampup-reps">${set.reps} reps</span>
            <span class="rampup-weight">${set.weight} lb</span>
            <span class="rampup-percent">(${set.percent}%)</span>
          </li>`;
      }
      html += `</ul></div>`;
    }

    // Post-lift stretch
    const postLift = mobility.postLift[dayOfWeek];
    if (postLift) {
      html += `<div class="mobility-section">`;
      html += `<div class="mobility-section-title">Post-Lift Stretch</div>`;
      html += `<div class="postlift-info">
        <div class="postlift-type">${postLift.type}</div>
        <div class="postlift-duration">${postLift.duration}</div>
        <div class="postlift-focus">${postLift.focus}</div>
      </div></div>`;
    }

    container.innerHTML = html;
  }

  function renderWorkout(liftKey, info) {
    const container = document.getElementById('workout-content');
    const schedule = workouts.weeklySchedule[info.dayOfWeek];
    const weekType = info.fiveThreeOneWeek;
    let html = '';

    // Warm-up sets
    const warmups = getWarmupSets(liftKey);
    html += `<div class="workout-section section-warmup">`;
    html += `<div class="workout-section-title">Warm-Up Sets</div>`;
    html += `<ul class="set-list">`;
    for (const set of warmups) {
      html += `
        <li class="set-item">
          <span class="set-reps">${set.reps} reps</span>
          <span class="set-weight">${set.weight} lb</span>
          <span class="set-percent">${set.percent}%</span>
        </li>`;
    }
    html += `</ul></div>`;

    // Main 5/3/1 sets
    const mainSets = getMainSets(liftKey, weekType);
    const weekLabel = info.isDeload ? 'Deload' : `5/3/1 Week ${info.weekInCycle}`;
    html += `<div class="workout-section section-main">`;
    html += `<div class="workout-section-title">Main Sets — ${weekLabel}</div>`;
    html += `<ul class="set-list">`;
    for (const set of mainSets) {
      html += `
        <li class="set-item">
          <span class="set-reps">${set.reps} reps</span>
          <span class="set-weight">${set.weight} lb</span>
          <span class="set-percent">${set.percent}%</span>
          ${set.isAmrap ? '<span class="set-amrap">AMRAP</span>' : ''}
        </li>`;
    }
    html += `</ul></div>`;

    // BBB supplemental sets
    const bbbWeight = getBBBWeight(liftKey, info.bbbPercent);
    const bbbName = schedule.bbbName || schedule.name.split(' + ')[0];
    const bbbPctDisplay = Math.round(info.bbbPercent * 100);
    html += `<div class="workout-section section-bbb">`;
    html += `<div class="workout-section-title">BBB ${bbbName} — 5×10 @ ${bbbPctDisplay}%</div>`;
    html += `<ul class="set-list">`;
    for (let i = 1; i <= 5; i++) {
      html += `
        <li class="set-item">
          <span class="set-reps">10 reps</span>
          <span class="set-weight">${bbbWeight} lb</span>
          <span class="set-percent">Set ${i}/5</span>
        </li>`;
    }
    html += `</ul></div>`;

    // Accessories
    const accs = workouts.accessories[liftKey];
    if (accs && accs.length > 0) {
      html += `<div class="workout-section section-accessories">`;
      html += `<div class="workout-section-title">Accessories</div>`;
      html += `<ul class="accessory-list">`;
      for (const acc of accs) {
        html += `<li class="accessory-item">${acc}</li>`;
      }
      html += `</ul></div>`;
    }

    container.innerHTML = html;
  }

  function startQuoteRotation(isFullscreen) {
    const textEl = isFullscreen ? document.getElementById('rest-quote-text') : document.getElementById('quote-text');
    const authorEl = isFullscreen ? document.getElementById('rest-quote-author') : document.getElementById('quote-author');
    const interval = isFullscreen ? 15000 : 15000;

    function showQuote() {
      const quote = getNextQuote();
      textEl.classList.add('fade-out');
      authorEl.classList.add('fade-out');

      setTimeout(() => {
        textEl.textContent = quote.text;
        authorEl.textContent = quote.author;
        textEl.classList.remove('fade-out');
        authorEl.classList.remove('fade-out');
      }, 500);
    }

    // Show first immediately
    const firstQuote = getNextQuote();
    textEl.textContent = firstQuote.text;
    authorEl.textContent = firstQuote.author;

    setInterval(showQuote, interval);
  }

  // ─── Main Render ───────────────────────────────────────────
  function render() {
    const today = new Date();
    const info = getProgramInfo(today);

    renderHeader(today, info);

    if (info.status === 'pre') {
      // Show countdown
      document.getElementById('rest-layout').classList.remove('hidden');
      document.getElementById('rest-layout').innerHTML = `
        <div class="countdown">
          <div class="countdown-title">Program Starts Soon</div>
          <div class="countdown-days">${info.daysUntilStart}</div>
          <div class="countdown-label">days until April 6, 2026</div>
        </div>`;
      return;
    }

    if (info.status === 'post') {
      document.getElementById('rest-layout').classList.remove('hidden');
      document.getElementById('rest-layout').innerHTML = `
        <div class="countdown">
          <div class="countdown-title">Program Complete!</div>
          <div class="countdown-label">52 weeks of hard work — well done.</div>
        </div>`;
      startQuoteRotation(true);
      return;
    }

    const schedule = workouts.weeklySchedule[info.dayOfWeek];

    if (schedule.type === 'lift') {
      // Show two-column layout + quote bar
      document.getElementById('lift-layout').classList.remove('hidden');
      document.getElementById('quote-bar').classList.remove('hidden');

      renderMobility(info.dayOfWeek, schedule.lift, info);
      renderWorkout(schedule.lift, info);
      startQuoteRotation(false);
    } else {
      // Cardio or rest day — fullscreen quotes
      document.getElementById('rest-layout').classList.remove('hidden');
      startQuoteRotation(true);
    }
  }

  render();
})();
