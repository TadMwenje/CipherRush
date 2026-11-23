// English interface strings: the source every other language translates.
// Game mode texts and walkthrough steps stay in constants/ (English) and are
// translated by key in the locale files: modes.<key>, steps.<step id>.
// i18n.test.js checks every locale has exactly these keys.
const EN = {
  "nav.home": "Home",
  "nav.versus": "Versus",
  "nav.ranks": "Ranks",
  "nav.profile": "Profile",

  "stat.level": "Level",
  "stat.score": "Score",
  "stat.solved": "Solved",
  "stat.badges": "Badges",

  "dash.loggedInAs": "Logged in as",
  "dash.level": "Level {n}",
  "dash.xpToNext": "{have} / {need} XP to level {next}",
  "dash.maxLevel": "Max level. Respect.",
  "dash.pickGame": "Pick a game",
  "dash.howItWorks": "How it works",
  "dash.offlineTitle": "You're offline.",
  "dash.offlineBody": "Scored games need a connection. Practice Mode works without one.",
  "dash.practiceLink": "Practice Mode: unscored Caesar, Match-3 and True/False that work offline",
  "dash.howToPlay": "How to play {mode}",

  "daily.title": "Daily Cipher",
  "daily.waiting": "Today's cipher is waiting.",
  "daily.inProgress": "In progress - the clock's running.",
  "daily.cracked": "Cracked in {s}s. Back tomorrow.",
  "daily.missed": "Missed today. Back tomorrow.",
  "daily.streak": "{n}-day streak",

  "howto.title": "How it works",
  "howto.intro":
    "Each mode has its own level. To go up, earn the XP and clear 4 rounds at that level - losing rounds still pay a little, they just don't count. From level 5 you'll also need to have tried a couple of other modes. Every score is worked out on our server, so nobody's faking the board.",
  "howto.quickRules": "Quick rules",
  "howto.footer": "Ranks has three boards: all-time, best Rush run, and today's fastest Daily.",
  "howto.close": "Close",

  "walk.step": "Step {i} of {n}",
  "walk.back": "Back",
  "walk.next": "Next",
  "walk.startOver": "Start over",

  "game.backToDashboard": "Back to dashboard",

  "welcome.subtitle": "Crack codes. Beat the clock. Test your cyber instincts.",
  "welcome.play": "Play",
  "welcome.practice": "Practice without an account",
  "welcome.practiceOffline": "No signal? Practice offline",
  "welcome.footer": "Spot the pattern. Decode the signal.",

  "splash.subtitle": "Ciphers, patterns and bytes.",
  "splash.loading": "Loading",

  "profile.title": "Profile",
  "profile.loading": "Loading profile",
  "profile.loadError": "Couldn't load your profile.",
  "profile.loadErrorSignal": "Couldn't load your profile. Check your signal.",
  "profile.memberSince": "Member since {date}",
  "profile.badges": "Badges",
  "profile.noBadges": "None yet. Your first game earns one.",
  "profile.share": "Share",
  "profile.recentGames": "Recent games",
  "profile.noGames": "Nothing yet. Go play something.",
  "profile.historyMeta": "Level {n} · {date}",

  "settings.language": "Language",
  "settings.languageHint": "Menus, guides and tutorials. Puzzles and quiz questions stay in English for now.",

  "ranks.title": "Ranks",
  "ranks.allTime": "All-time",
  "ranks.rush": "Rush",
  "ranks.today": "Today",
  "ranks.allTimeSub": "Top 10 by total score.",
  "ranks.rushSub": "Best single 90-second run.",
  "ranks.todaySub": "Fastest Daily Cipher solves. Resets at midnight UTC.",
  "ranks.offline": "Ranks are live, so they need a connection. They'll load when you're back online.",
  "ranks.loadError": "Couldn't load the board.",
  "ranks.tryAgain": "Try again",
  "ranks.loading": "Loading ranks",
  "ranks.empty": "Empty. First one on here gets bragging rights.",
  "ranks.you": "You",

  // Labels on the walkthrough example tiles.
  "demo.Cipher": "Cipher",
  "demo.Shift": "Shift",
  "demo.Plain": "Plain",
  "demo.Mirror": "Mirror",
  "demo.Key": "Key",
  "demo.Early": "Early",
  "demo.Later": "Later",
  "demo.Hex": "Hex",
  "demo.Decimal": "Decimal",
  "demo.Binary": "Binary",
  "demo.Round": "Round",
  "demo.Before": "Before",
  "demo.Hint": "Hint",
  "demo.Score": "Score",
  "demo.Swipe": "Swipe",
  "demo.Streak": "Streak",
  "demo.After": "After",
  "demo.Moves": "Moves",
  "demo.Flip": "Flip",
  "demo.Cards": "Cards",
};

export default EN;
