/**
 * Every visible string in the game-lab prototype. Kept in one file so
 * test/copy-claims.test.ts can scan it with the same rules as the site.
 *
 * Fiction rules (docs/game/the-edge-returns-design.md, section 2.1): the Edge
 * meter is a game stat, never a measurement of real knives. No claims about
 * timing, safety, equipment or cutting performance. The service is described
 * only as pickup, sharpening and return.
 */

export const COPY = {
  title: "The Edge Returns",
  kicker: "A Westfield Knife Care kitchen game",
  start: "Start",
  howToPlay: "How to play",
  length: "Level length",
  quick: "Quick",
  full: "Full",
  sound: "Sound",
  on: "On",
  off: "Off",
  motion: "Motion",
  motionSystem: "Device",
  motionReduce: "Reduced",
  motionFull: "Full",
  loading: "Setting the counter…",
  prototype: "Prototype. Nothing you do here is sent anywhere.",

  mode: "Game",
  modeStreet: "Street",
  modeClassic: "Classic",
  knife: "Knife",
  knives: {
    japanese: {
      name: "Japanese",
      full: "Japanese gyuto",
      blurb: "cuts with lighter swipes, wears faster",
    },
    german: {
      name: "German",
      full: "German chef's knife",
      blurb: "wears slower, wants a firmer swipe",
    },
    american: { name: "American", full: "American chef's knife", blurb: "middle of the road" },
    swiss: {
      name: "Swiss",
      full: "Swiss utility knife",
      blurb: "wider reach, wears a little faster",
    },
  },
  knifeNote: "Knife stats are game rules only.",
  hardcore: "Hardcore",
  hardcoreBody:
    "In this mode nothing cuts until your knife has been through pickup, sharpening and return.",

  streetTutorial: [
    {
      head: "Walk Westfield",
      body: "You stroll through town. Fruit flies at you out of the alleys: swipe through it.",
    },
    {
      head: "Watch your edge",
      body: "Every cut wears the blade. As the Edge meter drops, cuts get messy, then stop working.",
    },
    {
      head: "Pop the question",
      body: "Tap a neighbor to propose pickup, sharpening and return. Expect a no at first. Slice fruit near them to show what you can do, then ask again.",
    },
    {
      head: "Then get it back",
      body: "When the edge is gone: pickup, sharpening and return, then a sharp second walk.",
    },
  ],
  streetHint: "Swipe the fruit · tap people to propose",
  walk1Score: "Walk 1",
  walk2Score: "Walk 2",
  walk1: "Walk 1 · Dull Days",
  walk2: "Walk 2 · The Edge Returns",
  asked: (n: number, yes: number) => `Asked ${n} · Yes ${yes}`,
  proposal: "Will you marry me?",
  proposalSub: "Pickup, sharpening and return?",
  replies: {
    no: [
      "We just met!",
      "Buy me dinner first.",
      "Ask me after a first date.",
      "Maybe after the third date.",
      "I don't even know your name.",
      "Not today!",
      "My knife is fine. Probably.",
      "Show me what you can do first.",
    ],
    yes: ["Yes! Pickup, sharpening and return!", "Yes! Take my knives!", "Okay... yes!"],
  },
  persistence: "+5 persistence",
  date: "date",
  proposals: "Proposals",
  yeses: "Said yes",

  tutorial: [
    {
      head: "Swipe through the fruit",
      body: "Slice with a finger or the mouse as ingredients hop up off the counter.",
    },
    {
      head: "Watch your edge",
      body: "Every cut wears the blade. As the Edge meter drops, cuts get messy, then stop working.",
    },
    {
      head: "Then get it back",
      body: "Pickup, sharpening and return, then a sharp Level 2 with combos and tougher ingredients.",
    },
  ],
  next: "Next",
  letsCut: "Let's cut",

  edge: "Edge",
  score: "Score",
  level1: "Level 1 · Dull Days",
  level2: "Level 2 · The Edge Returns",
  hint: "Swipe through the tomato",
  bands: { keen: "Keen", worn: "Worn", dull: "Dull", gone: "Gone" },
  warnHalf: "Edge at half",
  warnLow: "Edge almost gone",

  pause: "Pause",
  resume: "Resume",
  restart: "Restart",
  quit: "Back to title",
  mute: "Mute",
  unmute: "Unmute",
  paused: "Paused",

  edgeGoneHead: "Your edge is gone.",
  edgeGoneBody: "Time for pickup, sharpening and return.",
  continue: "Continue",
  skip: "Skip",

  pickupHead: "Pickup",
  pickupBody: "Leave it wrapped at your door.",
  sharpenHead: "Sharpening",
  sharpenBody: "Swipe back and forth to help it along.",
  sharpenButton: "Sharpen",
  restored: "The Edge Returns",
  returnHead: "Return",
  returnBody: "Back at your door. Edge 100%, Keen.",
  startLevel2: "Start Level 2",

  resultsHead: "Results",
  total: "Total score",
  level1Score: "Level 1",
  level2Score: "Level 2",
  bestCombo: "Best combo",
  bestStreak: "Best streak",
  best: "Best on this device",
  newBest: "New best!",
  playAgain: "Play again",

  combo: (n: number) => `${n}× combo`,
  streak: (n: number) => `Streak ${n}`,
  time: (s: number) => `${Math.max(0, Math.ceil(s))}s`,

  /** Comic pops for the dull-knife frustration. Picked at random per event. */
  pops: {
    squash: ["squish!", "splat!", "mush!", "oops"],
    bounce: ["thup!", "boing", "nope", "bonk"],
    skid: ["skrrt", "slides off", "nothing", "useless"],
    notch: ["again!", "one more", "half way"],
    clang: ["clang!", "not food!", "ouch"],
    glint: ["+edge"],
    power: ["power cut!", "shink!", "clean!"],
  },
} as const;
