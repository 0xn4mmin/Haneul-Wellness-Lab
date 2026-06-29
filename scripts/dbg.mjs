import puppeteer from 'puppeteer-core'
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',defaultViewport:{width:390,height:844,deviceScaleFactor:2},args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--hide-scrollbars']})
const p=(await b.pages())[0]
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
await p.goto('http://localhost:5199/portal',{waitUntil:'networkidle2'});await sleep(2500)
// inspect the metric chip row (Trend)
const info=await p.evaluate(()=>{
  const rows=[...document.querySelectorAll('.hwl-chiprow')]
  return rows.map(r=>{
    const cs=getComputedStyle(r)
    const firstBtn=r.querySelector('button')
    const bcs=firstBtn?getComputedStyle(firstBtn):null
    return {flexWrap:cs.flexWrap, overflowX:cs.overflowX, width:r.clientWidth, scrollW:r.scrollWidth,
      btnText:firstBtn?firstBtn.textContent.trim():null, btnWhiteSpace:bcs?bcs.whiteSpace:null, btnFlex:bcs?bcs.flex:null, btnWidth:firstBtn?firstBtn.getBoundingClientRect().width:null}
  })
})
console.log(JSON.stringify(info,null,2))
// crop the Trend chip row
const el=await p.$('.hwl-chiprow')
