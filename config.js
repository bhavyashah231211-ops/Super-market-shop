// Edit this ONE line after you deploy the function (Supabase > Edge Functions > cbs-biz > copy its URL).
window.CBS_API = 'https://ioqyckeghgjuyabfyibq.supabase.co/functions/v1/cbs-biz';

// Loads plan.js (plan permissions) right after this file. It only does anything on the till page.
(function () {
  try {
    var s = document.currentScript && document.currentScript.src;
    if (s) document.write('<script src="' + s.replace(/config\.js(\?.*)?$/, 'plan.js') + '"><\/script>');
  } catch (e) {}
})();
