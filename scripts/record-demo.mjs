// Drives the app through every feature in headless Chrome (software WebGL so
// the three.js scenes render) and records via CDP screencast — frames stream
// from the compositor, ack-driven, so capture never blocks the render loops.
import puppeteer from 'puppeteer-core'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:5173'
const FRAMES = '/tmp/hwl-frames'
const W = 1440, H = 900

rmSync(FRAMES, { recursive: true, force: true })
mkdirSync(FRAMES, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 120000,
  defaultViewport: { width: W, height: H },
  args: [
    `--window-size=${W},${H + 120}`, '--force-color-profile=srgb', '--hide-scrollbars',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl',
  ],
})
const page = (await browser.pages())[0]
await page.setViewport({ width: W, height: H })

// ---- CDP screencast recorder ----
const client = await page.createCDPSession()
const frames = [] // { ts }
let idx = 0
client.on('Page.screencastFrame', (evt) => {
  const { data, metadata, sessionId } = evt
  const ts = metadata.timestamp || Date.now() / 1000
  writeFileSync(`${FRAMES}/f${String(idx).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'))
  frames.push({ ts })
  idx++
  client.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})

// ---- helpers ----
const clickText = async (text, tag = '*') => {
  const handle = await page.evaluateHandle((text, tag) => {
    const els = [...document.querySelectorAll(tag === '*' ? '*' : tag)]
    return els.reverse().find((e) => e.children.length <= 3 && e.textContent.trim() === text) ||
      els.find((e) => e.textContent.trim().includes(text))
  }, text, tag)
  const el = handle.asElement()
  if (el) { await el.click() }
  return !!el
}
const hold = (ms) => sleep(ms)

async function startCast() {
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 78, everyNthFrame: 1, maxWidth: W, maxHeight: H })
}

try {
  // ============ INTRO ============
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' })
  await startCast()
  await hold(1200)
  for (let i = 0; i <= 20; i++) { await page.mouse.move(300 + i * 40, 420 + Math.sin(i / 2) * 120); await hold(70) }
  await hold(800)

  // ============ PORTAL — login ============
  await page.goto(`${BASE}/portal`, { waitUntil: 'networkidle2' })
  await startCast() // restart cast after navigation
  await hold(1000)
  const email = await page.$('input[placeholder="이메일"]')
  if (email) { await email.click(); await page.keyboard.type('jiwoo@haneul.lab', { delay: 45 }) }
  const pw = await page.$('input[placeholder="비밀번호"]')
  if (pw) { await pw.click(); await page.keyboard.type('demo1234', { delay: 45 }) }
  await hold(500)
  await clickText('로그인', 'button')
  await hold(1500)

  // ============ HEALTH DASHBOARD ============
  for (const m of ['체지방률', '체중', '인바디']) { await clickText(m, 'button'); await hold(900) }
  const hitCircles = await page.$$('svg circle[r="17"]')
  if (hitCircles[3]) { await hitCircles[3].hover(); await hold(1100) }
  if (hitCircles[5]) { await hitCircles[5].hover(); await hold(1100) }

  for (const seg of ['오른다리', '몸통', '왼팔']) { await clickText(seg, 'button'); await hold(800) }
  const mountBox = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find((d) => d.style.cursor === 'grab')
    if (!el) return null
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  if (mountBox) {
    await page.mouse.move(mountBox.x, mountBox.y); await page.mouse.down()
    for (let i = 0; i < 24; i++) { await page.mouse.move(mountBox.x - i * 6, mountBox.y); await hold(28) }
    await page.mouse.up(); await hold(800)
  }

  await clickText('다시 생성', 'button'); await hold(1000)
  await clickText('다시 생성', 'button'); await hold(1000)

  const privBtns = await page.$$('button[title="공개 설정"]')
  if (privBtns[1]) { await privBtns[1].click(); await hold(700) }
  if (privBtns[1]) { await privBtns[1].click(); await hold(500) }

  await clickText('밸런스는 어떻게 계산되나요?', 'button'); await hold(1100)

  for (let y = 0; y <= 2600; y += 220) { await page.evaluate((y) => window.scrollTo(0, y), y); await hold(150) }
  await hold(400)

  await clickText('결과지 보기', 'span'); await hold(1600)
  await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '×'); x && x.click() })
  await hold(600)
  await page.evaluate(() => window.scrollTo(0, 0)); await hold(600)

  // ============ COMMUNITY ============
  await clickText('커뮤니티', 'button'); await hold(1100)
  await clickText('+ 챌린지 만들기', 'button'); await hold(1000)
  const chTitle = await page.$('input[placeholder="예) 6월 체지방 챌린지"]')
  if (chTitle) { await chTitle.click(); await page.keyboard.type('7월 골격근 챌린지', { delay: 40 }) }
  await hold(900)
  await clickText('취소', 'button'); await hold(700)
  const likeBtn = await page.$$('article button')
  if (likeBtn[0]) { await likeBtn[0].click(); await hold(600) }
  if (likeBtn[1]) { await likeBtn[1].click(); await hold(900) }
  for (let y = 0; y <= 1400; y += 240) { await page.evaluate((y) => window.scrollTo(0, y), y); await hold(170) }
  await page.evaluate(() => window.scrollTo(0, 0)); await hold(500)

  // ============ GROUP CHAT ============
  await clickText('그룹 채팅', 'button'); await hold(1100)
  const msg = await page.$('input[placeholder="메시지를 입력하세요…"]')
  if (msg) { await msg.click(); await page.keyboard.type('측정 끝났어요! 골격근 또 늘었네요 💪', { delay: 35 }) }
  await hold(500)
  await page.evaluate(() => { const send = [...document.querySelectorAll('button')].find((b) => b.querySelector('svg path[d^="M4 12l16-7"]')); send && send.click() })
  await hold(1500)

  // ============ MEMBERS ============
  await clickText('멤버', 'button'); await hold(1100)
  await clickText('이민서', 'button'); await hold(1400)
  await page.evaluate(() => window.scrollTo(0, 400)); await hold(900)
  await clickText('‹ 멤버 목록으로', 'button'); await hold(900)
  await page.evaluate(() => window.scrollTo(0, 0)); await hold(400)

  // ============ TRAINER STUDIO ============
  await clickText('트레이너', 'button'); await hold(1300)
  await clickText('조다온', 'button'); await hold(800)
  const note = await page.$('input[placeholder*="피드백을 작성하세요"]')
  if (note) { await note.click(); await page.keyboard.type('이번 주 코어 루틴 아주 좋았어요!', { delay: 30 }) }
  await hold(500)
  await clickText('노트 보내기', 'button'); await hold(1400)

  // back to member view + profile
  await clickText('회원', 'button'); await hold(900)
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('프로필 설정')); b && b.click() })
  await hold(1600)
} catch (e) {
  console.error('walkthrough error:', e)
}

await client.send('Page.stopScreencast').catch(() => {})
await sleep(300)
await browser.close()

// ---- build ffmpeg concat list with real per-frame durations ----
if (frames.length > 1) {
  const lines = []
  for (let i = 0; i < frames.length; i++) {
    const file = `${FRAMES}/f${String(i).padStart(5, '0')}.jpg`
    let dur = i < frames.length - 1 ? frames[i + 1].ts - frames[i].ts : 0.4
    dur = Math.max(0.03, Math.min(1.2, dur))
    lines.push(`file '${file}'`, `duration ${dur.toFixed(3)}`)
  }
  lines.push(`file '${FRAMES}/f${String(frames.length - 1).padStart(5, '0')}.jpg'`)
  writeFileSync(`${FRAMES}/list.txt`, lines.join('\n'))
}
console.log('FRAMES_CAPTURED', frames.length)
