(async function () {
  // ─── Load Data ─────────────────────────────────────────────
  const [workouts, mobility] = await Promise.all([
    fetch('js/data/workouts.json').then(r => r.json()),
    fetch('js/data/mobility.json').then(r => r.json())
  ]);

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // ─── State ─────────────────────────────────────────────────
  let selectedDate = new Date();
  let quoteIntervalId = null;

  // ─── Date Calculation ──────────────────────────────────────
  const PROGRAM_START = new Date('2026-04-06T00:00:00');
  const PROGRAM_END_EXCLUSIVE = new Date('2027-04-05T00:00:00'); // day after last program day
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function toLocalDate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function getProgramInfo(date) {
    const today = toLocalDate(date);
    const start = toLocalDate(PROGRAM_START);
    const diffMs = today - start;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { status: 'pre', daysUntilStart: Math.abs(diffDays), dayOfWeek: DAYS[today.getDay()] };
    }

    const totalWeeks = 52; // 13 cycles x 4 weeks
    const weekNumber = Math.floor(diffDays / 7); // 0-indexed

    if (weekNumber >= totalWeeks) {
      return { status: 'post', dayOfWeek: DAYS[today.getDay()] };
    }

    const cycle = Math.floor(weekNumber / 4) + 1;
    const weekInCycle = (weekNumber % 4) + 1;
    const dayOfWeek = DAYS[today.getDay()];
    const isDeload = weekInCycle === 4;
    const fiveThreeOneWeek = isDeload ? 'deload' : String(weekInCycle);

    let bbbPercent = 0.50;
    for (const prog of workouts.bbbProgression) {
      if (prog.cycles.includes(cycle)) {
        bbbPercent = prog.percent;
        break;
      }
    }

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

  function stopQuoteRotation() {
    if (quoteIntervalId) {
      clearInterval(quoteIntervalId);
      quoteIntervalId = null;
    }
  }

  function startQuoteRotation(isFullscreen) {
    stopQuoteRotation();

    const textEl = isFullscreen ? document.getElementById('rest-quote-text') : document.getElementById('quote-text');
    const authorEl = isFullscreen ? document.getElementById('rest-quote-author') : document.getElementById('quote-author');

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

    quoteIntervalId = setInterval(showQuote, 15000);
  }

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

      let cycleText = `Cycle ${info.cycle} \u00B7 Week ${info.weekInCycle}`;
      if (info.isDeload) cycleText += ' (Deload)';
      if (info.cardioBlock) cycleText += ` \u00B7 ${info.cardioBlock}`;
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

    const mainSets = getMainSets(liftKey, weekType);
    const weekLabel = info.isDeload ? 'Deload' : `5/3/1 Week ${info.weekInCycle}`;
    html += `<div class="workout-section section-main">`;
    html += `<div class="workout-section-title">Main Sets \u2014 ${weekLabel}</div>`;
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

    const bbbWeight = getBBBWeight(liftKey, info.bbbPercent);
    const bbbName = schedule.bbbName || schedule.name.split(' + ')[0];
    const bbbPctDisplay = Math.round(info.bbbPercent * 100);
    html += `<div class="workout-section section-bbb">`;
    html += `<div class="workout-section-title">BBB ${bbbName} \u2014 5\u00D710 @ ${bbbPctDisplay}%</div>`;
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

  // ─── Navigator ─────────────────────────────────────────────
  const navDatePicker = document.getElementById('nav-date-picker');
  const navPrev = document.getElementById('nav-prev');
  const navNext = document.getElementById('nav-next');
  const navToday = document.getElementById('nav-today');
  const navOffsetLabel = document.getElementById('nav-offset-label');

  // Set picker bounds to program range (with some margin)
  navDatePicker.min = '2026-04-06';
  navDatePicker.max = '2027-04-04';

  function formatDateForInput(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  function updateNavigator() {
    const now = new Date();
    navDatePicker.value = formatDateForInput(selectedDate);

    const isToday = isSameDay(selectedDate, now);
    navToday.classList.toggle('is-today', isToday);

    if (isToday) {
      navOffsetLabel.classList.add('hidden');
    } else {
      const diffDays = Math.round((toLocalDate(selectedDate) - toLocalDate(now)) / (1000 * 60 * 60 * 24));
      const sign = diffDays > 0 ? '+' : '';
      navOffsetLabel.textContent = `${sign}${diffDays}d from today`;
      navOffsetLabel.classList.remove('hidden');
    }
  }

  function navigateTo(date) {
    selectedDate = toLocalDate(date);
    render();
  }

  function shiftDay(delta) {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + delta);
    navigateTo(next);
  }

  navPrev.addEventListener('click', () => shiftDay(-1));
  navNext.addEventListener('click', () => shiftDay(1));

  navToday.addEventListener('click', () => {
    if (!isSameDay(selectedDate, new Date())) {
      navigateTo(new Date());
    }
  });

  navDatePicker.addEventListener('change', () => {
    if (navDatePicker.value) {
      // Parse as local date (avoid timezone shift)
      const [y, m, d] = navDatePicker.value.split('-').map(Number);
      navigateTo(new Date(y, m - 1, d));
    }
  });

  // Keyboard shortcuts: left/right arrow when not focused on input
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') { shiftDay(-1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { shiftDay(1); e.preventDefault(); }
    if (e.key === 't' || e.key === 'T') { navigateTo(new Date()); e.preventDefault(); }
  });

  // ─── Main Render ───────────────────────────────────────────
  function resetLayout() {
    document.getElementById('lift-layout').classList.add('hidden');
    document.getElementById('rest-layout').classList.add('hidden');
    document.getElementById('quote-bar').classList.add('hidden');

    // Reset rest-layout to its original quote structure
    const restLayout = document.getElementById('rest-layout');
    restLayout.innerHTML = `
      <div id="rest-quote" class="rest-quote">
        <blockquote id="rest-quote-text" class="rest-quote-text"></blockquote>
        <cite id="rest-quote-author" class="rest-quote-author"></cite>
      </div>`;

    stopQuoteRotation();
  }

  function render() {
    resetLayout();
    updateNavigator();

    const date = selectedDate;
    const info = getProgramInfo(date);

    renderHeader(date, info);

    if (info.status === 'pre') {
      const restLayout = document.getElementById('rest-layout');
      restLayout.classList.remove('hidden');
      restLayout.innerHTML = `
        <div class="countdown">
          <div class="countdown-title">Program Starts Soon</div>
          <div class="countdown-days">${info.daysUntilStart}</div>
          <div class="countdown-label">days until April 6, 2026</div>
        </div>`;
      return;
    }

    if (info.status === 'post') {
      const restLayout = document.getElementById('rest-layout');
      restLayout.classList.remove('hidden');
      restLayout.innerHTML = `
        <div class="countdown">
          <div class="countdown-title">Program Complete!</div>
          <div class="countdown-label">52 weeks of hard work \u2014 well done.</div>
        </div>`;
      startQuoteRotation(true);
      return;
    }

    const schedule = workouts.weeklySchedule[info.dayOfWeek];

    if (schedule.type === 'lift') {
      document.getElementById('lift-layout').classList.remove('hidden');
      document.getElementById('quote-bar').classList.remove('hidden');

      renderMobility(info.dayOfWeek, schedule.lift, info);
      renderWorkout(schedule.lift, info);
      startQuoteRotation(false);
    } else {
      document.getElementById('rest-layout').classList.remove('hidden');
      startQuoteRotation(true);
    }
  }

  render();
})();
