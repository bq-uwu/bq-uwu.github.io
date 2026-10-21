(function(){
  "use strict";

  var PALETTE = [
    { bg:'#e9f9f1', fg:'#2f9e6e', border:'#b8e8d2' },
    { bg:'#ffe4ef', fg:'#e04a7e', border:'#ffc3d9' },
    { bg:'#fff3d6', fg:'#c98a00', border:'#ffe0a3' },
    { bg:'#eceaf2', fg:'#8a8298', border:'#d9d4e4' },
    { bg:'#e2eeff', fg:'#3a72c4', border:'#bcd6ff' },
    { bg:'#f3e8ff', fg:'#8b5cf6', border:'#ddd0f7' },
    { bg:'#ffe8e3', fg:'#d9534f', border:'#ffc9c0' },
    { bg:'#e6f7f8', fg:'#2a9d8f', border:'#c2eae6' }
  ];

  var runtimeDetails = {};   /* 单主/备注，只存在内存 */
  var currentData = null;    /* 当前页面正在编辑的数据 */
  var fileHandle = null;     /* File System Access API 句柄 */

  function $(id){ return document.getElementById(id); }
  function pad(n){ return n<10?'0'+n:''+n; }
  function txt(el){ return el ? el.innerText.replace(/\u00a0/g,' ').trim() : ''; }

  function ph(text,w,h,c1,c2){
    var svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'">'+
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'+
      '<stop offset="0" stop-color="'+(c1||'#ffe0ee')+'"/><stop offset="1" stop-color="'+(c2||'#e0e6ff')+'"/>'+
      '</linearGradient></defs><rect width="'+w+'" height="'+h+'" fill="url(#g)"/>'+
      '<circle cx="'+(w*.5)+'" cy="'+(h*.44)+'" r="'+(Math.min(w,h)*.12)+'" fill="#fff" fill-opacity=".55"/>'+
      '<text x="'+(w*.5)+'" y="'+(h*.76)+'" font-family="sans-serif" font-size="'+(Math.min(w,h)*.07)+
      '" font-weight="bold" fill="#fff" fill-opacity=".9" text-anchor="middle">'+text+'</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }

  function getData(){
    var d = window.SITE_DATA ? JSON.parse(JSON.stringify(window.SITE_DATA)) : {};
    if(d.commission && d.commission.details){
      runtimeDetails = d.commission.details;
      delete d.commission.details;
    }
    return d;
  }

  function getDetails(){ return runtimeDetails; }

  function parseDetail(str){
    var c='', n='';
    if(!str) return {client:'',note:''};
    var m1 = str.match(/单主[：:]\s*([^；;]*)/);
    if(m1) c = m1[1].trim();
    var m2 = str.match(/备注[：:]\s*([^；;]*)/);
    if(m2) n = m2[1].trim();
    return {client:c, note:n};
  }

  function setDetail(key, client, note){
    var parts = [];
    if(client) parts.push('单主：'+client);
    if(note) parts.push('备注：'+note);
    if(parts.length) runtimeDetails[key] = parts.join('；');
    else delete runtimeDetails[key];
  }

  /* 标记有修改，显示保存按钮 */
  function markDirty(d){
    currentData = d;
    var btn = $('saveDataBtn');
    if(btn) btn.style.display = 'flex';
  }

  /* 保存到 data.js */
  async function saveToData(){
    if(!currentData) return;
    var data = JSON.parse(JSON.stringify(currentData));
    if(data.commission) delete data.commission.details;

    var content = '/* 自动生成的 data.js。保存后请覆盖原文件。 */\n' +
      'window.SITE_DATA = ' + JSON.stringify(data, null, 2) + ';\n';

    /* 优先使用 File System Access API */
    if(window.showSaveFilePicker){
      try{
        if(!fileHandle){
          fileHandle = await window.showSaveFilePicker({
            suggestedName: 'data.js',
            types: [{ description:'JavaScript', accept: {'text/javascript': ['.js']} }]
          });
        }
        var perm = await fileHandle.queryPermission({mode:'readwrite'});
        if(perm !== 'granted') perm = await fileHandle.requestPermission({mode:'readwrite'});
        if(perm === 'granted'){
          var w = await fileHandle.createWritable();
          await w.write(content);
          await w.close();
          var btn = $('saveDataBtn');
          if(btn) btn.style.display = 'none';
          showBadge('已保存到 data.js');
          return true;
        }
      }catch(e){
        console.warn('写入文件失败：', e);
      }
    }

    /* 兜底：下载 */
    var blob = new Blob([content], {type:'text/javascript'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    var btn2 = $('saveDataBtn');
    if(btn2) btn2.style.display = 'none';
    showBadge('已下载 data.js');
    return true;
  }

  function showBadge(msg){
    var b = $('saveBadge');
    if(!b) return;
    b.textContent = msg || '已自动保存';
    b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(function(){ b.classList.remove('show'); }, 2200);
  }

  function initEditable(d){
    CS.editable = d.editable === 't';
    if(!CS.editable){
      document.body.classList.add('readonly');
      document.querySelectorAll('[contenteditable]').forEach(function(el){
        el.removeAttribute('contenteditable');
      });
    }
  }

  function initNav(){
    var page = document.body.getAttribute('data-page');
    document.querySelectorAll('.nav a').forEach(function(a){
      if(a.getAttribute('data-page') === page) a.classList.add('active');
    });
  }

  function initSaveButton(){
    var btn = $('saveDataBtn');
    if(btn) btn.onclick = function(){ saveToData(); };
  }

  /* 图片选择 + 裁剪 */
  function pickFile(){
    return new Promise(function(res){
      var input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.style.position = 'fixed'; input.style.left = '-9999px';
      document.body.appendChild(input);
      var done = false;
      function fin(v){
        if(done) return; done = true;
        if(input.parentNode) input.parentNode.removeChild(input);
        res(v);
      }
      input.addEventListener('change', function(){
        var f = input.files && input.files[0];
        if(!f) return fin(null);
        var r = new FileReader();
        r.onload = function(){ fin(r.result); };
        r.onerror = function(){ fin(null); };
        r.readAsDataURL(f);
      });
      window.addEventListener('focus', function onf(){
        setTimeout(function(){
          if(!done && (!input.files || !input.files.length)){
            window.removeEventListener('focus', onf);
            fin(null);
          }
        }, 450);
      });
      input.click();
    });
  }

  function openCropper(src, opt){
    var aspect = opt.aspect, outW = opt.outW, outH = opt.outH, quality = opt.quality || 0.85;
    return new Promise(function(resolve){
      var ov = document.createElement('div'); ov.className = 'overlay';
      var panel = document.createElement('div'); panel.className = 'panel';
      panel.innerHTML = '<div class="panel-head"><span>选择展示区域</span><span class="hint">拖动 · 滚轮缩放</span></div>';
      var stage = document.createElement('div'); stage.className = 'cr-stage';
      var vp = document.createElement('div'); vp.className = 'cr-viewport';
      var im = document.createElement('img'); im.draggable = false;
      var grid = document.createElement('div'); grid.className = 'cr-grid';
      vp.appendChild(im); vp.appendChild(grid); stage.appendChild(vp); panel.appendChild(stage);

      var tools = document.createElement('div'); tools.className = 'cr-tools';
      var zo = document.createElement('button'); zo.type='button'; zo.className='cr-zoom'; zo.textContent='−';
      var range = document.createElement('input'); range.type='range'; range.className='cr-range'; range.min='0'; range.max='100'; range.value='0';
      var zi = document.createElement('button'); zi.type='button'; zi.className='cr-zoom'; zi.textContent='＋';
      tools.appendChild(zo); tools.appendChild(range); tools.appendChild(zi); panel.appendChild(tools);

      var foot = document.createElement('div'); foot.className = 'panel-foot';
      var cancel = document.createElement('button'); cancel.type='button'; cancel.className='p-btn ghost'; cancel.textContent='取消';
      var ok = document.createElement('button'); ok.type='button'; ok.className='p-btn primary'; ok.textContent='确定';
      foot.appendChild(cancel); foot.appendChild(ok); panel.appendChild(foot);
      ov.appendChild(panel); document.body.appendChild(ov);

      var done = false;
      function fin(v){
        if(done) return; done = true;
        if(ov.parentNode) ov.parentNode.removeChild(ov);
        resolve(v || '');
      }
      cancel.onclick = function(){ fin(''); };
      ov.addEventListener('mousedown', function(e){ if(e.target === ov) fin(''); });

      var maxSide = Math.min(330, Math.max(180, window.innerWidth - 100));
      var maxH = Math.min(300, Math.max(160, window.innerHeight - 340));
      var vw, vh;
      if(aspect >= maxSide/maxH){ vw = maxSide; vh = vw/aspect; }
      else { vh = maxH; vw = vh*aspect; }
      if(vh > maxH){ vh = maxH; vw = vh*aspect; }
      vw = Math.round(vw); vh = Math.round(vh);
      vp.style.width = vw + 'px'; vp.style.height = vh + 'px';

      var IW=0, IH=0, s=1, sMin=1, tx=0, ty=0, ready=false;
      function clamp(){ var w=IW*s, h=IH*s; tx=Math.min(0,Math.max(vw-w,tx)); ty=Math.min(0,Math.max(vh-h,ty)); }
      function draw(){ im.style.width=(IW*s)+'px'; im.style.height=(IH*s)+'px'; im.style.left=tx+'px'; im.style.top=ty+'px'; }
      function fit(){ sMin=Math.max(vw/IW,vh/IH); s=sMin; tx=(vw-IW*s)/2; ty=(vh-IH*s)/2; clamp(); draw(); range.value='0'; }
      function setScale(ns){
        if(!ready) return;
        var maxS = sMin*5;
        ns = Math.max(sMin, Math.min(maxS, ns));
        var cx=vw/2, cy=vh/2;
        var ix=(cx-tx)/s, iy=(cy-ty)/s;
        s=ns; tx=cx-ix*s; ty=cy-iy*s;
        clamp(); draw();
        range.value = String(Math.round((s/sMin-1)/4*100));
      }

      im.onload = function(){ IW=im.naturalWidth||1; IH=im.naturalHeight||1; ready=true; fit(); };
      im.onerror = function(){ fin(''); };
      im.src = src;

      var drag=false, px0=0, py0=0, tx0=0, ty0=0;
      vp.addEventListener('pointerdown', function(e){
        if(!ready) return;
        drag=true; px0=e.clientX; py0=e.clientY; tx0=tx; ty0=ty;
        try{ vp.setPointerCapture(e.pointerId); }catch(err){}
      });
      vp.addEventListener('pointermove', function(e){
        if(!drag || !ready) return;
        tx = tx0+(e.clientX-px0); ty = ty0+(e.clientY-py0);
        clamp(); draw();
      });
      vp.addEventListener('pointerup', function(e){
        drag=false;
        try{ vp.releasePointerCapture(e.pointerId); }catch(err){}
      });
      vp.addEventListener('pointercancel', function(){ drag=false; });
      vp.addEventListener('wheel', function(e){
        if(!ready) return;
        e.preventDefault();
        setScale(s*(1-e.deltaY*0.0016));
      }, {passive:false});
      range.addEventListener('input', function(){
        if(!ready) return;
        setScale(sMin*(1+Number(range.value)/100*4));
      });
      zi.onclick = function(){ setScale(s*1.25); };
      zo.onclick = function(){ setScale(s/1.25); };

      ok.onclick = function(){
        if(!ready){ fin(''); return; }
        try{
          var c = document.createElement('canvas');
          c.width = outW; c.height = outH;
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0,0,outW,outH);
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(im, -tx/s, -ty/s, vw/s, vh/s, 0, 0, outW, outH);
          fin(c.toDataURL('image/jpeg', quality));
        }catch(err){ fin(''); }
      };
    });
  }

  function pickAndCrop(rule){
    if(!CS.editable) return Promise.resolve('');
    return pickFile().then(function(d){ return d ? openCropper(d, rule) : ''; });
  }

  /* 图片查看器（带替换/删除） */
  function openViewer(images, startIndex, opts){
    opts = opts || {};
    var current = startIndex || 0;
    var ov = document.createElement('div');
    ov.className = 'viewer-overlay';
    ov.innerHTML =
      '<button class="viewer-close" type="button">×</button>' +
      '<div class="viewer-img-wrap">' +
        '<button class="viewer-nav prev" type="button">‹</button>' +
        '<img class="viewer-img" alt="">' +
        '<button class="viewer-nav next" type="button">›</button>' +
      '</div>' +
      '<div class="viewer-count"></div>' +
      '<div class="viewer-foot"></div>';
    document.body.appendChild(ov);

    var img = ov.querySelector('.viewer-img');
    var count = ov.querySelector('.viewer-count');
    var prev = ov.querySelector('.viewer-nav.prev');
    var next = ov.querySelector('.viewer-nav.next');
    var foot = ov.querySelector('.viewer-foot');

    function render(){
      if(!images.length){ close(); return; }
      if(current < 0) current = 0;
      if(current >= images.length) current = images.length-1;
      img.src = images[current];
      count.textContent = (current+1) + ' / ' + images.length;
      prev.style.visibility = images.length > 1 ? 'visible' : 'hidden';
      next.style.visibility = images.length > 1 ? 'visible' : 'hidden';

      foot.innerHTML = '';
      if(opts.editable){
        var replace = document.createElement('button');
        replace.type = 'button';
        replace.className = 'viewer-btn primary';
        replace.textContent = '替换这张';
        replace.onclick = function(){
          pickAndCrop(opts.cropRule || {aspect:4/3,outW:600,outH:450,quality:.84}).then(function(data){
            if(!data) return;
            images[current] = data;
            if(opts.onChange) opts.onChange(images);
            img.src = data;
          });
        };
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'viewer-btn danger';
        del.textContent = '删除这张';
        del.onclick = function(){
          images.splice(current, 1);
          if(opts.onChange) opts.onChange(images);
          if(!images.length){ close(); return; }
          if(current >= images.length) current = images.length-1;
          render();
        };
        foot.appendChild(replace);
        foot.appendChild(del);
      }
    }
    function close(){
      if(ov.parentNode) ov.parentNode.removeChild(ov);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e){
      if(e.key === 'Escape') close();
      if(e.key === 'ArrowLeft' && images.length > 1){ current = (current-1+images.length)%images.length; render(); }
      if(e.key === 'ArrowRight' && images.length > 1){ current = (current+1)%images.length; render(); }
    }
    ov.querySelector('.viewer-close').onclick = close;
    ov.addEventListener('mousedown', function(e){ if(e.target === ov) close(); });
    prev.onclick = function(){ if(images.length<2) return; current = (current-1+images.length)%images.length; render(); };
    next.onclick = function(){ if(images.length<2) return; current = (current+1)%images.length; render(); };
    document.addEventListener('keydown', onKey);

    render();
  }

  window.CS = {
    $: $, pad: pad, txt: txt, ph: ph,
    PALETTE: PALETTE,
    getData: getData,
    getDetails: getDetails,
    parseDetail: parseDetail,
    setDetail: setDetail,
    markDirty: markDirty,
    saveToData: saveToData,
    initEditable: initEditable,
    initNav: initNav,
    initSaveButton: initSaveButton,
    pickAndCrop: pickAndCrop,
    openViewer: openViewer,
    editable: false
  };
})();