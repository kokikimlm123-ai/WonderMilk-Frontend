// Reviewed evidence snapshot, not a claim about future runtime deployments.
export const RELEASE_EVIDENCE = Object.freeze({
 checkedAt: '2026-10-12',
 deployed: {commit:'8efe239', date:'2026-10-08', deployment:'ef78d17f-dfa1-4738-a332-ab8873c6f3aa'},
 development: {commit:'3f59ef1', date:'2026-10-12'},
});
const pick=(lang,en,my,th)=>({en,my,th}[lang]||en);
export function infoIntent(text) {
 const t=text.trim();
 // Explicit task commands always keep their established handlers.
 if(/^\/(?:farm|ask|add|edit|records|photo|cancel|cvas|nutrition|feeding|mastitis|milkquality|milking|forage|forageguide|feedanalysis|translate|lab-pair)\b/i.test(t))return null;
 if(/^\/(?:updates|version|changelog)(?:\s|$)/i.test(t))return 'updates';
 if(/^\/(?:help|start|capabilities)(?:\s|$)/i.test(t))return 'help';
 if(/\b(?:update|create|save|record|edit)\b.*\b(?:cow|milk|farm|record|sample)\b/i.test(t)&&! /\b(?:system|release|version|capabilities|features)\b/i.test(t))return null;
 const self=/\b(?:you|your|bot|system|ARGO(?:-WM)?|features?|capabilit(?:y|ies)|release|development)\b|စနစ်|ဘော့|သင်|ဘာတွေလုပ်|ဘာလုပ်ပေး|บอท|ระบบ|คุณ|ทำอะไรได้/i.test(t);
 if(self&&/new features|updates?|release|changelog|version|development|ပြောင်းလဲ|အသစ်|မွမ်းမံ|ဗားရှင်း|อัปเดต|เวอร์ชัน|เปลี่ยนแปลง/i.test(t))return 'updates';
 if(/^(?:help|capabilities|what can you do|what do you do|how can you help(?: me)?|who are you)[?!.\s]*$/i.test(t)||
 /^(?:သင်|မင်း|ဘော့|ARGO-WM)?\s*(?:ဘာတွေလုပ်နိုင်လဲ|ဘာလုပ်ပေးနိုင်လဲ|ဘာလုပ်နိုင်သလဲ|ဘယ်လိုသုံးရမလဲ)[။?\s]*$/i.test(t)||
 /^(?:คุณ|บอท)?\s*(?:ทำอะไรได้บ้าง|ทำอะไรได้|ใช้งานอย่างไร)[?\s]*$/.test(t)||
 /^(?:show|tell|explain|describe)\s+(?:me\s+)?(?:your|the bot.s)\s+(?:capabilities|features|functions)[?!.\s]*$/i.test(t))return 'help';
 return null;
}
export function infoAnswer(intent,language='en',{privateLab=false,labConfigured=false}={}) {
 if(language==='quad')return ['မြန်မာ\n'+infoAnswer(intent,'my',{privateLab,labConfigured}),
  'ไทย\n'+infoAnswer(intent,'th',{privateLab,labConfigured}),
  'English\n'+infoAnswer(intent,'en',{privateLab,labConfigured}),
  '简体中文\n'+infoAnswer(intent,'zh',{privateLab,labConfigured})].join('\n\n');
 if(language==='zh'){
  if(intent==='updates')return 'ARGO-WM 更新信息：本信息仅为已核实版本概要，不代表全部最新部署记录。请以 GitHub 和 Railway 的实际部署日志为准。';
  const intro='ARGO-WM 使用说明（简体中文）';
  const access=privateLab?'此私聊仅适用于已授权的实验室账户。':'在已连接的 LINE 群组中，请 @ 提及 ARGO-WM 后提问。支持 Farm 2、Farm 4 和 Ryokusan 的现有记录查询与汇总；可按明确提供的数据创建记录，并在权限允许时修改机器人创建的记录。';
  const lab=labConfigured?'可查询 CVAS 实验室报告和原始 PDF 文件名，并根据所提供的实验室手册、乳牛营养、乳房炎及青贮饲料分析资料回答问题，附上来源页码。':'实验室资料功能取决于已连接的数据源。';
  return [intro,access,lab,
   '翻译：/translate zh: 缅甸语或英语文本；/translate en、/translate my、/translate th；/translate all 保持原来的三种语言；/translate four 或 /translate all4 输出缅甸语、泰语、英语和简体中文。',
   '如需用中文回答，请用中文提问或在问题末尾加上 Answer in Chinese。具体数值与医疗建议必须以可用资料为准。'].join('\n\n');
 }

 if(language==='tri')return ['မြန်မာ\n'+infoAnswer(intent,'my',{privateLab,labConfigured}),
  'ไทย\n'+infoAnswer(intent,'th',{privateLab,labConfigured}),
  'English\n'+infoAnswer(intent,'en',{privateLab,labConfigured})].join('\n\n');
 const say=(en,my,th)=>pick(language,en,my,th);
 const e=RELEASE_EVIDENCE;
 const stamp=say('Verified feature baseline','အတည်ပြုထားသော မူလလုပ်ဆောင်ချက်များ','ข้อมูลอ้างอิงความสามารถที่ตรวจสอบแล้ว')+`: ${e.checkedAt}; ${e.deployed.commit} (${e.deployed.date}).`;
 if(intent==='updates')return [
  stamp,
  say('Verified release evidence available (not a complete date-range history):','အတည်ပြုထားသော release အချက်အလက်များ (ရက်စွဲအပိုင်းအခြားအားလုံး၏ မှတ်တမ်းအပြည့်အစုံ မဟုတ်ပါ):','หลักฐานรุ่นที่ตรวจสอบได้ (ไม่ใช่ประวัติครบทุกช่วงวันที่):'),
  say('DEPLOYED — 2026-10-08: CVAS manual procedure answers with validated PDF page citations.','အသုံးပြုနေပြီ — 2026-10-08: CVAS manual လုပ်နည်းများကို PDF စာမျက်နှာ ကိုးကားချက်စစ်ပြီး ဖြေနိုင်ခြင်း။','ใช้งานจริง — 2026-10-08: ตอบขั้นตอนจากคู่มือ CVAS พร้อมตรวจสอบเลขหน้าอ้างอิง PDF'),
  say('DEVELOPMENT ONLY — 2026-10-12, 3f59ef1: V1.1 all-match queries, numeric filters, comparison PDF links and draft analysis history. Not released to the production LINE bot; complex live comparison testing remains unresolved.','Development သာ — 2026-10-12, 3f59ef1: V1.1 အားလုံးရှာခြင်း၊ ကိန်းဂဏန်းစစ်ထုတ်ခြင်း၊ comparison PDF links နှင့် draft analysis history။ Production LINE bot တွင် မတင်ရသေးပါ။ ရှည်လျားသော live comparison စမ်းသပ်မှု မပြေလည်သေးပါ။','เฉพาะ development — 2026-10-12, 3f59ef1: ค้นหาทุกรายการที่ตรงเงื่อนไข กรองตัวเลข ลิงก์ PDF ในการเปรียบเทียบ และประวัติการวิเคราะห์แบบร่าง ยังไม่เผยแพร่ใน LINE bot จริง การทดสอบคำถามเปรียบเทียบซับซ้อนยังไม่ผ่าน'),
  say('No verified evidence here of newly approved knowledge or other releases. Sources: Railway deployment record and reviewed V1.1 development notes. Dates outside this evidence require release records; I cannot infer updates from farm records.','အသစ်အတည်ပြုထားသော knowledge သို့မဟုတ် အခြား release အတွက် အထောက်အထား မရှိပါ။ ရင်းမြစ်: Railway deployment မှတ်တမ်းနှင့် စစ်ဆေးထားသော V1.1 development မှတ်တမ်း။ အခြားရက်စွဲများအတွက် release မှတ်တမ်းလိုပါသည်။ Farm records မှ system updates ကို မခန့်မှန်းပါ။','ไม่มีหลักฐานยืนยันความรู้ที่อนุมัติใหม่หรือรุ่นอื่น แหล่งข้อมูล: บันทึก deployment ของ Railway และบันทึก development V1.1 ที่ตรวจสอบแล้ว วันที่นอกหลักฐานนี้ต้องมีบันทึกรุ่น ไม่อนุมานการอัปเดตจากข้อมูลฟาร์ม'),
 ].join('\n\n');
 const lines=[say('ARGO-WM — Help / Capabilities','ARGO-WM — အကူအညီ / လုပ်ဆောင်နိုင်မှုများ','ARGO-WM — วิธีใช้ / ความสามารถ')];
 if(!privateLab)lines.push(say(
 'In the connected group, mention the bot or use @WM. I can find and summarize existing records for Farm 2, Farm 4 and Ryokusan; create records from details or requested form photos; and update bot-created records. Original source rows are not directly edited.',
 'ချိတ်ထားသော group တွင် bot ကို mention သို့မဟုတ် @WM သုံးပါ။ Farm 2၊ Farm 4၊ Ryokusan ၏ မူလစာရင်းများ ရှာဖတ်၊ အကျဉ်းချုပ်နိုင်ပြီး ပေးထားသောအချက်အလက် သို့မဟုတ် တောင်းထားသောဖောင်ဓာတ်ပုံမှ စာရင်းသွင်းနိုင်ပါသည်။ Bot သွင်းထားသောစာရင်းကို ပြင်နိုင်ပါသည်။ မူလဖိုင် row များကို တိုက်ရိုက်မပြင်ပါ။',
 'ในกลุ่มที่เชื่อมต่อ ให้กล่าวถึงบอทหรือใช้ @WM ค้นหาและสรุปข้อมูล Farm 2, Farm 4 และ Ryokusan ได้ สร้างรายการจากข้อมูลหรือรูปแบบฟอร์มที่ร้องขอ และแก้ไขรายการที่บอทสร้าง ไม่แก้แถวในไฟล์ต้นฉบับโดยตรง'));
 if(!privateLab)lines.push(say(
 'Farm records: cow profiles, milk production, feed, health and reproduction records where supplied. Search by farm, cow ID or date; summarize and compare available records. Use /records to find bot record IDs, /photo to select the farm before sending a form, and /cancel to cancel a pending form. Unclear form details are clarified before saving.',
 'Farm စာရင်းများ: ရရှိထားသော နွားတစ်ကောင်ချင်းအချက်အလက်၊ နို့ထုတ်လုပ်မှု၊ အစာ၊ ကျန်းမာရေးနှင့် မျိုးပွားမှုစာရင်းများကို Farm၊ Cow ID၊ ရက်စွဲဖြင့် ရှာဖွေ၊ အကျဉ်းချုပ်၊ နှိုင်းယှဉ်နိုင်ပါသည်။ /records ဖြင့် Bot Record ID ရှာနိုင်ပြီး /photo ဖြင့် ဖောင်ပုံမပို့မီ Farm ရွေးနိုင်ပါသည်။ /cancel ဖြင့် မပြီးသေးသောဖောင်ကို ရပ်နိုင်ပါသည်။ မရှင်းလင်းသောဖောင်အချက်အလက်များကို မသိမ်းမီ ပြန်မေးပါသည်။',
 'ข้อมูลฟาร์ม: ประวัติโค ผลผลิตน้ำนม อาหาร สุขภาพ และการสืบพันธุ์ตามข้อมูลที่มี ค้นหาตามฟาร์ม รหัสโค หรือวันที่ สรุปและเปรียบเทียบข้อมูล ใช้ /records ค้นหา ID รายการของบอท /photo เลือกฟาร์มก่อนส่งรูปแบบฟอร์ม และ /cancel ยกเลิกแบบฟอร์มที่ค้าง ข้อมูลไม่ชัดเจนจะถามก่อนบันทึก'));
 if(labConfigured)lines.push(say('Laboratory: look up CVAS reports and original PDF links; compare available results; ask procedures from the supplied CVAS manual with page citations. Answers depend on available source data.','Laboratory: CVAS reports နှင့် မူရင်း PDF links ရှာခြင်း၊ ရရှိသောရလဒ်များ နှိုင်းယှဉ်ခြင်း၊ ပေးထားသော CVAS manual မှ လုပ်နည်းများကို စာမျက်နှာကိုးကားချက်ဖြင့် မေးနိုင်ပါသည်။ အဖြေသည် ရရှိသောရင်းမြစ်အပေါ် မူတည်ပါသည်။','ห้องปฏิบัติการ: ค้นหารายงาน CVAS และลิงก์ PDF ต้นฉบับ เปรียบเทียบผลที่มี และถามขั้นตอนจากคู่มือ CVAS ที่ให้ไว้พร้อมเลขหน้า คำตอบขึ้นอยู่กับข้อมูลต้นทาง'));
 if(labConfigured)lines.push(say(
 'Dairy nutrition: ask questions from Dr. Walter Chen\'s 36 indexed nutrition slides. Use /nutrition followed by your question. Responses cite original slide numbers (slides 24 and 34 are excluded).',
 'နို့စားနွားအာဟာရ: Dr. Walter Chen ၏ စုစည်းထားသော သင်ခန်းစာ ၃၆ စာမျက်နှာကို /nutrition နောက်တွင် မေးခွန်းရေးပြီး မေးနိုင်ပါသည်။ မူရင်း Slide နံပါတ်များကို ကိုးကားပေးပါသည် (Slide 24 နှင့် 34 မပါဝင်ပါ)။',
 'โภชนาการโคนม: ถามจากสไลด์ 36 หน้าของ Dr. Walter Chen โดยพิมพ์ /nutrition ตามด้วยคำถาม คำตอบอ้างอิงหมายเลขสไลด์ต้นฉบับ (ไม่รวมสไลด์ 24 และ 34)'));
 if(labConfigured)lines.push(say(
 'Milk quality and mastitis: 77 slides from Todd Meyer DVM (USGC Thailand, March 2024), indexed as visual source summaries. Ask /mastitis or /milkquality; answers cite the original slide number. Mastitis treatments need veterinary assessment.',
 'နို့အရည်အသွေးနှင့် နို့အုံရောင်ရမ်းရောဂါ: Dr. Todd Meyer ၏ သင်ခန်းစာ Slide ၇၇ ခုကို ပုံအခြေခံ အကျဉ်းချုပ်များအဖြစ် ထည့်ထားပါသည်။ /mastitis သို့မဟုတ် /milkquality ဖြင့် မေးနိုင်ပြီး မူရင်း Slide နံပါတ်ကို ကိုးကားပေးပါမည်။ ဆေးကုသမှုအတွက် တိရစ္ဆာန်ဆရာဝန် စစ်ဆေးမှုလိုအပ်ပါသည်။',
 'คุณภาพน้ำนมและเต้านมอักเสบ: เพิ่มสรุปจากภาพสไลด์ 77 หน้าของ Dr. Todd Meyer ถามด้วย /mastitis หรือ /milkquality คำตอบอ้างอิงเลขสไลด์ การรักษาต้องให้สัตวแพทย์ประเมิน'));
 if(labConfigured)lines.push(say(
 'Forage analysis interpretation: the two-page Cornell Precision Feed Manager guide explains forage DM, CP, NDF/NDFD, starch, ash, minerals, energy and silage fermentation reference goals. Use /forage followed by a question; responses cite PDF page 1 or 2. These guide targets do not replace actual CVAS results.',
 'အစာဓာတ်ခွဲရလဒ် ဖတ်ရှုနည်း: Cornell Precision Feed Manager ၏ PDF စာမျက်နှာ ၂ ခုပါ Guide မှ DM၊ CP၊ NDF/NDFD၊ Starch၊ Ash၊ Minerals၊ Energy နှင့် Silage Fermentation ရည်မှန်းချက်များကို /forage ဖြင့် မေးနိုင်ပါသည်။ အဖြေမှာ PDF စာမျက်နှာ ၁ သို့မဟုတ် ၂ ကို ကိုးကားပါမည်။ Guide ရည်မှန်းချက်များသည် CVAS စစ်ဆေးရလဒ်အစစ်များ မဟုတ်ပါ။',
 'การอ่านผลวิเคราะห์อาหารหยาบ: คู่มือ Cornell Precision Feed Manager แบบ PDF 2 หน้าอธิบายค่าเป้าหมาย DM, CP, NDF/NDFD, แป้ง, แร่ธาตุ, พลังงานและการหมัก ถามด้วย /forage คำตอบอ้างอิงหน้า PDF 1 หรือ 2 เป้าหมายในคู่มือไม่ใช่ผลตรวจ CVAS จริง'));
 if(privateLab)lines.push(say('This private chat is restricted to approved laboratory access. Use the connected group for farm records.','ဤ private chat သည် ခွင့်ပြုထားသော laboratory access အတွက်သာ ဖြစ်ပါသည်။ Farm records အတွက် ချိတ်ထားသော group ကို သုံးပါ။','แชตส่วนตัวนี้จำกัดเฉพาะสิทธิ์ห้องปฏิบัติการที่อนุมัติ ใช้กลุ่มที่เชื่อมต่อสำหรับข้อมูลฟาร์ม'));
 lines.push(privateLab?'/cvas Show Lab ID 39170011 dry matter and starch.': '/farm Farm 2 Cow 001\n/records Farm 4\n/photo Farm 2\n/cancel');
 if(!privateLab)lines.push(say(
 'Translate an earlier Burmese LINE group message: mention the bot and ask "Please translate the past Burmese text to English". I can use only recent Burmese text received in this same connected group after this feature was enabled (up to 6 hours). For older, unavailable or unsent messages, please paste or quote the original text.',
 'ယခင် မြန်မာစာကို ဘာသာပြန်ရန် Bot ကို Mention လုပ်ပြီး "Please translate the past Burmese text to English" ဟု မေးပါ။ ဤလုပ်ဆောင်ချက် စတင်ပြီးနောက် Group တူတစ်ခုထဲမှာ ရရှိထားသော ၆ နာရီအတွင်း မြန်မာစာကိုသာ ပြန်ရှာနိုင်ပါသည်။ မရရှိနိုင်သောစာအတွက် မူရင်းစာကို ပြန်ပို့ပါ။',
 'หากต้องการแปลข้อความพม่าก่อนหน้า ให้กล่าวถึงบอทแล้วพิมพ์ "Please translate the past Burmese text to English" ระบบอ่านได้เฉพาะข้อความพม่าที่รับในกลุ่มเดียวกันหลังเปิดใช้ฟังก์ชันนี้ และย้อนหลังได้ไม่เกิน 6 ชั่วโมง ข้อความเก่าหรือข้อความที่ยกเลิกต้องส่งใหม่'));
 lines.push(say(
 'Translate text directly: /translate en: [text], /translate th: [text], /translate my: [text], or /translate all: [text]. Supported source text: Myanmar, Thai and English. Translation is read-only; paste the full text after the command.',
 'စာသားကို တိုက်ရိုက်ဘာသာပြန်ရန် /translate en: [စာသား]၊ /translate th: [စာသား]၊ /translate my: [စာသား]၊ /translate all: [စာသား] ဟု ရေးပါ။ မြန်မာ၊ ထိုင်း၊ အင်္ဂလိပ်စာသားများကို ဘာသာပြန်နိုင်ပြီး စာရင်းအချက်အလက်များ မပြောင်းလဲပါ။',
 'แปลข้อความโดยตรง: /translate en: [ข้อความ], /translate th: [ข้อความ], /translate my: [ข้อความ] หรือ /translate all: [ข้อความ] รองรับต้นฉบับภาษาพม่า ไทย และอังกฤษ โดยไม่แก้ไขข้อมูลฟาร์ม'));
 lines.push(say(
 'To get one answer in three languages, append "Answer Myanmar, Thai & English". The answer is presented in Myanmar, Thai and English order. Longer answers may be split into multiple LINE messages.',
 'မေးခွန်းတစ်ခုကို ဘာသာစကား ၃ မျိုးဖြင့် ဖြေစေလိုပါက "Answer Myanmar, Thai & English" ဟု ထည့်ရေးပါ။ မြန်မာ၊ ထိုင်း၊ အင်္ဂလိပ် အစီအစဉ်အတိုင်း ဖြေပါမည်။ ရှည်သောအဖြေများကို LINE Message အများအပြားခွဲပို့နိုင်ပါသည်။',
 'หากต้องการคำตอบ 3 ภาษา ให้เพิ่ม "Answer Myanmar, Thai & English" ในคำถาม ระบบจะตอบตามลำดับ พม่า ไทย อังกฤษ และอาจแบ่งข้อความที่ยาวเป็นหลายข้อความใน LINE'));
 lines.push(say('I respond in Myanmar, English or Thai to match your message.','မေးထားသောဘာသာစကားအလိုက် မြန်မာ၊ အင်္ဂလိပ်၊ ထိုင်းဘာသာဖြင့် ပြန်ဖြေပါသည်။','ตอบเป็นภาษาเมียนมา อังกฤษ หรือไทยตามภาษาที่คุณใช้'));
 return lines.join('\n\n');
}
