;(()=>{
  const $=q=>document.querySelector(q)
  const scoreEl=$("#score")
  const linesEl=$("#lines")
  const levelEl=$("#level")
  const stage=$("#stage")
  const ctx=stage.getContext("2d")
  const overlay=$("#overlay")
  const stateText=$("#stateText")
  const btnStart=$("#btnStart")
  const btnResume=$("#btnResume")
  const btnRestart=$("#btnRestart")
  const btnLeft=$("#btnLeft")
  const btnRight=$("#btnRight")
  const btnDown=$("#btnDown")
  const btnRotate=$("#btnRotate")
  const btnDrop=$("#btnDrop")
  const btnPause=$("#btnPause")
  const modal=$("#modal")
  const modalScore=$("#modalScore")
  const usernameInput=$("#usernameInput")
  const btnSave=$("#btnSave")
  const btnCancel=$("#btnCancel")
  const leaderboard=$("#leaderboard")
  const btnShare=$("#btnShare")
  const btnClear=$("#btnClear")
  const toast=$("#toast")
  const nextCanvas=$("#nextCanvas")
  const nctx=nextCanvas?nextCanvas.getContext("2d"):null

  let W=stage.clientWidth
  let H=stage.clientHeight
  stage.width=W*2
  stage.height=H*2
  ctx.scale(2,2)

  const COLS=10,ROWS=20
  let cell=Math.floor(Math.min(W*0.9/COLS,H*0.95/ROWS))
  let ox=Math.floor((W-COLS*cell)/2)
  let oy=Math.floor((H-ROWS*cell)/2)

  const shapes={
    I:[[1,1,1,1]],
    J:[[1,0,0],[1,1,1]],
    L:[[0,0,1],[1,1,1]],
    O:[[1,1],[1,1]],
    S:[[0,1,1],[1,1,0]],
    T:[[0,1,0],[1,1,1]],
    Z:[[1,1,0],[0,1,1]]
  }
  const keys=Object.keys(shapes)
  const palette=["#00f0ff","#ff00e6","#7dff00","#ffd800","#ff3d00","#c084fc","#22d3ee"]

  const bag=()=>{
    let a=keys.slice()
    for(let i=a.length-1;i>0;i--){const j=0|Math.random()*(i+1);[a[i],a[j]]=[a[j],a[i]]}
    return a
  }
  let seq=[]
  const nextPiece=()=>{
    if(seq.length===0) seq=bag()
    const k=seq.pop()
    return {k,shape:shapes[k].map(r=>r.slice()),x:Math.floor((COLS-2)/2),y:0,color:palette[keys.indexOf(k)%palette.length]}
  }
  const drawFromBag=()=>nextPiece()
  const rotate=m=>{
    const h=m.length,w=m[0].length
    const r=Array.from({length:w},()=>Array(h).fill(0))
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)r[x][h-1-y]=m[y][x]
    return r
  }

  let board,active,nextQ,selectedIdx,selAnim,holdClear,score,lines,level,dropMs,accMs,alive,paused,animating,clearInfo,softDropTick

  let actx,master
  const ensureAudio=async()=>{
    try{
      if(!actx) {
        actx=new (window.AudioContext||window.webkitAudioContext)()
        master=actx.createGain()
        master.gain.value=0.12
        master.connect(actx.destination)
      }
      if(actx.state==="suspended") await actx.resume()
    }catch(e){}
  }
  const tone=(f,d,type="sine",v=1)=>{
    if(!actx) return
    const o=actx.createOscillator()
    const g=actx.createGain()
    o.type=type;o.frequency.value=f
    g.gain.value=0.0001
    o.connect(g);g.connect(master)
    const t=actx.currentTime
    g.gain.linearRampToValueAtTime(0.12*v,t+0.01)
    g.gain.exponentialRampToValueAtTime(0.0001,t+d)
    o.start(t);o.stop(t+d+0.02)
  }
  const playSound=async(name)=>{
    await ensureAudio()
    if(!actx) return
    if(name==="move") tone(220,0.04,"square",0.6)
    else if(name==="rotate") tone(360,0.08,"triangle",0.9)
    else if(name==="drop") tone(130,0.12,"sawtooth",1.0)
    else if(name==="select") tone(520,0.06,"sine",0.8)
    else if(name==="clear"){ tone(400,0.06,"triangle",0.9); setTimeout(()=>tone(600,0.06,"triangle",0.9),50) }
    else if(name==="over"){ tone(440,0.18,"sawtooth",0.9); setTimeout(()=>tone(220,0.22,"sawtooth",0.9),120) }
  }

  const reset=()=>{
    board=Array.from({length:ROWS},()=>Array(COLS).fill(null))
    active=drawFromBag()
    nextQ=[drawFromBag(),drawFromBag()]
    selectedIdx=0; selAnim=0
    score=0;lines=0;level=1
    dropMs=700;accMs=0;alive=true;paused=true;animating=false;clearInfo=null;softDropTick=0
    updateHUD()
    overlay.classList.remove("hidden")
    stateText.textContent="Tap To Start"
    btnResume.style.display="none"
    btnRestart.style.display="none"
    btnStart.style.display="inline-block"
    draw()
  }

  const updateHUD=()=>{
    scoreEl.textContent=score
    linesEl.textContent=lines
    levelEl.textContent=level
  }

  const collide=(m,px,py)=>{
    for(let y=0;y<m.length;y++){
      for(let x=0;x<m[0].length;x++){
        if(!m[y][x]) continue
        const nx=px+x,ny=py+y
        if(nx<0||nx>=COLS||ny>=ROWS) return true
        if(ny>=0&&board[ny][nx]) return true
      }
    }
    return false
  }

  const merge=()=>{
    const m=active.shape
    for(let y=0;y<m.length;y++){
      for(let x=0;x<m[0].length;x++){
        if(m[y][x]){
          const nx=active.x+x,ny=active.y+y
          if(ny>=0) board[ny][nx]={c:active.color,t:Date.now()}
        }
      }
    }
  }

  const clearLines=()=>{
    const full=[]
    for(let y=0;y<ROWS;y++){
      let ok=true
      for(let x=0;x<COLS;x++){ if(!board[y][x]){ok=false;break} }
      if(ok) full.push(y)
    }
    if(full.length){
      animating=true
      clearInfo={lines:full,start:performance.now(),duration:420}
      const p=[0,100,300,500,800][full.length]||0
      score+=p*level
      lines+=full.length
      level=1+Math.floor(lines/10)
      dropMs=Math.max(90,700-((level-1)*40))
      updateHUD()
      setTimeout(()=>{
        for(const ly of full){
          for(let y=ly;y>0;y--) board[y]=board[y-1].slice()
          board[0]=Array(COLS).fill(null)
        }
        animating=false
      },clearInfo.duration)
    }
  }

  const spawn=()=>{
    if(!nextQ||nextQ.length<2){ nextQ=[drawFromBag(),drawFromBag()] }
    active=nextQ[selectedIdx]
    nextQ.splice(selectedIdx,1)
    nextQ.push(drawFromBag())
    if(selectedIdx>=nextQ.length) selectedIdx=nextQ.length-1
    active.x=Math.floor((COLS-active.shape[0].length)/2)
    active.y=-1
    if(collide(active.shape,active.x,active.y+1)){
      gameOver()
    }
  }

  const hardDrop=()=>{
    let dist=0
    while(!collide(active.shape,active.x,active.y+1)){active.y++;dist++}
    score+=dist*2
    lock()
  }

  const softDrop=()=>{
    if(!collide(active.shape,active.x,active.y+1)){active.y++;score+=1;softDropTick=performance.now()}
    else lock()
  }

  const lock=()=>{
    merge()
    clearLines()
    spawn()
    updateHUD()
  }

  const tick=(dt)=>{
    if(!alive||paused||animating) return
    accMs+=dt
    if(accMs>=dropMs){accMs=0; if(!collide(active.shape,active.x,active.y+1)) active.y++; else lock()}
  }

  const drawCell=(x,y,color,glow=0)=>{
    const px=ox+x*cell
    const py=oy+y*cell
    const r=Math.floor(cell*0.18)
    const g=ctx.createLinearGradient(px,py,px,py+cell)
    g.addColorStop(0,color)
    g.addColorStop(1,"#0e1320")
    ctx.fillStyle=g
    ctx.beginPath()
    ctx.moveTo(px+r,py)
    ctx.arcTo(px+cell,py,px+cell,py+cell,r)
    ctx.arcTo(px+cell,py+cell,px,py+cell,r)
    ctx.arcTo(px,py+cell,px,py,r)
    ctx.arcTo(px,py,px+cell,py,r)
    ctx.closePath()
    ctx.fill()
    if(glow>0){
      ctx.save()
      ctx.shadowBlur=glow
      ctx.shadowColor=color
      ctx.strokeStyle=color
      ctx.lineWidth=2
      ctx.stroke()
      ctx.restore()
    }
  }

  const drawGrid=()=>{
    ctx.clearRect(0,0,W,H)
    ctx.globalAlpha=0.5
    ctx.strokeStyle="rgba(0,234,255,.15)"
    ctx.lineWidth=1
    for(let x=0;x<=COLS;x++){
      const px=ox+x*cell
      ctx.beginPath();ctx.moveTo(px,oy);ctx.lineTo(px,oy+ROWS*cell);ctx.stroke()
    }
    for(let y=0;y<=ROWS;y++){
      const py=oy+y*cell
      ctx.beginPath();ctx.moveTo(ox,py);ctx.lineTo(ox+COLS*cell,py);ctx.stroke()
    }
    ctx.globalAlpha=1
  }

  const drawBoard=()=>{
    for(let y=0;y<ROWS;y++){
      for(let x=0;x<COLS;x++){
        const v=board[y][x]
        if(v) drawCell(x,y,v.c,8)
      }
    }
  }

  const drawPiece=()=>{
    const m=active.shape
    for(let y=0;y<m.length;y++){
      for(let x=0;x<m[0].length;x++){
        if(m[y][x]){
          const ny=active.y+y
          if(ny>=0) drawCell(active.x+x,ny,active.color,12)
        }
      }
    }
  }

  const drawClearFx=()=>{
    if(!clearInfo) return
    const t=performance.now()-clearInfo.start
    const p=Math.min(1,t/clearInfo.duration)
    for(const ly of clearInfo.lines){
      const y=ly
      ctx.save()
      const alpha=1-Math.abs(0.5-p)*2
      ctx.globalAlpha=Math.max(0.2,alpha)
      ctx.fillStyle="rgba(255,255,255,0.25)"
      ctx.fillRect(ox,y*cell+oy,cell*COLS,cell)
      const xPos=ox+(COLS*cell)*p
      const grd=ctx.createLinearGradient(xPos-60,0,xPos+60,0)
      grd.addColorStop(0,"rgba(0,234,255,0)")
      grd.addColorStop(0.5,"rgba(0,234,255,0.55)")
      grd.addColorStop(1,"rgba(255,0,230,0)")
      ctx.fillStyle=grd
      ctx.fillRect(ox,y*cell+oy,cell*COLS,cell)
      ctx.restore()
    }
  }

  const draw=()=>{
    drawGrid()
    drawBoard()
    if(active&&alive) drawPiece()
    drawClearFx()
    drawNext()
  }

  let last=performance.now()
  const loop=now=>{
    const dt=now-last;last=now
    tick(dt)
    draw()
    requestAnimationFrame(loop)
  }

  const resize=()=>{
    W=stage.clientWidth;H=stage.clientHeight
    stage.width=W*2;stage.height=H*2;ctx.setTransform(1,0,0,1,0,0);ctx.scale(2,2)
    cell=Math.floor(Math.min(W*0.9/COLS,H*0.95/ROWS))
    ox=Math.floor((W-COLS*cell)/2)
    oy=Math.floor((H-ROWS*cell)/2)
    draw()
  }
  window.addEventListener("resize",resize)
  const resizeNext=()=>{
    if(!nextCanvas) return
    const dpr=window.devicePixelRatio||1
    const w=nextCanvas.clientWidth||96
    const h=nextCanvas.clientHeight||96
    nextCanvas.width=w*dpr
    nextCanvas.height=h*dpr
    nctx.setTransform(dpr,0,0,dpr,0,0)
  }
  window.addEventListener("resize",resizeNext)

  const gameOver=()=>{
    alive=false
    paused=true
    overlay.classList.remove("hidden")
    stateText.textContent="游戏结束"
    btnStart.style.display="none"
    btnResume.style.display="none"
    btnRestart.style.display="inline-block"
    showRecordModal()
  }

  const start=()=>{
    if(!alive){reset()}
    paused=false
    overlay.classList.add("hidden")
  }

  const pause=()=>{
    if(!alive) return
    paused=true
    overlay.classList.remove("hidden")
    stateText.textContent="已暂停"
    btnStart.style.display="none"
    btnResume.style.display="inline-block"
    btnRestart.style.display="inline-block"
  }

  const move=(dx)=>{
    if(paused||animating) return
    if(!collide(active.shape,active.x+dx,active.y)) {active.x+=dx; playSound("move")}
  }
  const rotateAct=()=>{
    if(paused||animating) return
    const r=rotate(active.shape)
    if(!collide(r,active.x,active.y)) {active.shape=r; playSound("rotate")}
    else if(!collide(r,active.x-1,active.y)) {active.x-=1;active.shape=r; playSound("rotate")}
    else if(!collide(r,active.x+1,active.y)) {active.x+=1;active.shape=r; playSound("rotate")}
  }

  const keyMap=e=>{
    const k=e.key
    if(k==="p"||k==="P") {pause();return}
    if(k==="r"||k==="R") {reset();start();return}
    if(paused) return
    if(k==="ArrowLeft") move(-1)
    else if(k==="ArrowRight") move(1)
    else if(k==="ArrowDown") softDrop()
    else if(k==="ArrowUp") rotateAct()
    else if(k===" ") hardDrop()
  }

  document.addEventListener("keydown",keyMap)

  let holdL,holdR,holdD
  const pressHold=(fn,setter)=>{
    fn()
    const id=setInterval(fn,80)
    setter(id)
  }
  const clearHold=id=>{if(id) clearInterval(id)}

  btnLeft.addEventListener("touchstart",e=>{e.preventDefault();pressHold(()=>move(-1),v=>holdL=v)})
  btnLeft.addEventListener("touchend",e=>{e.preventDefault();clearHold(holdL)})
  btnRight.addEventListener("touchstart",e=>{e.preventDefault();pressHold(()=>move(1),v=>holdR=v)})
  btnRight.addEventListener("touchend",e=>{e.preventDefault();clearHold(holdR)})
  btnDown.addEventListener("touchstart",e=>{e.preventDefault();pressHold(()=>softDrop(),v=>holdD=v)})
  btnDown.addEventListener("touchend",e=>{e.preventDefault();clearHold(holdD)})
  btnRotate.addEventListener("click",()=>{rotateAct()})
  btnDrop.addEventListener("click",()=>{hardDrop()})
  btnPause.addEventListener("click",()=>pause())
  btnStart.addEventListener("click",()=>{start();ensureAudio()})
  btnResume.addEventListener("click",()=>{paused=false;overlay.classList.add("hidden")})
  btnRestart.addEventListener("click",()=>{reset();start()})

  const setSelection=i=>{
    const ni=Math.max(0,Math.min(1,i))
    if(ni!==selectedIdx){ selectedIdx=ni; playSound("select") }
  }
  if(nextCanvas){
    const pick=(clientX)=>{
      const rect=nextCanvas.getBoundingClientRect()
      const x=clientX-rect.left
      const w=nextCanvas.clientWidth||128
      const slotW=Math.floor(w/2)
      const idx=Math.max(0,Math.min(1,Math.floor(x/slotW)))
      setSelection(idx)
    }
    nextCanvas.addEventListener("click",e=>{ pick(e.clientX) })
    nextCanvas.addEventListener("touchend",e=>{ if(!e.changedTouches||!e.changedTouches.length) return; pick(e.changedTouches[0].clientX) })
  }

  const showToast=txt=>{
    toast.textContent=txt
    toast.classList.remove("hidden")
    setTimeout(()=>toast.classList.add("hidden"),1600)
  }

  const storageKey="tetris_records_v1"
  const nameKey="tetris_username_v1"
  const getRecords=()=>{
    try{const s=localStorage.getItem(storageKey);return s?JSON.parse(s):[]}catch(e){return[]}
  }
  const setRecords=arr=>{
    localStorage.setItem(storageKey,JSON.stringify(arr))
  }
  const renderBoard=()=>{
    const arr=getRecords().slice().sort((a,b)=>b.score-a.score).slice(0,20)
    leaderboard.innerHTML=""
    arr.forEach((r,i)=>{
      const li=document.createElement("li")
      const d=new Date(r.ts)
      li.textContent=`#${i+1} ${r.name}  分:${r.score}  行:${r.lines}  ${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0,5)}`
      leaderboard.appendChild(li)
    })
  }

  const showRecordModal=()=>{
    modalScore.textContent=score
    usernameInput.value=localStorage.getItem(nameKey)||""
    modal.classList.remove("hidden")
  }
  const hideRecordModal=()=>modal.classList.add("hidden")

  btnSave.addEventListener("click",()=>{
    const name=(usernameInput.value||"玩家").trim().slice(0,16)
    localStorage.setItem(nameKey,name)
    const arr=getRecords()
    arr.push({name,score,lines,ts:Date.now()})
    setRecords(arr)
    renderBoard()
    hideRecordModal()
  })
  btnCancel.addEventListener("click",()=>{hideRecordModal()})
  btnClear.addEventListener("click",()=>{
    localStorage.removeItem(storageKey)
    renderBoard()
    showToast("已清空记录")
  })

  btnShare.addEventListener("click",async()=>{
    const name=localStorage.getItem(nameKey)||"我"
    const top=(getRecords().slice().sort((a,b)=>b.score-a.score)[0])||{score:score||0,lines:lines||0}
    const txt=`${name}在赛博俄罗斯方块拿下${top.score}分 ${top.lines}行，来挑战！`
    const url=location.href
    try{
      if(navigator.share){
        await navigator.share({title:"赛博俄罗斯方块",text:txt,url})
        return
      }
    }catch(e){}
    try{
      await navigator.clipboard.writeText(`${txt} ${url}`)
      showToast("已复制分享文案")
    }catch(e){
      showToast("分享不支持")
    }
  })

  let raf=requestAnimationFrame(loop)

  reset()
  start()
  renderBoard()
  resizeNext()

  document.addEventListener("keydown",e=>{
    if(e.key==="1") setSelection(0)
    else if(e.key==="2") setSelection(1)
  })

  function drawNext(){
    if(!nextCanvas||!nctx) return
    const w=nextCanvas.clientWidth||128
    const h=nextCanvas.clientHeight||72
    nctx.clearRect(0,0,w,h)
    if(!nextQ||nextQ.length<2) return
    selAnim = selAnim + (selectedIdx - selAnim)*0.2
    const slots=2
    const slotW=Math.floor(w/slots)
    const slotH=h
    // selection glow bar
    const sx=selAnim*slotW
    nctx.save()
    nctx.globalAlpha=0.8
    const grd=nctx.createLinearGradient(sx,0,sx+slotW,0)
    grd.addColorStop(0,"rgba(0,234,255,0.10)")
    grd.addColorStop(0.5,"rgba(255,0,230,0.25)")
    grd.addColorStop(1,"rgba(0,234,255,0.10)")
    nctx.fillStyle=grd
    nctx.fillRect(sx+4,4,slotW-8,slotH-8)
    nctx.restore()
    for(let i=0;i<slots;i++){
      const item=nextQ[i]
      if(!item) continue
      const m=item.shape
      const cw=Math.floor(Math.min((slotW-16)/4,(slotH-16)/4))
      const mw=m[0].length,mh=m.length
      const nx=i*slotW + Math.floor((slotW - cw*mw)/2)
      const ny=Math.floor((slotH - cw*mh)/2)
      for(let y=0;y<mh;y++){
        for(let x=0;x<mw;x++){
          if(!m[y][x]) continue
          const px=nx+x*cw
          const py=ny+y*cw
          const r=Math.floor(cw*0.22)
          const g=nctx.createLinearGradient(px,py,px,py+cw)
          g.addColorStop(0,item.color)
          g.addColorStop(1,"#0e1320")
          nctx.fillStyle=g
          nctx.beginPath()
          nctx.moveTo(px+r,py)
          nctx.arcTo(px+cw,py,px+cw,py+cw,r)
          nctx.arcTo(px+cw,py+cw,px,py+cw,r)
          nctx.arcTo(px,py+cw,px,py,r)
          nctx.arcTo(px,py,px+cw,py,r)
          nctx.closePath()
          nctx.fill()
        }
      }
    }
  }
})();
