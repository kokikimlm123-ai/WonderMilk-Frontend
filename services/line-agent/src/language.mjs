// Explicit language requests are separate from the input language used for clarifications.
export function wantsThreeLanguages(value) {
 const q=String(value??'');
 const requested=/(?:\b(?:answer|reply|respond|translate|languages?)\b|ဘာသာ|ဖြေ|ပြန်|ตอบ|ภาษา|แปล)/i.test(q);
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

// Source text must be explicitly supplied. A missing source is never inferred
// from historical chat unless the member requests the previous message.
export function directTranslationRequest(value) {
 const q=String(value??'').trim();
 if(!q||pastBurmeseTranslationRequest(q))return null;
 // /translate English: ...  or /translate th <text>
 const cmd=q.match(/^\/translate(?:\s+(?:(?:to\s+)?(english|en|myanmar|burmese|my|thai|th|all|three|3\s+languages)))?(?:\s*[:：]\s*|\s+|$)([\s\S]*)$/i);
 if(cmd){
  const aliases={english:'en',en:'en',myanmar:'my',burmese:'my',my:'my',thai:'th',th:'th',all:'tri',three:'tri','3 languages':'tri'};
  let target=aliases[(cmd[1]||'en').toLowerCase().replace(/\s+/g,' ').trim()]||'en';
  const rest=(cmd[2]||'').trim();
  // Support /translate all:... and source text on the next line.
  return {target,source:rest};
 }
 // Explicit sentence + colon/newline separates instructions from quoted source.
 // Do not translate guessed text embedded in a question without a separator.
 // Natural requests need an explicit destination and source delimiter. Match
 // "Can you translate this all to English: ..." without routing the embedded
 // word "manual" or "NIR" to the CVAS manual handler.
 const intro=q.match(/^(?:(?:can|could|would)\s+you\s+(?:please\s+)?|please\s+)?translate\s+(?:(?:this\s+all|all\s+(?:of\s+)?this|the\s+following|the\s+entire|the\s+whole|this|all|everything)\s+)?(?:(?:burmese|myanmar|thai|english)\s+)?(?:text|message|sentence|paragraph)?\s*(?:to|into)\s+(english|en|myanmar|burmese|my|thai|th)(?:\s+(?:language|please))?\s*[:：\n]\s*([\s\S]*)$/i);
 if(intro){
  const v=intro[1].toLowerCase(),target=({en:'en',english:'en',my:'my',burmese:'my',myanmar:'my',th:'th',thai:'th'})[v];
  return {target,source:intro[2].trim()};
 }
 const three=q.match(/^(?:please\s+)?translate\s+(?:this\s+)?(?:text|message|sentence|paragraph)?\s*(?:into|to)\s+(?:myanmar\s*,?\s*thai\s*(?:&|and|,)\s*english|three\s+languages|3\s+languages)\s*[:：\n]\s*([\s\S]*)$/i);
 if(three)return {target:'tri',source:three[1].trim()};
 // Myanmar and Thai natural requests with the source after ":" or newline.
 const sep=q.match(/^([\s\S]{3,160}?)(?:[:：]|\n)\s*([\s\S]*)$/);
 if(sep&&/(?:ဘာသာပြန်|แปล)/i.test(sep[1])){
  return {target:translationTarget(sep[1]),source:sep[2].trim()};
 }
 return null;
}
