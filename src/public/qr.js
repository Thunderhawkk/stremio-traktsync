// public/qr.js - tiny local encoder for short ASCII URLs (visual QR-like matrix)
(function(){
  function encodeASCII(s){
    if (s.length > 120) s = s.slice(0, 120); // safety
    const n = 29; // approx fixed matrix size
    const m = Array.from({length:n},()=>Array(n).fill(false));
    const box = (x,y) => { for(let i=0;i<7;i++)for(let j=0;j<7;j++) if(i===0||j===0||i===6||j===6||(i>1&&i<5&&j>1&&j<5)) m[y+j][x+i]=true; };
    box(0,0); box(n-7,0); box(0,n-7);
    let h=0; for(const ch of s){ h=(h*131+ch.charCodeAt(0))>>>0; }
    let k=0;
    for(let y=8;y<n-8;y++){
      for(let x=8;x<n-8;x++){
        if(((x*y+h+k)&7)===0) m[y][x]=true;
        k++;
      }
    }
    return m;
  }
  window.SimpleQR = { encode: encodeASCII };
})();
