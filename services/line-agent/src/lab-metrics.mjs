// Extract only the known two-column CVAS layout. Missing values remain null.
export function qualityMetrics(report) {
 const text=report.text,lines=text.split('\n');
 const heading=lines.find(l=>l.includes('SAMPLE INFORMATION')&&l.includes('MINERALS'));
 const split=heading?.indexOf('MINERALS');
 if(!split||split<50)return {layout:'unrecognized'};
 const left=(label)=>{
  const row=lines.map(l=>l.slice(0,split)).find(l=>l.trimStart().startsWith(label)&&/^\s*(?:-?\d|$)/.test(l.trimStart().slice(label.length)));
  if(!row)return null;
  const nums=row.trimStart().slice(label.length).trim().match(/^(-?\d+(?:\.\d+)?)(?:\s+-?\d+(?:\.\d+)?)*$/);
  return nums?Number(nums[0].trim().split(/\s+/).at(-1)):null;
 };
 const right=(label)=>{
  const row=lines.map(l=>l.slice(split)).find(l=>l.trimStart().startsWith(label));
  const value=row?.trimStart().slice(label.length).trim();
  return value&&/^-?\d+(?:\.\d+)?$/.test(value)?Number(value):null;
 };
 return {DM_percent:left('Dry Matter'),starch_percent_DM:left('Starch'),CP_percent_DM:left('Crude Protein'),ADF_percent_DM:left('ADF'),NDF_percent_DM:left('aNDF'),lignin_percent_DM:left('Lignin'),NDFD12_percent_NDF:left('NDF Digestibility (12 hr)'),NDFD24_percent_NDF:left('NDF Digestibility (24 hr)'),NDFD30_percent_NDF:left('NDF Digestibility (30 hr)'),NDFD48_percent_NDF:left('NDF Digestibility (48 hr)'),NDFD72_percent_NDF:left('NDF Digestibility (72 hr)'),NDFD120_percent_NDF:left('NDF Digestibility (120 hr)'),NDFD240_percent_NDF:left('NDF Digestibility (240 hr)'),uNDF240:left('uNDF (240 hr)'),lactic_percent_DM:right('Lactic Acid (%DM)'),acetic_percent_DM:right('Acetic Acid (%DM)'),butyric_percent_DM:right('Butyric Acid (%DM)'),pH:right('pH')};
}
