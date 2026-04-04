const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXCEL_PATH = path.join(ROOT, '26-27 Program.xlsx');
const MOBILITY_PATH = path.join(ROOT, '531_warmup_mobility_guide.md');
const OUT_DIR = path.join(ROOT, 'js', 'data');

// Ensure output directory exists
fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── Parse Excel ───────────────────────────────────────────────

const wb = XLSX.readFile(EXCEL_PATH);

// --- Setup Sheet ---
const setup = XLSX.utils.sheet_to_json(wb.Sheets['Setup'], { header: 1, defval: '' });

function findLifts(rows) {
  const lifts = {};
  const liftNames = {
    'Back Squat': 'squat',
    'Bench Press': 'bench',
    'Deadlift': 'deadlift',
    'Overhead Press': 'ohp',
    'OHP': 'ohp'
  };

  for (const row of rows) {
    const cellA = String(row[0] || '').trim();
    for (const [label, key] of Object.entries(liftNames)) {
      if (cellA === label && typeof row[1] === 'number') {
        const oneRM = row[1];
        const tm = Math.round(oneRM * 0.9);
        lifts[key] = { oneRM, tm };
      }
    }
  }
  return lifts;
}

const lifts = findLifts(setup);
console.log('Lifts found:', JSON.stringify(lifts, null, 2));

// --- Calendar Sheet ---
const calSheet = wb.Sheets['Calendar'];
const calendar = XLSX.utils.sheet_to_json(calSheet, { header: 1, defval: '' });

function parseCalendar(rows) {
  const weeks = [];
  // Find the header row
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map(c => String(c).toLowerCase().trim());
    if (row.some(c => c.includes('week')) && row.some(c => c.includes('cycle'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    console.warn('Could not find Calendar header row, trying row 0');
    headerIdx = 0;
  }

  const header = rows[headerIdx].map(c => String(c).toLowerCase().trim());
  console.log('Calendar header:', header);

  // Find column indices
  const findCol = (keywords) => {
    return header.findIndex(h => keywords.some(k => h.includes(k)));
  };

  const weekCol = findCol(['week']);
  const cycleCol = findCol(['cycle']);
  const fiveThreeOneCol = findCol(['5/3/1', '531', 'week type']);
  const bbbCol = findCol(['bbb']);
  const cardioCol = findCol(['cardio']);
  const dayColNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayCols = {};
  for (const day of dayColNames) {
    const idx = header.findIndex(h => h.startsWith(day));
    if (idx !== -1) dayCols[day] = idx;
  }

  console.log('Column indices:', { weekCol, cycleCol, fiveThreeOneCol, bbbCol, cardioCol, dayCols });

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const weekNum = row[weekCol];
    if (weekNum === '' || weekNum === undefined || weekNum === null) continue;
    if (typeof weekNum !== 'number' && isNaN(parseFloat(weekNum))) continue;

    const week = {
      week: parseFloat(weekNum),
      cycle: typeof row[cycleCol] === 'number' ? row[cycleCol] : parseFloat(row[cycleCol]) || 0,
      fiveThreeOneWeek: String(row[fiveThreeOneCol] || '').trim(),
      bbbPercent: row[bbbCol] || '',
      cardioBlock: String(row[cardioCol] || '').trim(),
      days: {}
    };

    for (const [day, col] of Object.entries(dayCols)) {
      const val = row[col];
      if (val !== '' && val !== undefined && val !== null) {
        week.days[day] = String(val).trim();
      }
    }

    weeks.push(week);
  }
  return weeks;
}

const calendarWeeks = parseCalendar(calendar);
console.log(`Parsed ${calendarWeeks.length} weeks from Calendar`);
if (calendarWeeks.length > 0) {
  console.log('First week:', JSON.stringify(calendarWeeks[0], null, 2));
}

// --- Workout Log Sheet ---
// Format from Excel: rows are [Exercise, Set, TargetReps, PrescribedWt, ...]
// Accessory rows: [Name, '', reps, 'SetsxReps', weight?, ...]
// BBB rows: [Name or '', 'n/5', reps, weight, ...]
const workoutLog = XLSX.utils.sheet_to_json(wb.Sheets['Workout Log'], { header: 1, defval: '' });

function parseWorkoutDetails(rows) {
  const accessories = { squat: [], bench: [], deadlift: [], ohp: [] };
  const bbbLifts = { squat: 'Back Squat', bench: 'Bench Press', deadlift: 'RDL', ohp: 'OHP' };

  let currentLift = null;
  let inAccessories = false;

  for (const row of rows) {
    const cellA = String(row[0] || '').trim();
    const cellALower = cellA.toLowerCase();

    // Detect day sections
    if (cellALower.includes('monday') && cellALower.includes('squat')) { currentLift = 'squat'; inAccessories = false; }
    else if (cellALower.includes('tuesday') && cellALower.includes('bench')) { currentLift = 'bench'; inAccessories = false; }
    else if (cellALower.includes('thursday') && cellALower.includes('deadlift')) { currentLift = 'deadlift'; inAccessories = false; }
    else if (cellALower.includes('friday') && (cellALower.includes('ohp') || cellALower.includes('overhead'))) { currentLift = 'ohp'; inAccessories = false; }

    // Detect BBB lift name (to know what the BBB exercise is called)
    if (currentLift && cellALower.startsWith('bbb')) {
      bbbLifts[currentLift] = cellA.replace(/^BBB\s*/i, '');
    }

    // Detect accessory section
    if (cellALower === 'accessories') { inAccessories = true; continue; }

    // Collect accessories - format: [Name, '', reps, 'SxR scheme', weight?]
    if (inAccessories && currentLift && cellA && cellA.length > 2 &&
        !cellALower.includes('session') && !cellALower.includes('note')) {
      const name = cellA;
      const setsReps = String(row[3] || '').trim(); // e.g. "5 × 10", "3 × 15"
      const weight = row[4] || row[5] || '';

      let desc = setsReps ? `${name} ${setsReps}` : name;
      if (weight && typeof weight === 'number') {
        desc += ` @${weight} lb`;
      }
      accessories[currentLift].push(desc);
    }

    // End accessory section at next day or blank gap after accessories
    if (inAccessories && cellALower.includes('—')) { inAccessories = false; }
  }

  return { accessories, bbbLifts };
}

const { accessories, bbbLifts } = parseWorkoutDetails(workoutLog);
console.log('Accessories:', JSON.stringify(accessories, null, 2));
console.log('BBB Lifts:', JSON.stringify(bbbLifts, null, 2));

// --- Cardio Zones from Setup ---
function findCardioZones(rows) {
  const zones = {};
  for (const row of rows) {
    const label = String(row[0] || '').trim().toLowerCase();
    if (label.includes('ftp') && typeof row[1] === 'number') zones.ftp = row[1];
    if (label.includes('max hr') || label.includes('max heart')) {
      if (typeof row[1] === 'number') zones.maxHR = row[1];
    }
    if (label.includes('zone 2') && label.includes('hr')) zones.zone2HR = String(row[1] || '');
    if (label.includes('zone 2') && label.includes('watt')) zones.zone2Watts = String(row[1] || '');
  }
  return zones;
}

const cardioZones = findCardioZones(setup);

// --- BBB Progression ---
const bbbProgression = [
  { cycles: [1, 2], percent: 0.50 },
  { cycles: [3, 4], percent: 0.55 },
  { cycles: [5, 6, 7, 8, 9, 10, 11, 12, 13], percent: 0.60 }
];

// --- Assemble workouts.json ---
const workoutsData = {
  programStart: '2026-04-06',
  lifts,
  bbbProgression,
  weekSchemes: {
    '1': [0.65, 0.75, 0.85],
    '2': [0.70, 0.80, 0.90],
    '3': [0.75, 0.85, 0.95],
    'deload': [0.40, 0.50, 0.60]
  },
  weekReps: {
    '1': ['5', '5', '5+'],
    '2': ['3', '3', '3+'],
    '3': ['5', '3', '1+'],
    'deload': ['5', '5', '5']
  },
  warmupSets: [
    { percent: 0.40, reps: 5 },
    { percent: 0.50, reps: 5 },
    { percent: 0.60, reps: 3 }
  ],
  weeklySchedule: {
    monday: { type: 'lift', lift: 'squat', name: 'Squat + BBB', bbbName: bbbLifts.squat },
    tuesday: { type: 'lift', lift: 'bench', name: 'Bench Press + BBB', bbbName: bbbLifts.bench },
    wednesday: { type: 'cardio', name: 'Cardio' },
    thursday: { type: 'lift', lift: 'deadlift', name: 'Deadlift + BBB', bbbName: bbbLifts.deadlift },
    friday: { type: 'lift', lift: 'ohp', name: 'OHP + BBB', bbbName: bbbLifts.ohp },
    saturday: { type: 'cardio', name: 'Cardio - Long Zone 2' },
    sunday: { type: 'rest', name: 'Rest Day' }
  },
  accessories,
  cardioZones,
  calendar: calendarWeeks
};

fs.writeFileSync(
  path.join(OUT_DIR, 'workouts.json'),
  JSON.stringify(workoutsData, null, 2)
);
console.log('\nWrote workouts.json');

// ─── Parse Mobility Markdown ───────────────────────────────────

const md = fs.readFileSync(MOBILITY_PATH, 'utf-8');

function parseMobility(text) {
  const result = {
    monday: { title: 'Squat Day Warm-Up', targetAreas: 'Hips, ankles, thoracic spine', exercises: [] },
    tuesday: { title: 'Bench Day Warm-Up', targetAreas: 'Shoulder capsule, rotator cuff, thoracic spine', exercises: [] },
    thursday: { title: 'Deadlift Day Warm-Up', targetAreas: 'Hamstrings, hip hinge pattern, thoracic spine', exercises: [] },
    friday: { title: 'OHP Day Warm-Up', targetAreas: 'Shoulder flexion, lats, thoracic extension', exercises: [] },
    rampUp: [
      { percent: 0.40, reps: 5 },
      { percent: 0.50, reps: 5 },
      { percent: 0.60, reps: 3 }
    ],
    postLift: {
      monday: { type: 'Lower Body Stretch', duration: '5-10 min', focus: 'Quads, hamstrings, hip flexors, glutes' },
      tuesday: { type: 'Upper Body Stretch', duration: '5-10 min', focus: 'Chest, lats, shoulders, triceps' },
      thursday: { type: 'Lower Body Stretch', duration: '5-10 min', focus: 'Hamstrings, glutes, hip flexors, lower back' },
      friday: { type: 'Upper Body Stretch', duration: '5-10 min', focus: 'Shoulders, lats, chest, thoracic spine' }
    },
    sunday: {
      type: 'Yoga',
      duration: '20-30 min',
      notes: 'Search for "Slow Flow" or "Beginner Yoga Flow" on Peloton. Prioritize hip openers and shoulder stretches.'
    }
  };

  // Parse exercise tables from markdown
  const sections = {
    'Monday': 'monday',
    'Tuesday': 'tuesday',
    'Thursday': 'thursday',
    'Friday': 'friday'
  };

  for (const [dayLabel, dayKey] of Object.entries(sections)) {
    // Find the section for this day
    const sectionRegex = new RegExp(`### ${dayLabel}[^#]*`, 's');
    const match = text.match(sectionRegex);
    if (!match) continue;

    const section = match[0];
    // Parse table rows (skip header and separator)
    const tableRows = section.split('\n').filter(line => line.startsWith('|') && !line.includes('---') && !line.toLowerCase().includes('order'));

    for (const row of tableRows) {
      const cols = row.split('|').map(c => c.trim()).filter(c => c);
      if (cols.length >= 4) {
        result[dayKey].exercises.push({
          order: parseInt(cols[0]) || 0,
          name: cols[1],
          reps: cols[2],
          cue: cols[3]
        });
      }
    }
  }

  return result;
}

const mobilityData = parseMobility(md);
console.log('Mobility exercises per day:');
for (const day of ['monday', 'tuesday', 'thursday', 'friday']) {
  console.log(`  ${day}: ${mobilityData[day].exercises.length} exercises`);
}

fs.writeFileSync(
  path.join(OUT_DIR, 'mobility.json'),
  JSON.stringify(mobilityData, null, 2)
);
console.log('Wrote mobility.json');

console.log('\nBuild complete!');
