import type { MetricKey } from './portalData'

export type Role = 'trainer' | 'client' | 'me'
export type View = 'health' | 'community' | 'chat' | 'members' | 'trainer' | 'profile'

export interface MetricComment { author: string; initials: string; color: string; role: Role; text: string; time: string }
export interface PostComment { author: string; initials: string; color: string; text: string }
export interface Post {
  id: number; author: string; initials: string; color: string; role: Role; time: string; text: string
  likes: number; liked: boolean; open: boolean; comments: PostComment[]; draft: string
  hasMetric?: boolean; metricVal?: string; metricLabel?: string; metricSub?: string
}
export interface Message { id: number; author: string; initials: string; color: string; role: Role; time: string; text: string }
export interface Member { id: string; name: string; initials: string; color: string; bio: string; bio2: string; score: number; pub: string[] }
export interface Profile { name: string; birth: string; gender: string; phone: string; photo: string | null }

export interface PortalState {
  view: View
  role: 'trainer' | 'client'
  selectedMetric: MetricKey
  selectedSegment: string
  scanOpen: boolean
  hoverIdx: number
  privacy: Record<string, 'public' | 'private'>
  newComment: string
  newPost: string
  newMsg: string
  commentsByMetric: Record<string, MetricComment[]>
  coachFeedback: { author: string; initials: string; color: string; isCoach: boolean; text: string; time: string }[]
  posts: Post[]
  messages: Message[]
  members: Member[]
  memberComments: Record<string, PostComment[]>
  activeMember: string | null
  memberDraft: string
  coachTargetId: string
  coachNote: string
  coachConfirm: string
  cmpFrom: number
  cmpTo: number
  briefIdx: number
  radarHover: number
  showBalInfo: boolean
  authed: boolean
  loginEmail: string
  loginPw: string
  profileSaved: string
  profile: Profile
  showChallengeForm: boolean
  chTitle: string
  chMetric: string
  chGoal: string
  chPeriod: string
  chScope: string
  chDone: string
}

export const initialState: PortalState = {
  view: 'health',
  role: 'client',
  selectedMetric: 'smm',
  selectedSegment: 'trunk',
  scanOpen: false,
  hoverIdx: -1,
  privacy: { score: 'public', weight: 'public', smm: 'public', pbf: 'private', bodyFatMass: 'private', bmi: 'public', visceral: 'private', tbw: 'public' },
  newComment: '',
  newPost: '',
  newMsg: '',
  commentsByMetric: {
    smm: [{ author: '코치 하늘', initials: '하늘', color: '#234B47', role: 'trainer', text: '꾸준히 우상향이에요 — 운동 일관성이 그대로 보입니다. 다음 사이클엔 몸통 근력을 더 끌어올려봐요.', time: '2일 전' }],
    pbf: [{ author: '코치 하늘', initials: '하늘', color: '#234B47', role: 'trainer', text: '1월 대비 6.5%p 줄었어요. 단백질을 체중당 1.6g로 유지하면 이 흐름 그대로 갑니다.', time: '1주 전' }],
  },
  coachFeedback: [
    { author: '코치 하늘', initials: '하늘', color: '#234B47', isCoach: true, text: '6월 측정 종합이에요 — 골격근 우상향, 체지방 안정적입니다. 다음 사이클엔 몸통 근력과 수면 7시간 고정에 집중해봐요.', time: '2일 전' },
    { author: '박지우', initials: '지우', color: '#6E9B8E', isCoach: false, text: '감사합니다 코치님! 수면부터 잡아볼게요.', time: '1일 전' },
  ],
  posts: [
    { id: 1, author: '코치 하늘', initials: '하늘', color: '#234B47', role: 'trainer', time: '3시간 전', text: '측정 팁 하나 드려요 🌿 인바디 당일 아침엔 물을 충분히 마시고, 측정 2시간 전에는 과식을 피해주세요. 같은 조건에서 재야 데이터가 정직해집니다.', likes: 12, liked: false, open: false, comments: [{ author: '조다온', initials: '다온', color: '#C29A4B', text: '저장했어요! 물 마시는 거 항상 까먹네요.' }], draft: '' },
    { id: 2, author: '이민서', initials: '민서', color: '#BE7A57', role: 'client', time: '6시간 전', text: '3개월 차, 드디어 이 과정을 믿게 됐어요. 체지방 한 단계가 통째로 빠졌고 오후에 늘어지던 컨디션이 완전히 달라졌어요.', likes: 24, liked: false, open: false, hasMetric: true, metricVal: '-4.2%', metricLabel: '체지방률', metricSub: '3월 → 6월 · 전체 공개', comments: [{ author: '박지우', initials: '지우', color: '#6E9B8E', text: '진짜 동기부여 돼요, 축하해요!' }, { author: '김아리', initials: '아리', color: '#5E97A0', text: '멋져요 💚' }], draft: '' },
    { id: 3, author: '조다온', initials: '다온', color: '#C29A4B', role: 'client', time: '1일 전', text: '질문 하나! 운동 후에 진짜 든든한 식물성 간식 추천받아요. 오후에 당 떨어지는 거 잡고 싶어요.', likes: 8, liked: false, open: false, comments: [{ author: '이민서', initials: '민서', color: '#BE7A57', text: '풋콩 + 대추 한 알. 진짜 신세계예요.' }], draft: '' },
  ],
  messages: [
    { id: 1, author: '코치 하늘', initials: '하늘', color: '#234B47', role: 'trainer', time: '9:02', text: '좋은 아침이에요, 여러분 🌱 이번 주 측정 주간이에요. 오늘 오시는 분?' },
    { id: 2, author: '이민서', initials: '민서', color: '#BE7A57', role: 'client', time: '9:05', text: '저요! 11시 슬롯이에요. 떨리고 설레요.' },
    { id: 3, author: '조다온', initials: '다온', color: '#C29A4B', role: 'client', time: '9:07', text: '바로 다음 11시 반이요. 가보자고요 💪' },
    { id: 4, author: '박지우', initials: '지우', color: '#6E9B8E', role: 'me', time: '9:12', text: '저는 2시 예약했어요. 코치님, 측정 전에 존2 걷기 하고 갈까요 아니면 건너뛸까요?' },
    { id: 5, author: '코치 하늘', initials: '하늘', color: '#234B47', role: 'trainer', time: '9:14', text: '지우님, 측정 전에는 걷기 건너뛰는 게 좋아요. 수분 수치가 깔끔하게 나오게 측정 후에 하세요 👍' },
    { id: 6, author: '김아리', initials: '아리', color: '#5E97A0', role: 'client', time: '9:20', text: '조용히 보고 있지만 다들 응원해요 💚' },
  ],
  members: [
    { id: 'minseo', name: '이민서', initials: '민서', color: '#BE7A57', bio: '체지방 감량 여정', bio2: '주 4회 트레이닝 · 사이클 러버', score: 88, pub: ['score', 'weight', 'pbf', 'smm'] },
    { id: 'daon', name: '조다온', initials: '다온', color: '#C29A4B', bio: '리컴포지션 · 오픈북', bio2: '입문 3개월 · 식물성 식단', score: 79, pub: ['score', 'weight', 'smm', 'pbf', 'bmi', 'tbw'] },
    { id: 'ari', name: '김아리', initials: '아리', color: '#5E97A0', bio: '대부분 비공개', bio2: '마라토너 · 모빌리티 집중', score: 82, pub: ['score'] },
  ],
  memberComments: {
    minseo: [{ author: '코치 하늘', initials: '하늘', color: '#234B47', text: '교과서 같은 성장이에요, 민서님. 자랑스러워요.' }],
    daon: [], ari: [],
  },
  activeMember: null,
  memberDraft: '',
  coachTargetId: 'minseo',
  coachNote: '',
  coachConfirm: '',
  cmpFrom: 0,
  cmpTo: 5,
  briefIdx: 0,
  radarHover: -1,
  showBalInfo: false,
  authed: false,
  loginEmail: '',
  loginPw: '',
  profileSaved: '',
  profile: { name: '박지우', birth: '1999-03-12', gender: '남성', phone: '010-9907-4830', photo: null },
  showChallengeForm: false,
  chTitle: '',
  chMetric: '체지방률',
  chGoal: '-2.0%p',
  chPeriod: '4주',
  chScope: '전체 공개',
  chDone: '',
}
