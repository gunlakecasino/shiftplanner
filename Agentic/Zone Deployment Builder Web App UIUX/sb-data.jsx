// Shared mock data + tokens for both ShiftBuilder variants.
// Values lifted directly from constants.ts / dateUtils.ts / Golden spec.

const SB_TOKENS = {
  // Golden palette (constants.ts)
  zoneColor: {
    Z1:  '#B89708', Z2:  '#B89708',
    Z3:  '#E53935', Z4:  '#E53935', Z5:  '#E53935',
    Z6:  '#B7679A', Z7:  '#1976D2',
    Z8:  '#6B5346', Z9:  '#E53935', Z10: '#43A047',
  },
  rrColor:  { 1: '#B89708', 6: '#B7679A', 7: '#1976D2', 8: '#6B5346', 10: '#43A047' },
  auxColor: { Z9SR: '#E53935', ADM: '#B7679A', TR1: '#FB8C00', TR2: '#FB8C00', SP1: '#1976D2', SP2: '#1976D2' },

  zoneIcon: { Z1:'★', Z2:'◆', Z3:'▲', Z4:'■', Z5:'⬟', Z6:'♥', Z7:'●', Z8:'◐', Z9:'☾', Z10:'✚' },
  rrIcon:   { 1:'★', 6:'♥', 7:'●', 8:'◐', 10:'✚' },
  auxIcon:  { Z9SR:'☾', ADM:'❖', TR1:'✖', TR2:'✖', SP1:'✦', SP2:'✦' },

  // dateUtils.ts — Fri … Thu
  dayColor: ['#C13A14','#0065bf','#4d1a8a','#1f7a3d','#b8860b','#8b4513','#2f4f4f'],
  dayShort: ['F','S','S','M','T','W','T'],
  dayLong:  ['Friday','Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday'],

  // Sheet sizes (globals.css)
  sheetW: 1056,
  sheetH: 816,
};

const SB_ZONES = [
  { key:'Z1',  label:'ZONE 1',  loc:'Main Entry North'   },
  { key:'Z2',  label:'ZONE 2',  loc:'Main Entry South'   },
  { key:'Z3',  label:'ZONE 3',  loc:'Food Court North'   },
  { key:'Z4',  label:'ZONE 4',  loc:'Food Court South'   },
  { key:'Z5',  label:'ZONE 5',  loc:'Slots West'         },
  { key:'Z6',  label:'ZONE 6',  loc:'Slots East'         },
  { key:'Z7',  label:'ZONE 7',  loc:'High Limit'         },
  { key:'Z8',  label:'ZONE 8',  loc:'Table Games North'  },
  { key:'Z9',  label:'ZONE 9',  loc:'Table Games South'  },
  { key:'Z10', label:'ZONE 10', loc:'Poker'              },
];

const SB_RR = [
  { num:1,  label:'RR 1+2', loc:'Main Entry'  },
  { num:6,  label:'RR 6',   loc:'Slots'       },
  { num:7,  label:'RR 7',   loc:'High Limit'  },
  { num:8,  label:'RR 8',   loc:'Table Games' },
  { num:10, label:'RR 10',  loc:'Poker'       },
];

const SB_AUX = [
  { key:'Z9SR', label:'Z9 SR',     loc:'Z9 Smoking Room' },
  { key:'ADM',  label:'ADMIN',     loc:'Floor Admin'     },
  { key:'TR1',  label:'TRASH 1',   loc:'West Trash Run'  },
  { key:'TR2',  label:'TRASH 2',   loc:'East Trash Run'  },
  { key:'SP1',  label:'SUPPORT 1', loc:'Float Support'   },
  { key:'SP2',  label:'SUPPORT 2', loc:'Float Support'   },
];

// PM Overlap (11p–1a) + AM Overlap (5a–7a) — each slot has a standing description
const SB_OVERLAPS = {
  pm: ['OL-PM-0','OL-PM-1','OL-PM-2','OL-PM-3','OL-PM-4','OL-PM-5'],
  am: ['OL-AM-0','OL-AM-1','OL-AM-2','OL-AM-3','OL-AM-4','OL-AM-5'],
};

const SB_OVERLAP_DESCRIPTIONS = {
  'OL-PM-0': 'Glass & Countertops',
  'OL-PM-1': 'Tables & Restrooms',
  'OL-PM-2': 'Vacuuming',
  'OL-PM-3': 'Vacuuming',
  'OL-PM-4': 'Floor Detail',
  'OL-PM-5': 'Bar Polish',
  'OL-AM-0': 'Shkode / CBK',
  'OL-AM-1': 'Hotel Offices / CBK Offices',
  'OL-AM-2': 'Sandhill Cafe / Express / Lobby',
  'OL-AM-3': '131 / Green Rooms',
  'OL-AM-4': 'Family RR Restock',
  'OL-AM-5': 'Smoke Room Touch-up',
};

// 32-name roster, mix of full/AM/PM grave pool
const SB_ROSTER = [
  { id:'tm01', name:'Brandon',   full:'Brandon Calloway',  pool:'Full', hours:'11p–7a', tier:'lead'  },
  { id:'tm02', name:'Marcus',    full:'Marcus Joiner',     pool:'Full', hours:'11p–7a', tier:'sr'    },
  { id:'tm03', name:'Tasha',     full:'Tasha Whitfield',   pool:'Full', hours:'11p–7a' },
  { id:'tm04', name:'Devon',     full:'Devon Rourke',      pool:'Full', hours:'11p–7a' },
  { id:'tm05', name:'Aisha',     full:'Aisha Nasiri',      pool:'Full', hours:'11p–7a' },
  { id:'tm06', name:'Carlos',    full:'Carlos Mendez',     pool:'Full', hours:'11p–7a' },
  { id:'tm07', name:'Jermaine',  full:'Jermaine Tilley',   pool:'Full', hours:'11p–7a' },
  { id:'tm08', name:'Priya',     full:'Priya Kothari',     pool:'Full', hours:'11p–7a' },
  { id:'tm09', name:'Hector',    full:'Hector Aragón',     pool:'Full', hours:'11p–7a' },
  { id:'tm10', name:'Reggie',    full:'Reggie Daugherty',  pool:'Full', hours:'11p–7a' },
  { id:'tm11', name:'Whitney',   full:'Whitney Llanos',    pool:'Full', hours:'11p–7a' },
  { id:'tm12', name:'Tomás',     full:'Tomás Guevara',     pool:'Full', hours:'11p–7a' },
  { id:'tm13', name:'Latoya',    full:'Latoya Bautista',   pool:'Full', hours:'11p–7a' },
  { id:'tm14', name:'Andre',     full:'Andre Pacheco',     pool:'Full', hours:'11p–7a' },
  { id:'tm15', name:'Sasha',     full:'Sasha Hadid',       pool:'Full', hours:'11p–7a' },
  { id:'tm16', name:'Diego',     full:'Diego Vilchis',     pool:'Full', hours:'11p–7a' },
  { id:'tm17', name:'Tyler',     full:'Tyler Okafor',      pool:'Full', hours:'11p–7a' },
  { id:'tm18', name:'Maya',      full:'Maya Saint-Cyr',    pool:'Full', hours:'11p–7a' },
  { id:'tm19', name:'Quincy',    full:'Quincy Freeman',    pool:'Full', hours:'11p–7a' },
  { id:'tm20', name:'Renee',     full:'Renee Jorgensen',   pool:'Full', hours:'11p–7a' },
  { id:'tm21', name:'Ezra',      full:'Ezra Kessler',      pool:'Full', hours:'11p–7a' },
  { id:'tm22', name:'Naomi',     full:'Naomi Castagna',    pool:'Full', hours:'11p–7a' },
  // PM overlap (10p–4a)
  { id:'tm23', name:'Beau',      full:'Beau Egbert',       pool:'PM',   hours:'10p–4a' },
  { id:'tm24', name:'Sandra',    full:'Sandra Quintero',   pool:'PM',   hours:'10p–4a' },
  { id:'tm25', name:'Vince',     full:'Vince Lo',          pool:'PM',   hours:'10p–4a' },
  { id:'tm26', name:'Bria',      full:'Bria Tafoya',       pool:'PM',   hours:'10p–4a' },
  // AM overlap (3a–9a)
  { id:'tm27', name:'Omar',      full:'Omar Rasheed',      pool:'AM',   hours:'3a–9a' },
  { id:'tm28', name:'Kelsey',    full:'Kelsey Albright',   pool:'AM',   hours:'3a–9a' },
  { id:'tm29', name:'Joel',      full:'Joel Boyko',        pool:'AM',   hours:'3a–9a' },
  { id:'tm30', name:'Mira',      full:'Mira Pinheiro',     pool:'AM',   hours:'3a–9a' },
  { id:'tm31', name:'Camille',   full:'Camille Yáñez',     pool:'AM',   hours:'3a–9a' },
  { id:'tm32', name:'Femi',      full:'Femi Okonkwo',      pool:'AM',   hours:'3a–9a' },
];

// Build a believable Wednesday board — 27 of 35 slots filled, a couple locked,
// a couple with notable tasks, breaks distributed across 1/2/3.
const SB_ASSIGNMENTS = {
  Z1:   { tmId:'tm01', tmName:'Brandon',  breakGroup:1, isLocked:true,  tasks:['Pit 3'] },
  Z2:   { tmId:'tm02', tmName:'Marcus',    breakGroup:2,                  tasks:[] },
  Z3:   { tmId:'tm14', tmName:'Andre',   breakGroup:3,                  tasks:['Pre-rinse FC dish'] },
  Z4:   { tmId:'tm07', tmName:'Jermaine',    breakGroup:1,                  tasks:[] },
  Z5:   { tmId:'tm12', tmName:'Tomás',   breakGroup:2,                  tasks:['Sweep 5/8 HL', 'And Zone 6'] },
  Z6:   { tmId:'tm05', tmName:'Aisha',    breakGroup:3,                  tasks:[] },
  Z7:   { tmId:'tm03', tmName:'Tasha', breakGroup:1, isLocked:true,  tasks:['HL spill check'] },
  Z8:   { tmId:'tm04', tmName:'Devon',    breakGroup:2,                  tasks:[] },
  Z9:   { tmId:'tm09', tmName:'Hector',    breakGroup:3,                  tasks:['And Z9SR'] },
  Z10:  { tmId:'tm06', tmName:'Carlos',    breakGroup:1,                  tasks:['Stock poker chips'] },

  MRR1: { tmId:'tm10', tmName:'Reggie', breakGroup:2, tasks:['Buffet RR','Family RR','And Zone 6'] },
  WRR1: { tmId:'tm11', tmName:'Whitney',    breakGroup:2, tasks:['Buffet RR','Family RR'] },
  MRR6: { tmId:'tm17', tmName:'Tyler',    breakGroup:3, tasks:['131 RR','And Zone 7'] },
  WRR6: { tmId:'tm13', tmName:'Latoya',  breakGroup:3, tasks:['131 RR'] },
  MRR7: { tmId:'tm16', tmName:'Diego',   breakGroup:1, tasks:['Assist SR'] },
  WRR7: { tmId:'tm15', tmName:'Sasha',     breakGroup:1, tasks:['Assist SR'] },
  MRR8: { tmId:'tm19', tmName:'Quincy',   breakGroup:2, tasks:['Family RR','TDR RR'] },
  WRR8: { tmId:'tm18', tmName:'Maya', breakGroup:2, tasks:['Family RR','TMBR LR'] },
  MRR10:{ tmId:'tm21', tmName:'Ezra',   breakGroup:3, tasks:['CBK RR','Sweep 9 / 10 / SR','And Zone 10'] },
  WRR10:{ tmId:'tm20', tmName:'Renee', breakGroup:3, tasks:['CBK RR'] },

  Z9SR: { tmId:'tm01', tmName:'Brandon', breakGroup:1, tasks:[] }, // ⚠ demo conflict — also at Z1
  ADM:  { tmId:'tm08', tmName:'Priya',  breakGroup:0, tasks:['Logs · briefs'] },
  TR1:  { tmId:null,   breakGroup:0, tasks:[] }, // open
  TR2:  { tmId:null,   breakGroup:0, tasks:[] }, // open

  // Overlaps
  'OL-PM-0': { tmId:'tm23', tmName:'Beau',    breakGroup:0, tasks:['Bus FC tables'] },
  'OL-PM-1': { tmId:'tm24', tmName:'Sandra',  breakGroup:0, tasks:[] },
  'OL-PM-2': { tmId:'tm25', tmName:'Vince',        breakGroup:0, tasks:[] },
  'OL-PM-3': { tmId:'tm26', tmName:'Bria',    breakGroup:0, tasks:[] },
  'OL-PM-4': { tmId:null,                          breakGroup:0, tasks:[] },
  'OL-PM-5': { tmId:null,                          breakGroup:0, tasks:[] },

  'OL-AM-0': { tmId:'tm27', tmName:'Omar',   breakGroup:0, tasks:[] },
  'OL-AM-1': { tmId:'tm28', tmName:'Kelsey',  breakGroup:0, tasks:['Re-stock RR7'] },
  'OL-AM-2': { tmId:'tm29', tmName:'Joel',     breakGroup:0, tasks:[] },
  'OL-AM-3': { tmId:'tm30', tmName:'Mira',  breakGroup:0, tasks:[] },
  'OL-AM-4': { tmId:'tm31', tmName:'Camille',     breakGroup:0, tasks:[] },
  'OL-AM-5': { tmId:'tm32', tmName:'Femi',   breakGroup:0, tasks:[] },
};

// Names not yet placed (TR1, TR2, OL-PM-4, OL-PM-5 are empty above)
const SB_UNPLACED = [];

// Recent task chips — for the marker pad / type-in-card autocomplete
const SB_RECENT_TASKS = [
  'Pit 3',
  'Sweep 5/8 HL',
  'And Zone 6',
  'Stock paper',
  'Pre-rinse FC dish',
  'Bus FC tables',
  'And Z9SR',
  'Detail elevators',
  'Logs · briefs',
  'Re-stock RR7',
  'Spill check',
  'Touch up smoke area',
];

Object.assign(window, {
  SB_TOKENS, SB_ZONES, SB_RR, SB_AUX, SB_OVERLAPS, SB_OVERLAP_DESCRIPTIONS, SB_ROSTER,
  SB_ASSIGNMENTS, SB_UNPLACED, SB_RECENT_TASKS,
});
