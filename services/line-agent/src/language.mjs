
// Existing "all" is the original three-language mode for compatibility.
// The new "four" / "all4" mode is opt-in and adds Simplified Chinese.
export function wantsFourLanguages(value) {
 const q=String(value??'');
 if(/(?:\b(?:answer|reply|respond|translate)\s+(?:in\s+)?(?:all\s*four|four|4)\s+languages?\b|(?:မြန်မာ|ဘာသာ).{0,30}၄\s*ဘာသာ|四种语言|四語)/i.test(q))return true;
 const ask=/(?:\b(?:answer|reply|respond|translate|languages?)\b|ဘာသာ|ဖြေ|ပြန်|ตอบ|ภาษา|翻译|回答)/i.test(q);
 return ask&&/(?:myanmar|burmese|မြန်မာ|缅甸语|緬甸語)/i.test(q)&&
  /(?:thai|ထိုင်း|泰语|泰語)/i.test(q)&&
  /(?:english|အင်္ဂလိပ်|英语|英語)/i.test(q)&&
  /(?:chinese|mandarin|简体中文|中文|中国语|တရုတ်|จีน)/i.test(q);
}
export function explicitChineseAnswer(value) {
 const q=String(value??'');
 return /(?:\b(?:answer|reply|respond)\s+(?:in\s+)?(?:simplified\s+)?(?:chinese|mandarin)\b|用(?:简体)?中文(?:回答|回复)|请(?:用|以)(?:简体)?中文(?:回答|回复)|တရုတ်ဘာသာ(?:ဖြင့်|နဲ့)?\s*ဖြေ|ตอบ(?:เป็น)?ภาษาจีน)/i.test(q);
}
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
 return wantsFourLanguages(text)?'quad':explicitChineseAnswer(text)?'zh':wantsThreeLanguages(text)?'tri':baseLanguage;
}
export function languageInstruction(language) {
 return language==='quad'?'Myanmar (Burmese), Thai, English, and Simplified Chinese IN THAT ORDER, with headings "မြန်မာ", "ไทย", "English", and "简体中文"; each language has the SAME facts, numbers, references, units, and caveats'
  :language==='tri'
  ?'Myanmar (Burmese), Thai, and English IN THAT ORDER, with headings "မြန်မာ", "ไทย", and "English"; each language must contain the SAME factual answer, references, units and caveats without inventing details'
  :({my:'Burmese',th:'Thai',en:'English',zh:'Simplified Chinese (简体中文)'}[language]||'English');
}
export function pastBurmeseTranslationRequest(value) {
 const q=String(value??'').trim();
 const en=/(?:\btranslate\b|ဘာသာပြန်|แปล)/i.test(q) &&
  /(?:\b(?:past|previous|last|above|earlier|preceding)\b|အပေါ်က|အရင်|ယခင်|ရှေ့က|ก่อนหน้า|ข้างบน|ล่าสุด)/i.test(q) &&
  /(?:\b(?:burmese|myanmar|text|message)\b|မြန်မာစာ|စာသား|ข้อความ|ภาษาพม่า)/i.test(q);
 return /^\/translate\s+(?:previous|last|above|past)\b/i.test(q)||en;
}
export function translationTarget(text) {
 if(wantsFourLanguages(text))return 'quad';
 if(wantsThreeLanguages(text))return 'tri';
 const q=String(text??'');
 if(/(?:\b(?:to|into)\s+(?:chinese|mandarin|zh|zh-cn)\b|翻译成(?:简体)?中文|翻譯成中文|တရုတ်လို|ภาษาจีน)/i.test(q))return 'zh';
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
 const cmd=q.match(/^\/translate(?:\s+(?:(?:to\s+)?(english|en|myanmar|burmese|my|thai|th|chinese|mandarin|zh-cn|zh|four|all4|4\s+languages|all|three|3\s+languages)))?(?:\s*[:：]\s*|\s+|$)([\s\S]*)$/i);
 if(cmd){
  const aliases={english:'en',en:'en',myanmar:'my',burmese:'my',my:'my',thai:'th',th:'th',all:'tri',three:'tri','3 languages':'tri',chinese:'zh',mandarin:'zh','zh-cn':'zh',zh:'zh',four:'quad',all4:'quad','4 languages':'quad'};
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
 const intro=q.match(/^(?:(?:can|could|would)\s+you\s+(?:please\s+)?|please\s+)?translate\s+(?:(?:this\s+all|all\s+(?:of\s+)?this|the\s+following|the\s+entire|the\s+whole|this|all|everything)\s+)?(?:(?:burmese|myanmar|thai|english)\s+)?(?:text|message|sentence|paragraph)?\s*(?:to|into)\s+(english|en|myanmar|burmese|my|thai|th|chinese|mandarin|zh)(?:\s+(?:language|please))?\s*[:：\n]\s*([\s\S]*)$/i);
 if(intro){
  const v=intro[1].toLowerCase(),target=({en:'en',english:'en',my:'my',burmese:'my',myanmar:'my',th:'th',thai:'th',chinese:'zh',mandarin:'zh',zh:'zh'})[v];
  return {target,source:intro[2].trim()};
 }
 const four=q.match(/^(?:please\s+)?translate\s+(?:this\s+)?(?:text|message|sentence|paragraph)?\s*(?:into|to)\s+(?:four\s+languages|4\s+languages|myanmar\s*,?\s*thai\s*,?\s*english\s*(?:&|and|,)\s*chinese)\s*[:：\n]\s*([\s\S]*)$/i);
 if(four)return {target:'quad',source:four[1].trim()};
 const three=q.match(/^(?:please\s+)?translate\s+(?:this\s+)?(?:text|message|sentence|paragraph)?\s*(?:into|to)\s+(?:myanmar\s*,?\s*thai\s*(?:&|and|,)\s*english|three\s+languages|3\s+languages)\s*[:：\n]\s*([\s\S]*)$/i);
 if(three)return {target:'tri',source:three[1].trim()};
 const chinese=q.match(/^(?:请)?(?:把|将)?(?:以下|这段|这个|本段)?(?:文字|内容|句子)?(?:翻译|翻譯)(?:成|为|為|到)(?:简体)?(?:中文|英语|英語|泰语|泰語|缅甸语|緬甸語)\s*[:：\n]\s*([\s\S]*)$/);
 if(chinese){
  const target=/英语|英語/.test(q.slice(0,120))?'en':/泰语|泰語/.test(q.slice(0,120))?'th':/缅甸语|緬甸語/.test(q.slice(0,120))?'my':'zh';
  return {target,source:chinese[1].trim()};
 }
 // Myanmar and Thai natural requests with the source after ":" or newline.
 const sep=q.match(/^([\s\S]{3,160}?)(?:[:：]|\n)\s*([\s\S]*)$/);
 if(sep&&/(?:ဘာသာပြန်|แปล)/i.test(sep[1])){
  return {target:translationTarget(sep[1]),source:sep[2].trim()};
 }
 return null;
}
