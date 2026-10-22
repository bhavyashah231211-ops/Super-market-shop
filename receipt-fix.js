// CBSystem Shop - 80 mm receipt layout + short sale number + scannable Code 128 barcode.
// Load this AFTER the main script in staff/index.html (see instructions).
(function () {
  // ---- 1. Shorter sale number: YYMMDD-NNNN-DEVICE  e.g. 261022-0001-TW ----
  genSaleNumber = function () {
    var ymd = new Date().toLocaleDateString('en-CA').replace(/-/g, '');
    var key = 'cbspro_salenum_' + TEN.biz + '_' + ymd;
    var seq = (parseInt(localStorage.getItem(key) || '0') + 1);
    localStorage.setItem(key, seq);
    return ymd.slice(2) + '-' + String(seq).padStart(4, '0') + '-' + DEVID;
  };

  // ---- 2. Code 128 (subset B) barcode, standard bar-width table ----
  var P = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
    '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
    '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
    '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
    '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
    '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
    '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
    '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
    '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
    '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
    '114131','311141','411131','211412','211214','211232','2331112'];

  Printer.barcodeSVG = function (text) {
    var safe = String(text).replace(/[^\x20-\x7E]/g, '?');
    var codes = [104], sum = 104;
    for (var i = 0; i < safe.length; i++) {
      var v = safe.charCodeAt(i) - 32;
      codes.push(v);
      sum += v * (i + 1);
    }
    codes.push(sum % 103);
    codes.push(106);
    var Q = 6, x = Q, d = '';
    codes.forEach(function (c) {
      var bar = true;
      P[c].split('').forEach(function (ch) {
        var w = +ch;
        if (bar) d += 'M' + x + ' 0h' + w + 'v10h-' + w + 'z';
        x += w;
        bar = !bar;
      });
    });
    var total = x + Q;
    // 0.25 mm per bar unit (2 printer dots at 203 dpi). Shrinks only if an old, long number would not fit.
    var mod = total * 0.25 <= 68 ? 0.25 : Math.max(0.125, Math.floor(68 / total / 0.125) * 0.125);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (total * mod).toFixed(2) + 'mm" height="12mm" viewBox="0 0 ' + total + ' 10" preserveAspectRatio="none" shape-rendering="crispEdges">' +
      '<rect width="' + total + '" height="10" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  };

  // ---- 3. Receipt body sized for 80 mm paper (68 mm wide, centred) ----
  Printer.receiptHTML = function (tx) {
    var cfg = DB.get('cfg');
    var ref = tx.saleNo || tx.id;
    var row = function (a, b, st) {
      return '<div style="display:flex;justify-content:space-between;gap:6px' + (st || '') + '"><span style="flex:1;min-width:0;word-break:break-word">' + a + '</span><span style="white-space:nowrap">' + b + '</span></div>';
    };
    var small = ';font-size:10px;color:#444';
    var vatRate = tx.vatRate != null ? tx.vatRate : cfg.vatRate;
    return '<div style="font-family:\'JetBrains Mono\',monospace;width:68mm;margin:0 auto;font-size:11px;line-height:1.35;color:#000">' +
      (cfg.storeLogo ? '<div style="text-align:center;margin-bottom:6px"><img src="' + cfg.storeLogo + '" style="max-height:60px;max-width:60mm;object-fit:contain"></div>' : '') +
      '<div style="text-align:center;font-weight:700;font-size:14px">' + esc(cfg.storeName || 'CBSystem') + '</div>' +
      (cfg.storeAddr ? '<div style="text-align:center">' + esc(cfg.storeAddr) + '</div>' : '') +
      (cfg.storeTel ? '<div style="text-align:center">' + esc(cfg.storeTel) + '</div>' : '') +
      '<hr style="border:0;border-top:1px dashed #000;margin:5px 0">' +
      tx.items.map(function (c) { return row(esc(c.name) + (c.qty > 1 ? ' x' + c.qty : ''), fmt(c.price * c.qty)); }).join('') +
      '<hr style="border:0;border-top:1px dashed #000;margin:5px 0">' +
      row('Subtotal', fmt(tx.sub)) +
      (tx.promoDisc ? row('Promotion', '-' + fmt(tx.promoDisc)) : '') +
      (tx.manualDisc ? row('Discount', '-' + fmt(tx.manualDisc)) : '') +
      row('TOTAL', fmt(tx.total), ';font-weight:700') +
      (tx.vat != null ? row('incl. VAT (' + vatRate + '%)', fmt(tx.vat), small) : '') +
      row('Paid via', esc(tx.method)) +
      (tx.methodKey === 'split' && tx.splitCash != null ? row('  Cash', fmt(tx.splitCash), small) + row('  Card', fmt(tx.splitCard), small) : '') +
      (tx.methodKey === 'gift' && tx.giftRef ? row('  Gift Card Ref', esc(tx.giftRef), small) : '') +
      (tx.onAccount ? '<div style="text-align:center;color:#c00;font-size:10px;margin-top:4px;font-weight:700">CHARGED TO ACCOUNT - PAYMENT PENDING</div>' : '') +
      (tx.creditNote ? '<div style="font-size:10px;text-align:center">' + esc(tx.creditNote) + '</div>' : '') +
      '<hr style="border:0;border-top:1px dashed #000;margin:5px 0">' +
      (tx.customerName ? '<div style="text-align:center;font-size:10px">' + esc(tx.customerName) + '</div>' : '') +
      '<div style="text-align:center">' + new Date(tx.time).toLocaleString('en-GB') + '</div>' +
      '<div style="text-align:center;margin-top:8px">' + Printer.barcodeSVG(ref) + '</div>' +
      '<div style="text-align:center;font-size:10px;margin-top:2px">Ref: ' + esc(ref) + '</div>' +
      (cfg.receiptFooter ? '<div style="text-align:center;margin-top:4px">' + esc(cfg.receiptFooter) + '</div>' : '') +
      '</div>';
  };

  // ---- 4. Print window set to 80 mm roll paper (USB serial mode is left as it was) ----
  var origPrint = Printer.printReceipt.bind(Printer);
  Printer.printReceipt = async function (txId) {
    if (DB.get('cfg').printerMode === 'serial') return origPrint(txId);
    var tx = DB.get('txns').find(function (t) { return t.id === txId; });
    if (!tx) { toast('Transaction not found', '⚠️', 't-o'); return; }
    var w = window.open('', '_blank', 'width=360,height=640');
    if (!w) { toast('Pop-up blocked - allow pop-ups to print', '⚠️', 't-o'); return; }
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt</title>' +
      '<style>@page{size:80mm auto;margin:0}html,body{margin:0;padding:0;background:#fff}body{width:80mm;padding:3mm 0}svg{display:block;margin:0 auto}</style></head>' +
      '<body onload="window.print()" onafterprint="window.close()">' + Printer.receiptHTML(tx) + '</body></html>');
    w.document.close();
  };
})();
