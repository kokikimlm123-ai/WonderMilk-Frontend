import {configuration,missingConfiguration} from '../src/config.mjs';
const c=configuration();
let googleValid=false;
try{const s=JSON.parse(c.googleJSON);googleValid=s.type==='service_account'&&!!s.client_email&&!!s.private_key;}catch{}
console.log(JSON.stringify({enabled:c.enabled,missing:missingConfiguration(c),google_json_valid:googleValid,model:c.model,data_dir:c.dir},null,2));
process.exitCode=missingConfiguration(c).length||!googleValid?1:0;
