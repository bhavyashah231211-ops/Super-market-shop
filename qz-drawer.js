/* CBSystem Shop: cash drawer via QZ Tray (opens drawer with NO receipt).
   Loaded after the main script. Does three things:
   1. Loads the QZ Tray library (CDN, with fallback to ../qz-tray.js)
   2. Makes every drawer button (Printer.kickDrawer) use QZ when enabled
   3. Adds a "Cash Drawer (QZ Tray)" card to Settings
*/
(function(){
  'use strict';
  var QZ_CDN='https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js';
  var QZ_LOCAL='../qz-tray.js';
  var qzLoading=null;

  function loadQZ(){
    if(window.qz)return Promise.resolve();
    if(qzLoading)return qzLoading;
    qzLoading=new Promise(function(resolve,reject){
      function add(src,onFail){
        var s=document.createElement('script');
        s.src=src;
        s.onload=function(){resolve();};
        s.onerror=function(){s.remove();onFail();};
        document.head.appendChild(s);
      }
      add(QZ_CDN,function(){
        add(QZ_LOCAL,function(){qzLoading=null;reject(new Error('QZ Tray library could not be loaded'));});
      });
    });
    return qzLoading;
  }

  function cfg(){return DB.get('cfg');}
  function qzOn(){return !!cfg().qzEnabled;}

  async function qzConnect(){
    await loadQZ();
    if(!qz.websocket.isActive())await qz.websocket.connect();
  }

  async function kickViaQZ(){
    try{
      await qzConnect();
      var c=cfg();
      var name=(c.qzPrinter||'').trim()||await qz.printers.getDefault();
      var hex=(c.drawerKickHex||'1B7000191E').replace(/\s+/g,'');
      await qz.print(qz.configs.create(name),[{type:'raw',format:'command',flavor:'hex',data:hex}]);
      toast('Cash drawer opened','💰','t-g');
    }catch(e){
      toast('Drawer failed: '+(e&&e.message?e.message:e)+' (is QZ Tray running?)','❌','t-r');
    }
  }

  // 1) Drawer buttons everywhere (till button, after-sale button, Settings test)
  var origKick=Printer.kickDrawer.bind(Printer);
  Printer.kickDrawer=function(){
    if(qzOn())return kickViaQZ();
    return origKick();
  };

  // 2) Auto-open on cash / split sales when "enable cash drawer kick" is on
  if(typeof window.completeCharge==='function'){
    var origCharge=window.completeCharge;
    window.completeCharge=function(){
      var before=DB.get('txns').length;
      var pm=S.cartPM;
      var r=origCharge.apply(this,arguments);
      var sold=DB.get('txns').length>before;
      var c=cfg();
      // original already kicks in USB Serial mode, so only add it for other modes
      if(sold&&qzOn()&&c.drawerKickEnabled&&c.printerMode!=='serial'&&(pm==='cash'||pm==='split'))kickViaQZ();
      return r;
    };
  }

  // 3) Settings card
  function addSettingsCard(){
    var body=document.getElementById('settings-body');
    if(!body||document.getElementById('qz-card'))return;
    var c=cfg();
    var card=document.createElement('div');
    card.className='set-card';card.id='qz-card';
    card.style.cssText='margin-top:12px;border-color:var(--green)';
    card.innerHTML=
      '<div class="set-t" style="color:var(--green)">🗂️ Cash Drawer (QZ Tray)</div>'+
      '<p style="font-size:0.72rem;color:var(--text2);margin-bottom:10px">Opens the drawer from the 🗂️ Drawer button with no receipt. Needs the free <strong>QZ Tray</strong> app running on this PC (qz.io/download).</p>'+
      '<div class="s-row"><span style="font-size:0.77rem">Use QZ Tray for the drawer</span><label class="tog"><input type="checkbox" id="qz-enabled"><span class="tog-sl"></span></label></div>'+
      '<div class="sf" style="margin-top:8px"><label class="sl">Printer name (exactly as in Windows; blank = default printer)</label><input class="si" id="qz-printer" placeholder="e.g. XP-80C"></div>'+
      '<div style="font-size:0.62rem;color:var(--text2);margin-bottom:8px">Kick command comes from the "Drawer kick command" box above. Pin 2 = 1B7000191E, pin 5 = 1B7001191E.</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
        '<button class="btn btn-a" id="qz-save">Save</button>'+
        '<button class="btn btn-o" id="qz-find">🔎 Find printers</button>'+
        '<button class="btn btn-o" id="qz-test">💰 Test drawer</button>'+
      '</div>'+
      '<div id="qz-list" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"></div>';
    body.appendChild(card);
    document.getElementById('qz-enabled').checked=!!c.qzEnabled;
    document.getElementById('qz-printer').value=c.qzPrinter||'';

    document.getElementById('qz-save').onclick=function(){
      var cf=cfg();
      cf.qzEnabled=document.getElementById('qz-enabled').checked;
      cf.qzPrinter=document.getElementById('qz-printer').value.trim();
      DB.set('cfg',cf);
      toast('QZ drawer settings saved','✅','t-g');
    };
    document.getElementById('qz-find').onclick=async function(){
      var list=document.getElementById('qz-list');
      list.textContent='Looking…';
      try{
        await qzConnect();
        var found=await qz.printers.find();
        if(!Array.isArray(found))found=[found];
        list.textContent='';
        found.forEach(function(n){
          var b=document.createElement('button');
          b.className='btn btn-o btn-sm';b.textContent=n;
          b.onclick=function(){document.getElementById('qz-printer').value=n;};
          list.appendChild(b);
        });
        if(!found.length)list.textContent='No printers found.';
      }catch(e){
        list.textContent='';
        toast('QZ Tray not reachable: '+(e&&e.message?e.message:e),'❌','t-r');
      }
    };
    document.getElementById('qz-test').onclick=function(){
      // test with what is typed on screen, even before saving
      var cf=cfg();
      var prevOn=cf.qzEnabled,prevName=cf.qzPrinter;
      cf.qzEnabled=true;cf.qzPrinter=document.getElementById('qz-printer').value.trim();
      kickViaQZ().finally(function(){cf.qzEnabled=prevOn;cf.qzPrinter=prevName;});
    };
  }

  // Re-add the card every time Settings re-renders
  if(typeof window.renderSettings==='function'){
    var origRender=window.renderSettings;
    window.renderSettings=function(){
      var r=origRender.apply(this,arguments);
      addSettingsCard();
      return r;
    };
  }

  // Warm up the library so the first click is fast
  window.addEventListener('load',function(){loadQZ().catch(function(){});});
})();
