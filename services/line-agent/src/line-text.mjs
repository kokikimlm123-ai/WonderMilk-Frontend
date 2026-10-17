// LINE text messages have a 5,000-character limit; a single push can carry five.
export function splitLineText(value,limit=4500) {
 if(typeof value!=='string'||!value.trim())throw new Error('empty_line_reply');
 if(!Number.isInteger(limit)||limit<100||limit>4900)throw new Error('invalid_line_text_limit');
 const parts=[];let remaining=value;
 while(remaining.length) {
  if(remaining.length<=limit){parts.push(remaining);break;}
  let cut=remaining.lastIndexOf('\n',limit);
  if(cut<Math.floor(limit/2))cut=remaining.lastIndexOf(' ',limit);
  if(cut<Math.floor(limit/2))cut=limit;
  // Prevent cutting a UTF-16 surrogate pair on large multilingual responses.
  if(cut>0&&/[\uD800-\uDBFF]/.test(remaining[cut-1])&&/[\uDC00-\uDFFF]/.test(remaining[cut]))cut--;
  parts.push(remaining.slice(0,cut));
  remaining=remaining.slice(cut);
 }
 if(parts.length>5)throw new Error('line_reply_exceeds_five_messages');
 return parts;
}
