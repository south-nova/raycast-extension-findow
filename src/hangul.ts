// 한영 키 자동 변환. "zkzkdhxhr" → "카카오톡", "카카오톡" → "zkzkdhxhr".
// 두벌식 자판 기준. 검색어와 제목 양쪽에 적용해 한영 전환을 안 한 채 친 글자도 찾는다.

const KEY_TO_JAMO: Record<string, string> = {
  q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ", y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ",
  a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ", h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ",
  z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ",
  Q: "ㅃ", W: "ㅉ", E: "ㄸ", R: "ㄲ", T: "ㅆ", O: "ㅒ", P: "ㅖ",
};
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONG = "\0ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";
const VOWEL_PAIR: Record<string, string> = { ㅗㅏ: "ㅘ", ㅗㅐ: "ㅙ", ㅗㅣ: "ㅚ", ㅜㅓ: "ㅝ", ㅜㅔ: "ㅞ", ㅜㅣ: "ㅟ", ㅡㅣ: "ㅢ" };
const JONG_PAIR: Record<string, string> = {
  ㄱㅅ: "ㄳ", ㄴㅈ: "ㄵ", ㄴㅎ: "ㄶ", ㄹㄱ: "ㄺ", ㄹㅁ: "ㄻ", ㄹㅂ: "ㄼ", ㄹㅅ: "ㄽ", ㄹㅌ: "ㄾ", ㄹㅍ: "ㄿ", ㄹㅎ: "ㅀ", ㅂㅅ: "ㅄ",
};
const SPLIT: Record<string, string> = Object.fromEntries(
  [...Object.entries(VOWEL_PAIR), ...Object.entries(JONG_PAIR)].map(([pair, one]) => [one, pair]),
);
const JAMO_TO_KEY: Record<string, string> = Object.fromEntries(Object.entries(KEY_TO_JAMO).map(([k, j]) => [j, k]));

const isVowel = (j: string) => JUNG.includes(j);

/** 영타로 친 글자를 한글로 조합한다. 한글이 아닌 글자는 그대로 둔다. */
export function toHangul(text: string): string {
  let out = "";
  let cho = -1, jung = -1, jong = 0; // 조합 중인 음절
  const flush = () => {
    if (cho >= 0 && jung >= 0) out += String.fromCharCode(0xac00 + (cho * 21 + jung) * 28 + jong);
    else if (cho >= 0) out += CHO[cho];
    else if (jung >= 0) out += JUNG[jung];
    cho = jung = -1; jong = 0;
  };
  for (const ch of text) {
    const j = KEY_TO_JAMO[ch] ?? KEY_TO_JAMO[ch.toLowerCase()]; // 쉬프트 자판이 아닌 대문자는 소문자와 같다
    if (!j) { flush(); out += ch; continue; }
    if (isVowel(j)) {
      if (cho >= 0 && jung < 0) { jung = JUNG.indexOf(j); continue; }
      if (jung >= 0 && jong === 0 && VOWEL_PAIR[JUNG[jung] + j]) { jung = JUNG.indexOf(VOWEL_PAIR[JUNG[jung] + j]); continue; }
      if (jong > 0) { // 받침을 다음 음절 초성으로 넘긴다 (겹받침이면 뒤쪽만)
        const pair = SPLIT[JONG[jong]];
        const next = pair ? pair[1] : JONG[jong];
        jong = pair ? JONG.indexOf(pair[0]) : 0;
        flush(); cho = CHO.indexOf(next); jung = JUNG.indexOf(j); continue;
      }
      flush(); jung = JUNG.indexOf(j); continue;
    }
    // 자음
    if (cho >= 0 && jung >= 0 && jong === 0 && JONG.indexOf(j) > 0) { jong = JONG.indexOf(j); continue; }
    if (jong > 0 && JONG_PAIR[JONG[jong] + j]) { jong = JONG.indexOf(JONG_PAIR[JONG[jong] + j]); continue; }
    flush(); cho = CHO.indexOf(j);
  }
  flush();
  return out;
}

/** 한글을 영타 키 순서로 푼다. "카카오톡" → "zkzkdhxhr". */
export function toQwerty(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0) - 0xac00;
    let jamos: string;
    if (code >= 0 && code < 11172) jamos = CHO[Math.floor(code / 588)] + JUNG[Math.floor((code % 588) / 28)] + (code % 28 ? JONG[code % 28] : "");
    else if (JAMO_TO_KEY[ch] || SPLIT[ch]) jamos = ch;
    else { out += ch; continue; }
    for (const j of jamos) for (const k of SPLIT[j] ?? j) out += JAMO_TO_KEY[k];
  }
  return out;
}
