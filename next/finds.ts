/**
 * Things to find. Nothing here is announced up front; each one says so the
 * first time it happens, and a few leave a hint lying around.
 */
export interface Find {
  id: string;
  text: string;
  hint?: string;
}

export const FINDS: Find[] = [
  { id: "light", text: "the arrows move the light", hint: "try the arrow keys" },
  { id: "lift", text: "a tap of shift lifts the page", hint: "tap shift on its own" },
  { id: "caps", text: "caps lock shouts", hint: "caps lock is not just caps" },
  { id: "switch", text: "tab swaps the switch", hint: "tab changes how it feels" },
  { id: "xray", text: "alt shows your rhythm", hint: "hold alt for a while" },
  { id: "layer", text: "ctrl shows the other layer", hint: "hold ctrl and look down" },
  { id: "color", text: "page up and down change the colorway", hint: "page down" },
  { id: "stamp", text: "hold a letter to stamp it", hint: "hold a letter, then let go" },
  { id: "charge", text: "hold space, let go", hint: "hold the space bar" },
  { id: "strike", text: "delete strikes the last word", hint: "delete is not backspace" },
  { id: "kro4", text: "four keys at once" },
  { id: "kro6", text: "six keys at once" },
  { id: "kro10", text: "ten keys. every finger", hint: "how many keys can it hold at once?" },
  { id: "dash", text: "two hyphens make a dash" },
  { id: "arrow", text: "-> is an arrow" },
  { id: "dots", text: "three dots, one character" },
  { id: "smile", text: ":) smiles back", hint: "be nice :)" },
  { id: "heart", text: "<3 beats" },
  { id: "head", text: "# makes a headline", hint: "start a line with #" },
  { id: "list", text: "- starts a list" },
  { id: "quote", text: "> quotes" },
  { id: "italic", text: "*stars* lean" },
  { id: "bold", text: "**double stars** are bold" },
  { id: "wavy", text: "~tildes~ wobble" },
  { id: "under", text: "_underscores_ underline" },
  { id: "aside", text: "(parentheses) whisper" },
  { id: "jump", text: "! makes a word jump" },
  { id: "tilt", text: "? makes a word wonder" },
  { id: "digits", text: "numbers roll in" },
  { id: "say", text: "say the sound", hint: "type the sound your keyboard makes" },
  { id: "qwerty", text: "qwerty" },
  { id: "pangram", text: "every letter in one line", hint: "the quick brown fox knows one" },
  { id: "alphabet", text: "all 26 letters pressed" },
  { id: "everykey", text: "every key works", hint: "faint legends are untested keys" },
  { id: "fkeys", text: "all twelve f keys" },
  { id: "wpm80", text: "80 wpm" },
  { id: "wpm100", text: "100 wpm" },
  { id: "wpm120", text: "120 wpm. easy" },
  { id: "click", text: "the page ripples" },
  { id: "scroll", text: "scroll up to read back" },
  { id: "undo", text: "ctrl+z brings it back" },
  { id: "gold", text: "a hidden colorway", hint: "↑ ↑ ↓ ↓ ..." }
];

export const FIND_COUNT = FINDS.length;

export const findById = (id: string): Find | undefined => FINDS.find((f) => f.id === id);
