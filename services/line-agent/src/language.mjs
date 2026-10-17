// Explicit language requests are separate from the input language used for clarifications.
export function wantsThreeLanguages(value) {
 const q=String(value??'');
 const requested=/(?:\b(?:answer|reply|respond|explain|write|translate|languages?|in)\b|ဘာသာ|ဖြေ|ပြန်|ตอบ|ภาษา|แปล)/i.test(q);
 return requested &&
   /(?:\b(?:myanmar|burmese)\b|မြန်မာ|พม่า)/i.test(q) &&
   /(?:\bthai\b|ထိုင်း|ไทย)/i.test(q) &&
   /(?:\benglish\b|အင်္ဂလိပ်|อังกฤษ)/i.test(q);
}
export function answerLanguage(baseLanguage,text) {
 return wantsThreeLanguages(text)?'tri':baseLanguage;
}
export function languageInstruction(language) {
 return language==='tri'
  ?'Myanmar (Burmese), Thai, and English IN THAT ORDER, with headings "မြန်မာ", "ไทย", and "English"; each language must contain the SAME factual answer, references, units and caveats without inventing details'
  :({my:'Burmese',th:'Thai',en:'English'}[language]||'English');
}
export function pastBurmeseTranslationRequest(value) {
 const q=String(value??'').trim();
 const en=/(?:\btranslate\b|ဘာသာပြန်|แปล)/i.test(q) &&
  /(?:\b(?:past|previous|last|above|earlier|preceding)\b|အပေါ်က|အရင်|ယခင်|ရှေ့က|ก่อนหน้า|ข้างบน|ล่าสุด)/i.test(q) &&
  /(?:\b(?:burmese|myanmar|text|message)\b|မြန်မာစာ|စာသား|ข้อความ|ภาษาพม่า)/i.test(q);
 return /^\/translate\s+(?:previous|last|above|past)\b/i.test(q)||en;
}
export function translationTarget(text) {
 if(wantsThreeLanguages(text))return 'tri';
 const q=String(text??'');
 if(/(?:\bto\s+(?:thai)\b|ထိုင်းလို|ภาษาไทย)/i.test(q))return 'th';
 if(/(?:\bto\s+(?:myanmar|burmese)\b|မြန်မာလို|ภาษาพม่า)/i.test(q))return 'my';
 return 'en';
}
