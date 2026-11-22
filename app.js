(()=>{'use strict';
(()=>{'use strict';
/* Local error log with bounded retention. This never touches Supabase Auth or account records. */
const LOG_KEY='aevstudio:error-logs:v1';
const LOG_MAX=500,LOG_DAYS=30,LOG_MAX_AGE=LOG_DAYS*86400000;
function cleanLogText(value){
 let text=String(value??'').replace(/https?:\/\/[^\s?#]+[^\s]*/g,url=>url.split(/[?#]/)[0]);
 text=text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]');
 text=text.replace(/(access_token|refresh_token|api[_-]?key|password|passwd|secret)(\s*[:=]\s*)[^\s,;&]+/gi,'$1$2[redacted]');
 return text.slice(0,500);
}
function readLogs(){
 try{const value=JSON.parse(localStorage.getItem(LOG_KEY)||'[]');return Array.isArray(value)?value.filter(x=>x&&Number.isFinite(x.time)&&typeof x.message==='string'):[]}
 catch(_){return []}
}
function rotateLogs(){
 const cutoff=Date.now()-LOG_MAX_AGE;
 let logs=readLogs().filter(x=>x.time>=cutoff).slice(-LOG_MAX);
 try{localStorage.setItem(LOG_KEY,JSON.stringify(logs))}
 catch(_){
  try{logs=logs.slice(-100);localStorage.setItem(LOG_KEY,JSON.stringify(logs))}
  catch(__){return []}
 }
 return logs;
}
function addLog(type,message,source,line,column){
 const logs=rotateLogs();
 logs.push({time:Date.now(),type:cleanLogText(type),message:cleanLogText(message),source:cleanLogText(source||'').split(/[?#]/)[0].slice(0,180),line:Number(line)||0,column:Number(column)||0});
 try{localStorage.setItem(LOG_KEY,JSON.stringify(logs.slice(-LOG_MAX)))}
 catch(_){try{localStorage.setItem(LOG_KEY,JSON.stringify(logs.slice(-100)))}catch(__){}}
}
rotateLogs();
window.addEventListener('error',event=>{
 if(event&&event.message)addLog('error',event.message,event.filename,event.lineno,event.colno);
 else if(event&&event.target&&event.target!==window)addLog('resource-error','リソースの読み込みに失敗しました',event.target.src||event.target.href||'');
});
window.addEventListener('unhandledrejection',event=>{
 const reason=event.reason;
 addLog('unhandled-rejection',reason&&reason.message?reason.message:typeof reason==='string'?reason:'未処理の非同期エラー');
});
window.AEVSTUDIO_LOGS=Object.freeze({
 get:()=>rotateLogs().map(x=>({...x})),
 count:()=>rotateLogs().length,
 clear:()=>{try{localStorage.removeItem(LOG_KEY);return true}catch(_){return false}},
 retentionDays:LOG_DAYS,
 maxEntries:LOG_MAX
});
})();
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const config=window.AEVSTUDIO_CONFIG||{}, configured=config.supabaseUrl&&config.supabaseAnonKey&&!config.supabaseAnonKey.startsWith('PASTE_');
let client=null,user=null,projects=[],current=null,mode='visual',signup=false,selectedTemplate='blank',realtimeChannel=null,autosaveTimer=null;
if(window.AEVSTUDIO_AUTH?.client)client=window.AEVSTUDIO_AUTH.client;else if(configured&&window.supabase)client=window.supabase.createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
window.AEVSTUDIO_AUTH=window.AEVSTUDIO_AUTH||{};window.AEVSTUDIO_AUTH.client=client;window.AEVSTUDIO_AUTH.isLoggedIn=()=>!!user;window.AEVSTUDIO_AUTH.getSession=()=>client?client.auth.getSession():Promise.resolve({data:{session:null},error:new Error('Supabase client unavailable')});window.AEVSTUDIO_AUTH.onAuthStateChange=callback=>client?client.auth.onAuthStateChange(callback):null;window.AEVSTUDIO_AUTH.signInWithPassword=args=>client?client.auth.signInWithPassword(args):Promise.resolve({error:new Error('Supabase client unavailable')});window.AEVSTUDIO_AUTH.signUp=args=>client?client.auth.signUp(args):Promise.resolve({error:new Error('Supabase client unavailable')});window.AEVSTUDIO_AUTH.signOut=()=>client?client.auth.signOut():Promise.resolve({error:new Error('Supabase client unavailable')});
/* Initialize the shared header session indicator before page-specific UI code. */
function updateSharedAuthHeader(session){
 user=session?.user||null;
 const button=document.getElementById('auth-open');
 const badge=document.getElementById('auth-status');
 const label=document.getElementById('account-label');
 if(button){button.classList.toggle('hidden',!!user);button.textContent='ログイン / 登録';}
 if(badge)badge.classList.toggle('hidden',!user);
 if(label)label.textContent=user?(user.email||'ログイン中'):'ゲストモード';
}
if(client){
 client.auth.onAuthStateChange((_event,session)=>updateSharedAuthHeader(session));
 client.auth.getSession().then(({data,error})=>{
  if(!error)updateSharedAuthHeader(data.session);
 }).catch(error=>console.warn('Shared auth header session check failed',error));
}


const builtinSnippets=[
{id:'modal-dialog',category:'HTML',title:'モーダルダイアログ',description:'ボタンから説明や確認画面を表示する基本構成。',tags:['ポップアップ','ダイアログ','画面','表示'],code:'<dialog id="myDialog">\\n  <p>メッセージ</p>\\n  <button onclick="this.closest(\\'dialog\\').close()">閉じる</button>\\n</dialog>\\n<button onclick="document.querySelector(\\'#myDialog\\').showModal()">開く</button>',difficulty:'初級'},
{id:'responsive-grid',category:'CSS',title:'レスポンシブカードグリッド',description:'画面幅に合わせてカードの列数を自動調整。',tags:['スマホ','タブレット','pc','カード','レイアウト'],code:'.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; }',difficulty:'初級'},
{id:'dark-glass',category:'CSS',title:'ダーク・ガラス風パネル',description:'半透明背景とぼかしを使ったパネルデザイン。',tags:['ダーク','ガラス','ぼかし','gaming','パネル'],code:'.glass { background:rgba(18,24,42,.72); border:1px solid rgba(255,255,255,.12); border-radius:16px; backdrop-filter:blur(14px); box-shadow:0 16px 50px #0005; }',difficulty:'中級'},
{id:'copy-clipboard',category:'JavaScript',title:'テキストをコピー',description:'ボタン操作で指定したテキストをクリップボードへコピー。',tags:['コピー','クリップボード','ボタン'],code:'async function copyText(text) {\\n  await navigator.clipboard.writeText(text);\\n  alert("コピーしました");\\n}',difficulty:'初級'},
{id:'image-lightbox',category:'JavaScript',title:'画像の拡大表示',description:'画像を選択すると大きく表示する簡易ライトボックス。',tags:['画像','拡大','写真','クリック','ギャラリー'],code:'document.querySelectorAll("[data-lightbox]").forEach(img => {\\n  img.addEventListener("click", () => {\\n    const view = document.querySelector("#lightbox");\\n    view.querySelector("img").src = img.src;\\n    view.showModal();\\n  });\\n});',difficulty:'中級'},
{id:'theme-toggle',category:'JavaScript',title:'ダーク・ライト切り替え',description:'ボタンでページのテーマを切り替え、選択を保存。',tags:['テーマ','ダークモード','ライトモード','設定'],code:'const button = document.querySelector("#themeToggle");\\nbutton.addEventListener("click", () => {\\n  document.documentElement.classList.toggle("light");\\n  localStorage.setItem("theme", document.documentElement.classList.contains("light") ? "light" : "dark");\\n});',difficulty:'中級'},
{id:'sticky-header',category:'CSS',title:'スクロール追従ヘッダー',description:'ページをスクロールしても上部に固定されるヘッダー。',tags:['ヘッダー','固定','スクロール','ナビゲーション'],code:'.header { position:sticky; top:0; z-index:100; background:rgba(10,14,25,.88); backdrop-filter:blur(12px); }',difficulty:'初級'},
{id:'form-validation',category:'JavaScript',title:'入力フォームの簡易チェック',description:'必須項目が入力されているかを確認する。',tags:['フォーム','入力','バリデーション','確認'],code:'const form = document.querySelector("#myForm");\\nform.addEventListener("submit", event => {\\n  if (!form.reportValidity()) event.preventDefault();\\n});',difficulty:'初級'},
{id:'animated-gradient',category:'CSS',title:'アニメーションするグラデーション',description:'背景色がゆっくり変化する演出。',tags:['アニメーション','背景','グラデーション','動き'],code:'.gradient { background:linear-gradient(120deg,#5947a8,#147d91,#5947a8); background-size:200% 200%; animation:flow 8s ease infinite; }\\n@keyframes flow { 50% { background-position:100% 50%; } }',difficulty:'中級'},
{"id":"hamburger-accessible","category":"JavaScript","title":"スマホ対応の三本線メニュー","description":"開閉状態・Escキー・背景クリック・リンク選択時の閉じる処理。","tags":["三本線","ハンバーガー","メニュー","ナビ"],"difficulty":"中級","code":"const toggle=document.querySelector(\"#menu-toggle\");\nconst menu=document.querySelector(\"#site-menu\");\nconst backdrop=document.querySelector(\"#menu-backdrop\");\nfunction setMenu(open){\n  menu.hidden=!open; backdrop.hidden=!open;\n  toggle.setAttribute(\"aria-expanded\",String(open));\n}\ntoggle.onclick=()=>setMenu(toggle.getAttribute(\"aria-expanded\")!==\"true\");\nbackdrop.onclick=()=>setMenu(false);\nmenu.querySelectorAll(\"a\").forEach(a=>a.onclick=()=>setMenu(false));\ndocument.addEventListener(\"keydown\",e=>{if(e.key===\"Escape\")setMenu(false)});\nsetMenu(false);"},
{"id":"hamburger-html","category":"HTML","title":"三本線メニューのHTML土台","description":"ボタン・ナビゲーション・背景レイヤーの基本構造。","tags":["三本線","メニュー","ハンバーガー"],"difficulty":"初級","code":"<button id=\"menu-toggle\" aria-expanded=\"false\" aria-controls=\"site-menu\">☰ メニュー</button>\n<nav id=\"site-menu\" hidden aria-label=\"メインメニュー\">\n  <a href=\"index.html\">ホーム</a><a href=\"about.html\">サイトについて</a><a href=\"account.html\">アカウント</a>\n</nav>\n<button id=\"menu-backdrop\" hidden aria-label=\"メニューを閉じる\"></button>"},
{"id":"dropdown-menu","category":"HTML","title":"ドロップダウンメニュー","description":"details/summaryで作る折り畳みメニュー。","tags":["ドロップダウン","折り畳み","メニュー"],"difficulty":"初級","code":"<details class=\"menu-group\"><summary>アカウント</summary>\n<a href=\"account.html\">プロフィール</a><a href=\"settings.html\">設定</a><a href=\"help.html\">ヘルプ</a></details>"},
{"id":"account-layout","category":"HTML","title":"アカウントページの基本レイアウト","description":"プロフィール・登録情報・設定を分けた土台。表示だけでは認証されません。","tags":["アカウント","プロフィール","ログイン","設定"],"difficulty":"初級","code":"<main class=\"account-page\">\n  <header><h1>アカウント</h1><p>登録情報と設定を管理します。</p></header>\n  <section class=\"account-card\"><h2>プロフィール</h2>\n    <img src=\"avatar-placeholder.png\" alt=\"プロフィール画像\">\n    <p id=\"display-name\">ゲスト</p><p id=\"account-email\">未ログイン</p>\n    <a href=\"profile-edit.html\">プロフィールを編集</a>\n  </section>\n  <section class=\"account-card\"><h2>設定</h2>\n    <a href=\"settings.html\">表示・通知設定</a><button id=\"logout-button\">ログアウト</button>\n  </section>\n</main>"},
{"id":"supabase-auth","category":"JavaScript","title":"Supabaseの新規登録・ログイン","description":"初期化済みclientを使う認証例。ブラウザにはpublishable/anon keyのみを置き、RLSを設定します。","tags":["アカウント","新規登録","ログイン","supabase","認証"],"difficulty":"中級","code":"async function register(email,password){\n  const {data,error}=await client.auth.signUp({email,password});\n  if(error) throw error; return data;\n}\nasync function login(email,password){\n  const {data,error}=await client.auth.signInWithPassword({email,password});\n  if(error) throw error; return data;\n}\n// service_role key はブラウザに絶対に置かない。"},
{"id":"auth-guard","category":"JavaScript","title":"ログイン状態の確認とページ保護","description":"セッションがない場合はログイン画面へ案内します。","tags":["アカウント","ログイン","認証","セッション"],"difficulty":"中級","code":"const {data,error}=await client.auth.getSession();\nif(error) throw error;\nif(!data.session) location.href=\"login.html\";\nelse document.querySelector(\"#account-email\").textContent=data.session.user.email;"},
{"id":"profile-update","category":"JavaScript","title":"プロフィール名を更新","description":"Supabase Authのユーザーメタデータに表示名を保存します。","tags":["アカウント","プロフィール","ユーザー名","supabase"],"difficulty":"中級","code":"async function updateDisplayName(displayName){\n  const {data,error}=await client.auth.updateUser({data:{display_name:displayName}});\n  if(error) throw error; return data.user;\n}"},
{"id":"responsive-nav","category":"CSS","title":"スマホ対応ナビゲーション","description":"PCでは横並び、狭い画面では縦並びにします。","tags":["スマホ","メニュー","ナビゲーション","レスポンシブ"],"difficulty":"初級","code":".site-nav{display:flex;align-items:center;gap:18px}\n@media(max-width:700px){.site-nav{flex-direction:column;align-items:stretch;gap:8px}}"},
{"id":"tabs","category":"JavaScript","title":"タブ切り替え","description":"選択したタブに対応するパネルだけを表示します。","tags":["タブ","切り替え","パネル"],"difficulty":"初級","code":"document.querySelectorAll(\"[data-tab]\").forEach(button=>{\n  button.addEventListener(\"click\",()=>{\n    const target=button.dataset.tab;\n    document.querySelectorAll(\"[data-panel]\").forEach(panel=>panel.hidden=panel.dataset.panel!==target);\n    document.querySelectorAll(\"[data-tab]\").forEach(tab=>tab.setAttribute(\"aria-selected\",String(tab===button)));\n  });\n});"},
{"id":"faq-accordion","category":"HTML","title":"よくある質問のアコーディオン","description":"JavaScript不要で開閉できるFAQ。","tags":["FAQ","よくある質問","アコーディオン","折り畳み"],"difficulty":"初級","code":"<section class=\"faq\">\n  <details><summary>アカウントは必要ですか？</summary><p>保存機能を使う場合は必要、閲覧だけなら不要、など説明します。</p></details>\n  <details><summary>スマートフォンに対応していますか？</summary><p>画面幅に合わせて調整します。</p></details>\n</section>"},
{"id":"live-search","category":"JavaScript","title":"リアルタイム検索・絞り込み","description":"入力語に合わせて一覧カードを表示・非表示にします。","tags":["検索","フィルター","絞り込み","カード"],"difficulty":"初級","code":"const search=document.querySelector(\"#search\");\nconst cards=[...document.querySelectorAll(\"[data-search-card]\")];\nsearch.addEventListener(\"input\",()=>{\n  const q=search.value.trim().toLowerCase();\n  cards.forEach(card=>card.hidden=!card.textContent.toLowerCase().includes(q));\n});"},
{"id":"favorites","category":"JavaScript","title":"お気に入り・ブックマーク機能","description":"お気に入りIDを端末内に保存。複数端末同期にはDBが必要です。","tags":["お気に入り","ブックマーク","保存","localstorage"],"difficulty":"中級","code":"const KEY=\"my-favorites\";\nconst favorites=new Set(JSON.parse(localStorage.getItem(KEY)||\"[]\"));\nfunction toggleFavorite(id,button){\n  if(favorites.has(id)) favorites.delete(id); else favorites.add(id);\n  localStorage.setItem(KEY,JSON.stringify([...favorites]));\n  button.setAttribute(\"aria-pressed\",String(favorites.has(id)));\n  button.textContent=favorites.has(id)?\"★ お気に入り済み\":\"☆ お気に入り\";\n}"},
{"id":"toast","category":"JavaScript","title":"画面内通知（トースト）","description":"保存成功・エラーなどを画面内に短く表示します。","tags":["通知","トースト","メッセージ","エラー"],"difficulty":"初級","code":"function showToast(message){\n  const toast=document.querySelector(\"#toast\");\n  toast.textContent=message; toast.hidden=false;\n  clearTimeout(showToast.timer);\n  showToast.timer=setTimeout(()=>toast.hidden=true,2800);\n}\n// HTML: <div id=\"toast\" role=\"status\" hidden></div>\nshowToast(\"保存しました\");"},
{"id":"password-visibility","category":"JavaScript","title":"パスワード表示・非表示","description":"入力欄のtypeを切り替えます。","tags":["パスワード","表示","非表示","ログイン"],"difficulty":"初級","code":"const password=document.querySelector(\"#password\");\ndocument.querySelector(\"#toggle-password\").addEventListener(\"click\",event=>{\n  const visible=password.type===\"password\";\n  password.type=visible?\"text\":\"password\";\n  event.currentTarget.setAttribute(\"aria-pressed\",String(visible));\n  event.currentTarget.textContent=visible?\"隠す\":\"表示\";\n});"},
{"id":"character-counter","category":"JavaScript","title":"入力文字数カウンター","description":"textareaの文字数をリアルタイム表示し、上限も設定します。","tags":["文字数","カウンター","入力","フォーム"],"difficulty":"初級","code":"const field=document.querySelector(\"#message\");\nconst counter=document.querySelector(\"#counter\");\nconst limit=300; field.maxLength=limit;\nfunction updateCount(){counter.textContent=field.value.length+\" / \"+limit}\nfield.addEventListener(\"input\",updateCount); updateCount();"},
{"id":"image-preview","category":"JavaScript","title":"画像選択時のプレビュー","description":"選択画像をアップロード前に表示。サーバー保存は別途必要です。","tags":["画像","アップロード","プレビュー","ファイル選択"],"difficulty":"中級","code":"const input=document.querySelector(\"#image-file\");\nconst preview=document.querySelector(\"#image-preview\");\ninput.addEventListener(\"change\",()=>{\n  const file=input.files?.[0];\n  if(!file||!file.type.startsWith(\"image/\")) return;\n  const url=URL.createObjectURL(file);\n  preview.src=url; preview.onload=()=>URL.revokeObjectURL(url);\n});"},
{"id":"modal","category":"HTML","title":"確認モーダル","description":"dialog要素で確認画面を作ります。","tags":["モーダル","確認","ポップアップ","dialog"],"difficulty":"初級","code":"<button id=\"open-confirm\">削除を確認</button>\n<dialog id=\"confirm-dialog\"><h2>本当に実行しますか？</h2><p>この操作は取り消せません。</p>\n<button onclick=\"this.closest('dialog').close()\">キャンセル</button></dialog>\n<script>document.querySelector(\"#open-confirm\").onclick=()=>document.querySelector(\"#confirm-dialog\").showModal();</script>"},
{"id":"back-to-top","category":"JavaScript","title":"ページ上部へ戻るボタン","description":"一定量スクロールしたら表示し、クリックで先頭へ戻ります。","tags":["トップへ戻る","スクロール","ボタン"],"difficulty":"初級","code":"const topButton=document.querySelector(\"#back-to-top\");\nwindow.addEventListener(\"scroll\",()=>{topButton.hidden=window.scrollY<350},{passive:true});\ntopButton.addEventListener(\"click\",()=>window.scrollTo({top:0,behavior:\"smooth\"}));"},
{"id":"loading-button","category":"JavaScript","title":"送信中のボタン表示","description":"処理中の二重送信を防ぎます。","tags":["読み込み中","ローディング","送信","フォーム"],"difficulty":"初級","code":"async function handleSubmit(button){\n  button.disabled=true; const original=button.textContent; button.textContent=\"処理中...\";\n  try{await doYourRequest()} finally{button.disabled=false;button.textContent=original}\n}"},
{"id":"carousel","category":"JavaScript","title":"画像スライダー・カルーセル","description":"前へ・次へボタンで画像を切り替える基本形。","tags":["スライダー","カルーセル","画像","ギャラリー"],"difficulty":"中級","code":"const slides=[...document.querySelectorAll(\"[data-slide]\")]; let active=0;\nfunction showSlide(index){active=(index+slides.length)%slides.length;slides.forEach((slide,i)=>slide.hidden=i!==active)}\ndocument.querySelector(\"#next\").onclick=()=>showSlide(active+1);\ndocument.querySelector(\"#previous\").onclick=()=>showSlide(active-1);showSlide(0);"},
{"id":"pagination","category":"JavaScript","title":"一覧のページ分割","description":"長い一覧を一定件数ずつ表示する基本ロジック。","tags":["ページネーション","ページ送り","一覧","分割"],"difficulty":"中級","code":"const items=[...document.querySelectorAll(\"[data-item]\")]; const perPage=8;\nfunction renderPage(page){const start=(page-1)*perPage;items.forEach((item,index)=>item.hidden=index<start||index>=start+perPage)}\nrenderPage(1);"},
{"id":"responsive-cards","category":"CSS","title":"スマホ対応カードUI","description":"画面幅に合わせてカード列数を自動調整します。","tags":["カード","スマホ","レスポンシブ","グリッド"],"difficulty":"初級","code":".card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px}\n.card{min-width:0;padding:18px;border:1px solid #29344b;border-radius:14px}"},
{"id":"theme-toggle","category":"JavaScript","title":"ダーク・ライトテーマ切り替え","description":"テーマを切り替え、次回アクセス時にも選択を復元します。","tags":["ダークモード","ライトモード","テーマ","外観"],"difficulty":"初級","code":"const button=document.querySelector(\"#theme-toggle\");\ndocument.documentElement.dataset.theme=localStorage.getItem(\"theme\")||\"dark\";\nbutton.addEventListener(\"click\",()=>{const next=document.documentElement.dataset.theme===\"dark\"?\"light\":\"dark\";document.documentElement.dataset.theme=next;localStorage.setItem(\"theme\",next)});"}
];
const snippetGuides={
'modal-dialog':{group:'interaction',usage:'dialog要素で確認画面や補足情報を表示します。開くボタンからshowModal()を呼び、閉じる操作でclose()を呼びます。',caution:'dialogのidはページ内で重複させないでください。開く対象の要素が存在することを確認し、Escキーなど利用者が閉じられる手段も用意してください。'},
'responsive-grid':{group:'design',usage:'カードを並べる親要素にgridクラスを付けます。画面幅に応じて列数が自動調整されます。',caution:'カード内に長いURLや大きな画像がある場合は、子要素にmin-width:0や画像のmax-width:100%も指定してください。'},
'dark-glass':{group:'design',usage:'半透明のパネルにglassクラスを付けます。背景の上に重ねるカードやメニューに使えます。',caution:'backdrop-filterに対応しない環境ではぼかしが表示されません。文字と背景のコントラストを確保し、装飾だけに頼らないでください。'},
'copy-clipboard':{group:'interaction',usage:'copyText("コピーしたい文章")のように呼び出します。コピー操作は利用者が押すボタンなどの操作に結び付けてください。',caution:'Clipboard APIはHTTPSなどの安全なコンテキストとブラウザーの許可が必要です。失敗時の案内も追加してください。'},
'image-lightbox':{group:'media',usage:'拡大対象の画像にdata-lightbox属性を付け、ページ内にid="lightbox"のdialogとimgを用意します。画像を押すとdialog内に表示します。',caution:'dialogと内部imgが存在することを確認してください。閉じるボタン、代替テキスト、画像の読み込み失敗への対応も用意してください。'},
'theme-toggle':{group:'design',usage:'id="themeToggle"のボタンを用意し、押されたときにhtml要素のlightクラスを切り替えます。CSS側でlight時の配色を定義します。',caution:'localStorageが使えない環境も考慮してください。初回表示時に保存済みテーマを復元する処理と、文字色・背景色の両方の定義が必要です。'},
'sticky-header':{group:'navigation',usage:'ページ上部のヘッダーにheaderクラスを付けると、スクロール中も上端に追従します。',caution:'祖先要素にoverflow設定があるとstickyの動作に影響します。重なり順(z-index)と、固定ヘッダーで本文が隠れないかを確認してください。'},
'form-validation':{group:'forms',usage:'id="myForm"のform要素にsubmitイベントを設定します。required、type、minlengthなどのHTML属性と組み合わせて入力を確認します。',caution:'ブラウザー側の検証だけでは不十分です。重要なデータはサーバー側でも必ず検証し、エラー理由を利用者に分かる形で示してください。'},
'animated-gradient':{group:'design',usage:'背景を動かしたい要素にgradientクラスを付けます。@keyframes flowで背景位置を変化させます。',caution:'動きが苦手な利用者向けにprefers-reduced-motionへの対応を追加してください。大きな領域で多用すると描画負荷が上がる場合があります。'},
'hamburger-accessible':{group:'navigation',usage:'menu-toggle、site-menu、menu-backdropの3要素をHTMLに用意し、ボタンから開閉します。Escキーや背景クリックでも閉じます。',caution:'コード内のidとHTMLのidを一致させてください。メニューを開いたときのフォーカス移動、フォーカス戻し、画面読み上げ向けの状態通知も確認してください。'},
'hamburger-html':{group:'navigation',usage:'メニューを開くbutton、リンクを含むnav、背景ボタンをページに配置します。JavaScript側のid指定と一致させてください。',caution:'idはページ内で一意にしてください。JavaScriptが無効でも主要なページへ移動できる代替ナビゲーションを検討してください。'},
'dropdown-menu':{group:'navigation',usage:'detailsの中にsummaryとリンクを置きます。summaryを押すと、JavaScriptなしで項目を開閉できます。',caution:'summaryには内容が分かる短い見出しを付けてください。入れ子を深くしすぎず、キーボードでも操作できるか確認してください。'},
'account-layout':{group:'account',usage:'プロフィールと設定をsectionごとに分けるアカウント画面のHTML土台として使います。表示内容は実際のユーザー情報に置き換えます。',caution:'このHTMLだけではログインや本人確認はできません。メールアドレスなどの個人情報を表示する前に、認証とアクセス制御を実装してください。'},
'supabase-auth':{group:'account',usage:'Supabaseクライアントを初期化した後、register()で新規登録、login()でメールアドレスとパスワードによるログインを行います。',caution:'ブラウザーに置けるのは公開用キーのみです。service_roleキーや秘密情報を公開しないでください。データベースには適切なRLSポリシーを設定してください。'},
'auth-guard':{group:'account',usage:'getSession()でセッションを確認し、未ログインならログインページへ案内します。ログイン中は画面にユーザー情報を表示できます。',caution:'クライアント側の画面遷移だけではデータを保護できません。データベース側のRLSやサーバー側の認可チェックを必ず併用してください。'},
'profile-update':{group:'account',usage:'ログイン中のユーザーがupdateDisplayName("表示名")を呼び、ユーザーメタデータのdisplay_nameを更新します。',caution:'入力文字数や使用可能文字を検証してください。ユーザーメタデータを権限判定の根拠にせず、重要な権限は信頼できるサーバー側で管理してください。'},
'responsive-nav':{group:'navigation',usage:'site-navクラスをナビゲーションに付けます。幅700px以下ではリンクを縦並びに切り替えます。',caution:'実際のヘッダー幅に合わせてブレークポイントを調整してください。横スクロールやリンクの押しにくさがないかスマートフォンでも確認してください。'},
'tabs':{group:'interaction',usage:'各タブにdata-tab、表示領域に対応するdata-panelを付けます。クリックしたタブに対応するパネルだけが表示されます。',caution:'タブ名とパネルの値を一致させてください。aria-selectedだけでなく、必要に応じてroleやキーボード操作も実装してください。'},
'faq-accordion':{group:'interaction',usage:'質問ごとにdetailsとsummaryを配置し、回答をその中に記述します。利用者が質問を押すと回答が開きます。',caution:'summaryの文言だけで質問内容が伝わるようにしてください。長い回答や複雑な操作をdetails内に詰め込みすぎないでください。'},
'live-search':{group:'data',usage:'id="search"の入力欄とdata-search-card属性を付けたカードを用意します。入力するたびにカードのテキストを照合して絞り込みます。',caution:'この例は読み込まれている要素だけを検索します。大量データでは検索対象を絞り、検索結果0件の案内や入力のクリア操作も追加してください。'},
'favorites':{group:'data',usage:'各項目のIDをtoggleFavorite()へ渡します。お気に入りIDはlocalStorageに保存され、同じブラウザーで次回も復元できます。',caution:'localStorageは端末・ブラウザー単位です。別端末との同期やユーザー間の共有には認証とデータベースが必要です。保存データを安全な認証情報として扱わないでください。'},
'toast':{group:'interaction',usage:'HTMLにid="toast"の通知領域を用意し、showToast("保存しました")のように呼び出します。',caution:'通知を短時間で消す場合も、重要なエラーを見逃さないようにしてください。role="status"を付け、必要に応じて閉じる手段も用意してください。'},
'password-visibility':{group:'forms',usage:'id="password"の入力欄とid="toggle-password"のボタンを用意します。ボタンで入力欄をpassword/textに切り替えます。',caution:'パスワードを画面に表示する機能です。初期状態は必ず非表示にし、共有端末では周囲から見られないよう注意を促してください。'},
'character-counter':{group:'forms',usage:'id="message"の入力欄とid="counter"の表示領域を用意します。入力のたびに文字数と上限を更新します。',caution:'HTMLのmaxlengthとサーバー側の文字数制限を揃えてください。絵文字などは文字数の数え方が利用者の感覚と異なる場合があります。'},
'image-preview':{group:'media',usage:'type="file"の入力欄とid="image-preview"のimgを用意します。選択した画像をアップロード前にプレビューします。',caution:'このコードは端末内のプレビューのみで、サーバー保存は行いません。ファイル形式・サイズを検証し、不要になったObject URLは解放してください。'},
'modal':{group:'interaction',usage:'確認ボタンとdialogを配置し、ボタン操作でshowModal()を呼び出します。キャンセル時はclose()で閉じます。',caution:'この例は表示だけで、削除処理そのものは行いません。実行前に対象を確認し、Escキーやキャンセルボタンで閉じられるようにしてください。'},
'back-to-top':{group:'navigation',usage:'id="back-to-top"のボタンを用意します。一定量スクロールすると表示され、押すとページ先頭へ戻ります。',caution:'対象ボタンが存在することを確認してください。スクロールアニメーションはprefers-reduced-motionに配慮してください。'},
'loading-button':{group:'interaction',usage:'非同期処理の開始時にボタンを無効化して処理中と表示し、終了後に元の状態へ戻します。',caution:'例のdoYourRequest()は実際の処理に置き換えてください。失敗時のエラー表示を追加し、finallyで必ずボタンを元に戻してください。'},
'carousel':{group:'media',usage:'各スライドにdata-slide、前後ボタンにpreviousとnextのidを付けます。ボタン操作で表示するスライドを切り替えます。',caution:'スライド数が0の場合の処理や、画像の代替テキストを用意してください。自動再生を追加する場合は停止操作も必要です。'},
'pagination':{group:'data',usage:'一覧の各要素にdata-itemを付け、renderPage(ページ番号)で表示する範囲を切り替えます。',caution:'この例は画面上の要素を隠すだけで、データを分割取得するものではありません。ページ番号の範囲や0件の場合を処理してください。'},
'responsive-cards':{group:'design',usage:'カード一覧の親要素にcard-grid、各カードにcardを付けます。画面幅に合わせて列数が変化します。',caution:'カード内の画像や長いテキストがはみ出さないようにしてください。実機の幅で余白と読みやすさを確認してください。'}
};
window.AEVSTUDIO_BUILTIN_SNIPPETS=builtinSnippets;
window.AEVSTUDIO_SNIPPET_GUIDES=snippetGuides;
const groupNames={navigation:'ナビゲーション',design:'デザイン・レイアウト',forms:'フォーム・入力',account:'アカウント',media:'画像・メディア',interaction:'操作・表示',data:'検索・データ'};
let codeSnippets=[...new Map(builtinSnippets.map(x=>[x.id,{...x,...(snippetGuides[x.id]||{}),aliases:x.tags||[]}])).values()],activeCodeCategory='all';
function renderCodeSnippets(list=codeSnippets){
 const root=$('#code-snippet-list'); if(!root)return;
 const q=$('#code-search-input')?.value.trim()||'';
 const ranked=list.filter(x=>activeCodeCategory==='all'||x.group===activeCodeCategory)
  .map(item=>({item,score:q?scoreLocalSnippet(item,q):1}))
  .filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 const shown=ranked.map(x=>x.item);
 root.innerHTML=shown.length?shown.map(x=>'<article class="code-snippet"><div class="code-snippet-top"><span class="code-tag">'+escapeHtml(x.category)+' · '+escapeHtml(x.difficulty||'')+'</span><span class="code-tag">'+escapeHtml(groupNames[x.group]||'その他')+'</span></div><h3>'+escapeHtml(x.title)+'</h3><p>'+escapeHtml(x.description||'')+'</p><details class="code-source"><summary>コードを表示</summary><pre>'+escapeHtml(x.code||'')+'</pre><div class="code-snippet-actions"><button data-copy-code="'+escapeHtml(x.id)+'">コードをコピー</button></div></details><details class="code-guide"><summary>使い方・説明・注意点</summary><div><p><b>使い方</b><br>'+escapeHtml(x.usage||'コードをページ内の対応する場所へ追加し、必要なIDやクラスをHTML側に用意してください。')+'</p><p><b>注意点</b><br>'+escapeHtml(x.caution||'実際のページ構成や利用環境に合わせて調整し、公開前に動作確認してください。')+'</p></div></details></article>').join(''):'<div class="empty">該当するコードがありません。名前の一部、別名、用途の言葉でも検索できます。</div>';
 $('#code-search-status').textContent=shown.length+' 件のコードを表示中'+(q?'（関連語・一部一致）':'');
 $$('[data-copy-code]').forEach(b=>b.onclick=async()=>{const x=codeSnippets.find(s=>s.id===b.dataset.copyCode);if(x){try{await navigator.clipboard.writeText(x.code);b.textContent='コピーしました'}catch(e){b.textContent='コピーできませんでした。コードを選択してコピーしてください。'}}});
}
function loadCodeSnippets(){
 // The code library is fully local: render synchronously without waiting for Supabase.
 codeSnippets=[...new Map(builtinSnippets.map(x=>[x.id,{...x,...(snippetGuides[x.id]||{}),aliases:x.tags||[]}])).values()];
 renderCodeSnippets();
 const status=$('#code-search-status');
 if(status)status.textContent=codeSnippets.length+' 件のコードを表示中（端末内）';
}
function setupRealtime(){
 if(!client)return;
 if(realtimeChannel){client.removeChannel(realtimeChannel);realtimeChannel=null;}
 let channel=client.channel('aevstudio-live'+(user?'-'+user.id:'-public'));
 if(user)channel=channel.on('postgres_changes',{event:'*',schema:'public',table:'studio_projects',filter:'user_id=eq.'+user.id},()=>loadProjects(true));
 channel=channel.on('postgres_changes',{event:'*',schema:'public',table:'studio_code_snippets'},()=>loadCodeSnippets());
 realtimeChannel=channel.subscribe();
}
function filterCode(){renderCodeSnippets()}
(function initCodeLibraryEarly(){
 try{
  initMenu();
  loadCodeSnippets();
  const searchButton=$('#code-search-button'),searchInput=$('#code-search-input');
  const initialQuery=new URLSearchParams(window.location.search).get('q');
  if(initialQuery&&searchInput){searchInput.value=initialQuery;filterCode();setTimeout(()=>searchInput.scrollIntoView({behavior:'smooth',block:'center'}),80);}
  if(searchButton)searchButton.onclick=filterCode;
  if(searchInput)searchInput.addEventListener('input',filterCode);
  $('[data-code-category]').forEach(b=>b.onclick=()=>{
   activeCodeCategory=b.dataset.codeCategory;
   $('[data-code-category]').forEach(x=>x.classList.toggle('active',x===b));
   renderCodeSnippets();
  });
 }catch(error){
  console.error('AevStudio code library initialization failed:',error);
  const status=$('#code-search-status');
  if(status)status.textContent='コード一覧の初期化エラー：'+(error?.message||'不明なエラー');
 }
})();
const localSynonyms={
 '画像':['写真','picture','photo','image','gallery','ギャラリー','拡大','lightbox'],
 '拡大':['大きく','ズーム','zoom','enlarge','lightbox'],
 'スマホ':['モバイル','mobile','phone','responsive','レスポンシブ'],
 'レイアウト':['配置','grid','layout','カード','card','columns'],
 'コピー':['複製','clipboard','copy','クリップボード'],
 'テーマ':['色','外観','dark','light','theme','ダーク','ライト'],
 'フォーム':['入力','form','validation','バリデーション','チェック'],
 'アニメーション':['動き','animation','animated','gradient','グラデーション'],
 '固定':['追従','sticky','fixed','header','ヘッダー'],
 'ポップアップ':['モーダル','dialog','modal','popup','ダイアログ'],
 'ボタン':['クリック','click','button','操作'],
 '背景':['background','gradient','グラデーション'],
 'ページ':['web page','website','サイト','ウェブサイト']
};
function localSearchTokens(value){
 const s=String(value||'').toLowerCase().replace(/[Ａ-Ｚａ-ｚ０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0));
 const words=s.match(/[a-z0-9_+#.-]+|[ぁ-んァ-ヶ一-龠々ー]+/g)||[];
 const tokens=[];
 for(const word of words){
  if(word.length>1)tokens.push(word);
  if(/[ぁ-んァ-ヶ一-龠]/.test(word)&&word.length>2){
   for(let i=0;i<word.length-1;i++)tokens.push(word.slice(i,i+2));
  }
 }
 return [...new Set(tokens)];
}
function scoreLocalSnippet(item,query){
 const q=String(query||'').trim().toLowerCase();
 if(!q)return 1;
 const fields=[item.id||'',item.title||'',item.description||'',item.category||'',groupNames[item.group]||'',...(item.tags||[]),...(item.aliases||[]),item.usage||'',item.caution||''].join(' ').toLowerCase();
 const code=String(item.code||'').toLowerCase();
 let score=0;
 if(fields.includes(q))score+=30;
 if(String(item.title||'').toLowerCase().includes(q))score+=25;
 if(q.length===1&&fields.includes(q))score+=8;
 const expanded=new Set(localSearchTokens(q));
 for(const [key,values] of Object.entries(localSynonyms)){
  if(q.includes(key)||values.some(v=>q.includes(v.toLowerCase()))){
   localSearchTokens(key).forEach(t=>expanded.add(t));
   values.forEach(v=>localSearchTokens(v).forEach(t=>expanded.add(t)));
  }
 }
 const tokens=[...expanded].filter(t=>t.length>1);
 for(const token of tokens){
  if(fields.includes(token))score+=String(item.title||'').toLowerCase().includes(token)?9:5;
  if(code.includes(token))score+=1;
 }
 return score;
}
function initMenu(){
 const toggle=$('#menu-toggle'),menu=$('#site-menu'),backdrop=$('#menu-backdrop');
 const close=()=>{menu.classList.add('hidden');backdrop.classList.add('hidden');toggle.setAttribute('aria-expanded','false')};
 toggle.onclick=()=>{const open=menu.classList.contains('hidden');menu.classList.toggle('hidden',!open);backdrop.classList.toggle('hidden',!open);toggle.setAttribute('aria-expanded',String(open))};
 $('#menu-close').onclick=close;backdrop.onclick=close;
 menu.querySelectorAll('a[href]').forEach(link=>{
  link.addEventListener('click',()=>close());
 });
}

const starter={blank:{title:'Hello, AevStudio!',description:'ここからあなたのWebサイトを作りましょう。',color:'#8b6cff'},portfolio:{title:'My Portfolio',description:'こんにちは。私の作品とプロフィールを紹介します。',color:'#8b6cff'},landing:{title:'アイデアを、カタチに。',description:'私たちのサービスをご紹介します。',color:'#38b9c8'},blog:{title:'My Journal',description:'日々の気づきや好きなことを綴るブログです。',color:'#d69a70'}};
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fromVisual(){return {title:$('#visual-title').value,description:$('#visual-description').value,color:$('#visual-color').value,html:'',css:''}}
function applyProject(p){current=p;$('#project-name').value=p.name;$('#visual-title').value=p.title;$('#visual-description').value=p.description;$('#visual-color').value=p.color;$('#html-code').value=p.html||'';$('#css-code').value=p.css||'';renderProjects();refresh()}
function renderProjects(){
 $('#project-count').textContent=projects.length;
 const markup=projects.length?projects.map(p=>'<button class="project-item '+(current&&p.id===current.id?'active':'')+'" data-id="'+p.id+'">'+escapeHtml(p.name||'Untitled Project')+'<small>'+new Date(p.updated_at||Date.now()).toLocaleDateString('ja-JP')+'</small></button>').join(''):'<div class="empty">プロジェクトはまだありません。<br>「新しいプロジェクト」から作成できます。</div>';
 $('#project-list').innerHTML=markup;
 $('#hub-project-count').textContent=projects.length;
 $('#hub-project-list').innerHTML=projects.length?projects.map(p=>'<button class="hub-project-card" data-hub-id="'+p.id+'"><strong>'+escapeHtml(p.name||'Untitled Project')+'</strong><span>最終更新：'+new Date(p.updated_at||Date.now()).toLocaleString('ja-JP')+'</span><b>続きから開く →</b></button>').join(''):'<div class="empty">プロジェクトはまだありません。</div>';
 $$('.project-item').forEach(b=>b.onclick=()=>{applyProject(projects.find(p=>p.id===b.dataset.id));openWorkspace()});
 $$('[data-hub-id]').forEach(b=>b.onclick=()=>{const p=projects.find(x=>x.id===b.dataset.hubId);if(p){applyProject(p);openWorkspace()}});
 $('#continue-project').disabled=false;
}
function buildHTML(){let p=fromVisual();let title=escapeHtml(p.title),desc=escapeHtml(p.description);return '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:8vw;font:16px/1.7 system-ui;color:#202238;background:#f6f7fb}main{max-width:800px;margin:8vh auto;padding:50px;border-radius:24px;background:white;box-shadow:0 20px 70px #20204018}h1{font-size:clamp(32px,7vw,60px);line-height:1.15;color:'+p.color+'}p{color:#687087}button{border:0;border-radius:9px;padding:12px 20px;background:'+p.color+';color:white;font-weight:bold}'+(p.css||'')+'</style><main>'+(p.html||'<h1>'+title+'</h1><p>'+desc+'</p><button>はじめる</button>')+'</main><script>'+'</scr'+'ipt></html>'}
function refresh(){let html=mode==='code'?$('#html-code').value:buildHTML();if(mode==='code'){let css=$('#css-code').value;html=html.replace('</head>','<style>'+css+'</style></head>')}$('#preview-frame').srcdoc=html;$('#save-status').textContent='プレビューを更新しました'}
function showHub(){ $('#template-picker').classList.add('hidden');$('#workspace').classList.add('hidden');$('#project-hub').classList.remove('hidden');$('#project-hub').scrollIntoView({behavior:'smooth'}); }
function showTemplatePicker(){ $('#project-hub').classList.add('hidden');$('#workspace').classList.add('hidden');$('#template-picker').classList.remove('hidden');$('#template-picker').scrollIntoView({behavior:'smooth'}); }
function openWorkspace(){ $('#project-hub').classList.add('hidden');$('#template-picker').classList.add('hidden');$('#workspace').classList.remove('hidden');$('#workspace').scrollIntoView({behavior:'smooth'}); }
function newProject(template='blank'){let s=starter[template]||starter.blank;let projectId=(window.crypto&&typeof crypto.randomUUID==='function')?crypto.randomUUID():'aev-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);let p={id:projectId,name:template==='blank'?'Untitled Project':({portfolio:'Portfolio',landing:'Landing Page',blog:'Blog'}[template]),...s,html:'',css:'',updated_at:new Date().toISOString()};projects.unshift(p);applyProject(p);$('#starter-template').value=template;renderProjects();openWorkspace();saveLocal();if(client&&user)saveProject()}
function saveLocal(){localStorage.setItem('aevstudio.projects',JSON.stringify(projects));$('#save-status').textContent='この端末に保存しました'}
async function loadProjects(quiet=false){const previousId=current?.id;if(client&&user){const {data,error}=await client.from('studio_projects').select('*').order('updated_at',{ascending:false});if(!error&&data)projects=data.map(x=>({...x,id:x.id,name:x.name,title:x.title||'New page',description:x.description||'',color:x.color||'#8b6cff',html:x.html||'',css:x.css||''}));else projects=JSON.parse(localStorage.getItem('aevstudio.projects')||'[]')}else projects=JSON.parse(localStorage.getItem('aevstudio.projects')||'[]');renderProjects();current=projects.find(p=>p.id===previousId)||projects[0]||null;if(!quiet)showHub()}
async function saveProject(){if(!current)return;let p={...current,name:$('#project-name').value,...(mode==='visual'?fromVisual():{html:$('#html-code').value,css:$('#css-code').value}),updated_at:new Date().toISOString()};Object.assign(current,p);projects=projects.map(x=>x.id===p.id?p:x);saveLocal();renderProjects();if(client&&user){const payload={id:p.id,user_id:user.id,name:p.name,title:p.title,description:p.description,color:p.color,html:p.html,css:p.css,updated_at:p.updated_at};const {error}=await client.from('studio_projects').upsert(payload);if(error)$('#save-status').textContent='端末保存済み（クラウド保存エラー）';else $('#save-status').textContent='クラウドに保存しました'} }
function setMode(m){mode=m;$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));$('#visual-editor').classList.toggle('hidden',m!=='visual');$('#code-editor').classList.toggle('hidden',m!=='code');refresh()}

// Independent project-start handler: works even if another initializer fails.
document.addEventListener('click',function(event){
 const target=event.target.closest('#start-new-project,#create-selected-project,#back-to-hub');
 if(!target)return;
 event.preventDefault();event.stopImmediatePropagation();
 try{
  if(target.id==='start-new-project')showTemplatePicker();
  else if(target.id==='create-selected-project')newProject(selectedTemplate);
  else showHub();
 }catch(error){console.error('AevStudio project start error:',error);const status=$('#save-status');if(status)status.textContent='制作を開始できませんでした。ページを再読み込みしてください。';}
},true);
// Responsive live preview control.
const previewPane=$('.preview-pane'),previewHead=$('.preview-head');
if(previewPane&&previewHead&&!$('#preview-toggle')){
 const previewToggle=document.createElement('button');
 previewToggle.type='button';previewToggle.id='preview-toggle';previewToggle.textContent='実際の表示を確認';
 previewToggle.setAttribute('aria-expanded','false');
 previewHead.appendChild(previewToggle);
 previewToggle.addEventListener('click',()=>{
  const opened=previewPane.classList.toggle('preview-open');
  previewToggle.setAttribute('aria-expanded',String(opened));
  previewToggle.textContent=opened?'プレビューを閉じる':'実際の表示を確認';
  if(opened)refresh();
 });
}


function renderAccountPage(){
 const state=$('#account-state'),email=$('#account-email'),uid=$('#account-user-id'),created=$('#account-created'),action=$('#account-login-action'),passwordBtn=$('#account-password-update');
 if(!state)return;
 if(user){state.textContent='ログイン中';email.textContent=user.email||'未設定';uid.textContent=user.id||'—';created.textContent=user.created_at?new Date(user.created_at).toLocaleString():'—';if(action){action.textContent='ログアウト';action.onclick=async()=>{if(client)await client.auth.signOut();user=null;renderAccountPage();$('#account-label').textContent='ゲストモード';$('#auth-open').textContent='ログイン';};}if(passwordBtn)passwordBtn.disabled=false;}
 else{state.textContent='ログインしていません';email.textContent='—';uid.textContent='—';created.textContent='—';if(action){action.textContent='ログイン';action.onclick=()=>$('#auth-dialog').showModal();}if(passwordBtn)passwordBtn.disabled=true;}
}
$('#account-password-update')?.addEventListener('click',async()=>{
 const feedback=$('#account-feedback'),next=$('#account-new-password').value,confirm=$('#account-confirm-password').value;
 if(!user||!client){feedback.textContent='パスワードを変更するにはログインしてください。';return}
 if(next.length<6){feedback.textContent='パスワードは6文字以上で入力してください。';return}
 if(next!==confirm){feedback.textContent='確認用パスワードが一致しません。';return}
 const btn=$('#account-password-update');btn.disabled=true;feedback.textContent='変更しています...';
 try{const {error}=await client.auth.updateUser({password:next});if(error)throw error;feedback.textContent='パスワードを変更しました。';$('#account-new-password').value='';$('#account-confirm-password').value='';}
 catch(error){feedback.textContent='変更できませんでした：'+(error.message||'時間をおいて再度お試しください。');}
 finally{btn.disabled=false;}
});
renderAccountPage();

// Code library initialized independently above.
$('#start-new-project').onclick=showTemplatePicker;$('#back-to-hub').onclick=showHub;$('#back-project-hub').onclick=showHub;$('#continue-project').onclick=()=>$('#hub-project-list').scrollIntoView({behavior:'smooth'});$('#create-selected-project').onclick=()=>newProject(selectedTemplate);$$('[data-new-template]').forEach(b=>b.onclick=()=>{selectedTemplate=b.dataset.newTemplate;$$('[data-new-template]').forEach(x=>x.classList.toggle('selected',x===b))});$('#save-project').onclick=saveProject;$('#preview-project').onclick=()=>{refresh();$('#preview-frame').scrollIntoView({behavior:'smooth',block:'center'})};$('#refresh-preview').onclick=refresh;$$('.tab').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
['project-name','visual-title','visual-description','visual-color','html-code','css-code'].forEach(id=>$('#'+id)?.addEventListener('input',()=>{ $('#save-status').textContent='変更を自動保存します...';clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>saveProject(),700)}));
$('#starter-template').onchange=e=>{let s=starter[e.target.value];if(s){$('#visual-title').value=s.title;$('#visual-description').value=s.description;$('#visual-color').value=s.color;refresh()}};
$$('[data-template]').forEach(b=>b.onclick=()=>{selectedTemplate=b.dataset.template;showTemplatePicker();$$('[data-new-template]').forEach(x=>x.classList.toggle('selected',x.dataset.newTemplate===selectedTemplate))});
$('#add-section').onclick=()=>{let p=fromVisual();$('#visual-description').value=p.description+'\n\n新しいセクションを追加しました。';refresh()};
$('#auth-open').onclick=async()=>{if(user&&client){$('#auth-open').disabled=true;try{await client.auth.signOut()}finally{$('#auth-open').disabled=false}return}if(!user){if(!client){$('#auth-message').textContent='config.jsにSupabaseの公開キーを設定してください。'}$('#auth-dialog').showModal()}};
$('#auth-toggle').onclick=()=>{signup=!signup;$('#auth-title').textContent=signup?'アカウントを新規登録':'AevStudioにログイン';$('#auth-submit').textContent=signup?'登録する':'ログイン';$('#auth-toggle').textContent=signup?'ログインに戻る':'アカウントを新規登録'};
$('#auth-submit').onclick=async()=>{if(!client){$('#auth-message').textContent='Supabase公開キーが未設定です。';return}let email=$('#auth-email').value,password=$('#auth-password').value;let r=signup?await client.auth.signUp({email,password}):await client.auth.signInWithPassword({email,password});$('#auth-message').textContent=r.error?r.error.message:(signup?'確認メールを確認してください。':'ログインしました。');if(!r.error&&!signup){$('#auth-dialog').close();user=r.data.user;$('#account-label').textContent=user.email;$('#auth-open').textContent='ログアウト';await loadProjects()}};

function syncAuthControls(){const button=$('#auth-open'),status=$('#auth-status'),label=$('#account-label');if(button){button.classList.toggle('hidden',!!user);button.textContent='ログイン / 登録';button.setAttribute('aria-label','ログイン');}if(status)status.classList.toggle('hidden',!user);if(label)label.textContent=user?(user.email||'ログイン中'):'ゲストモード';renderAccountPage()}
if(client){client.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;syncAuthControls();setTimeout(async()=>{await loadProjects();setupRealtime()},0)});client.auth.getSession().then(async({data})=>{user=data.session?.user||null;syncAuthControls();await loadProjects();setupRealtime()})}else loadProjects();
})();