import type { AppLanguage, ConfirmedBook } from "../types";

export type GuestWorkRelationship =
  | "documented_author"
  | "posthumous_compilation"
  | "traditional_attribution"
  | "poetic_corpus"
  | "collected_works"
  | "represented_subject"
  | "fictional_character";

export type GuestWorkForm =
  | "book"
  | "novel"
  | "play"
  | "poem"
  | "poetry_collection"
  | "treatise"
  | "essay"
  | "letters"
  | "lecture_notes"
  | "epic"
  | "collected_works";

interface AuthorPerspectiveDefaults {
  relationship: Exclude<
    GuestWorkRelationship,
    "represented_subject" | "fictional_character"
  >;
  workForm: GuestWorkForm;
  firstPersonFrame: Record<AppLanguage, string>;
}

export interface GuestWorkReference {
  canonicalTitle: string;
  titleAliases: string[];
  relationship: GuestWorkRelationship;
  workForm: GuestWorkForm;
  firstPersonFrame?: Record<AppLanguage, string>;
  verifiedAuthorAliases?: string[];
}

export interface GuestWorkProfile {
  personaId: string;
  creatorAliases: string[];
  defaultAuthorship?: AuthorPerspectiveDefaults;
  representativeWorks: GuestWorkReference[];
  sourceUrls: string[];
}

export interface GuestAuthorPerspective extends AuthorPerspectiveDefaults {
  personaId: string;
  canonicalTitle: string;
}

const frame = (en: string, ko: string): Record<AppLanguage, string> => ({ en, ko });

const documentedWork = (
  canonicalTitle: string,
  titleAliases: string[],
  workForm: GuestWorkForm,
  firstPersonFrame: Record<AppLanguage, string>,
): GuestWorkReference => ({
  canonicalTitle,
  titleAliases,
  relationship: "documented_author",
  workForm,
  firstPersonFrame,
});

const standardAuthor: AuthorPerspectiveDefaults = {
  relationship: "documented_author",
  workForm: "book",
  firstPersonFrame: frame("When I wrote this work", "내가 이 작품을 쓸 때"),
};

export const GUEST_WORK_PROFILES: GuestWorkProfile[] = [
  {
    personaId: "sappho",
    creatorAliases: ["Sappho", "Psappha", "사포"],
    defaultAuthorship: {
      relationship: "poetic_corpus",
      workForm: "poetry_collection",
      firstPersonFrame: frame(
        "In the songs and fragments that survive under my name",
        "내 이름으로 남은 노래와 단편에서는",
      ),
    },
    representativeWorks: [
      {
        canonicalTitle: "Sappho's surviving poetry",
        titleAliases: [
          "Sappho",
          "Poems of Sappho",
          "Selected Poems of Sappho",
          "사포 시집",
          "사포의 시",
        ],
        relationship: "poetic_corpus",
        workForm: "poetry_collection",
        firstPersonFrame: frame(
          "In the songs and fragments that survive under my name",
          "내 이름으로 남은 노래와 단편에서는",
        ),
      },
    ],
    sourceUrls: ["https://www.poetryfoundation.org/poets/sappho"],
  },
  {
    personaId: "mary-shelley",
    creatorAliases: ["Mary Shelley", "Mary Wollstonecraft Shelley", "메리 셸리"],
    defaultAuthorship: { ...standardAuthor, workForm: "novel" },
    representativeWorks: [
      documentedWork(
        "Frankenstein",
        ["Frankenstein", "Frankenstein; or, The Modern Prometheus", "프랑켄슈타인"],
        "novel",
        frame("When I wrote this story of a creator and his abandoned creation", "내가 창조자와 버려진 피조물의 이야기를 쓸 때"),
      ),
      documentedWork(
        "The Last Man",
        ["The Last Man", "최후의 인간"],
        "novel",
        frame("When I imagined the last witness to a collapsing world", "내가 무너지는 세계의 마지막 목격자를 그릴 때"),
      ),
    ],
    sourceUrls: ["https://www.bl.uk/works/frankenstein"],
  },
  {
    personaId: "william-shakespeare",
    creatorAliases: ["William Shakespeare", "Shakespeare", "윌리엄 셰익스피어", "셰익스피어"],
    defaultAuthorship: standardAuthor,
    representativeWorks: [
      documentedWork("Hamlet", ["Hamlet", "햄릿"], "play", frame("When I shaped these words for the stage", "내가 이 말을 무대 위의 행동으로 만들 때")),
      documentedWork("Macbeth", ["Macbeth", "맥베스"], "play", frame("When I shaped this ambition for the stage", "내가 이 야망을 무대 위의 행동으로 만들 때")),
      documentedWork("King Lear", ["King Lear", "리어 왕", "리어왕"], "play", frame("When I shaped this family conflict for the stage", "내가 이 가족의 충돌을 무대 위의 행동으로 만들 때")),
      documentedWork("The Tempest", ["The Tempest", "템페스트", "폭풍우"], "play", frame("When I shaped this reckoning for the stage", "내가 이 결산의 순간을 무대 위의 행동으로 만들 때")),
    ],
    sourceUrls: ["https://www.shakespeare.org.uk/explore-shakespeare/shakespedia/william-shakespeare/william-shakespeare-biography/"],
  },
  {
    personaId: "hans-christian-andersen",
    creatorAliases: ["Hans Christian Andersen", "H. C. Andersen", "한스 크리스티안 안데르센", "안데르센"],
    defaultAuthorship: { ...standardAuthor, workForm: "book", firstPersonFrame: frame("When I wrote this story", "내가 이 이야기를 쓸 때") },
    representativeWorks: [
      documentedWork("The Little Mermaid", ["The Little Mermaid", "인어공주", "인어 공주"], "book", frame("When I wrote this transformation", "내가 이 변신의 이야기를 쓸 때")),
      documentedWork("The Emperor's New Clothes", ["The Emperor's New Clothes", "벌거벗은 임금님", "벌거벗은 왕"], "book", frame("When I wrote this tale of public agreement", "내가 모두가 동의하는 척하는 이야기를 쓸 때")),
      documentedWork("The Ugly Duckling", ["The Ugly Duckling", "미운 오리 새끼", "미운 오리새끼"], "book", frame("When I wrote this outsider's transformation", "내가 이 주변인의 변화를 쓸 때")),
    ],
    sourceUrls: ["https://andersen.sdu.dk/vaerk/index_e.html"],
  },
  {
    personaId: "toni-morrison",
    creatorAliases: ["Toni Morrison", "토니 모리슨"],
    defaultAuthorship: { ...standardAuthor, workForm: "novel" },
    representativeWorks: [
      documentedWork("The Bluest Eye", ["The Bluest Eye", "가장 푸른 눈"], "novel", frame("When I wrote this story", "내가 이 이야기를 쓸 때")),
      documentedWork("Song of Solomon", ["Song of Solomon", "솔로몬의 노래"], "novel", frame("When I wrote this story", "내가 이 이야기를 쓸 때")),
      documentedWork("Beloved", ["Beloved", "빌러비드", "비러비드"], "novel", frame("When I wrote this story of memory that would not remain buried", "내가 묻힌 채 남지 않는 기억의 이야기를 쓸 때")),
      documentedWork("Jazz", ["Jazz", "재즈"], "novel", frame("When I wrote this story", "내가 이 이야기를 쓸 때")),
    ],
    sourceUrls: ["https://www.nobelprize.org/prizes/literature/1993/morrison/bibliography/"],
  },
  {
    personaId: "murasaki-shikibu",
    creatorAliases: ["Murasaki Shikibu", "Lady Murasaki", "무라사키 시키부"],
    defaultAuthorship: standardAuthor,
    representativeWorks: [
      documentedWork("The Tale of Genji", ["The Tale of Genji", "Genji Monogatari", "겐지 이야기", "겐지 모노가타리"], "novel", frame("When I composed this tale of court life", "내가 궁정의 삶을 이 이야기로 엮을 때")),
      documentedWork("The Diary of Lady Murasaki", ["The Diary of Lady Murasaki", "Murasaki Shikibu Diary", "무라사키 시키부 일기"], "book", frame("When I recorded these court days", "내가 궁정의 나날을 기록할 때")),
    ],
    sourceUrls: ["https://www.loc.gov/resource/gdcwdl.wdl_02930_001/"],
  },
  {
    personaId: "rabindranath-tagore",
    creatorAliases: ["Rabindranath Tagore", "Tagore", "라빈드라나트 타고르", "타고르"],
    defaultAuthorship: standardAuthor,
    representativeWorks: [
      documentedWork("Gitanjali", ["Gitanjali", "Song Offerings", "기탄잘리"], "poetry_collection", frame("When I gathered these songs", "내가 이 노래들을 엮을 때")),
      documentedWork("Gora", ["Gora", "고라"], "novel", frame("When I wrote this novel", "내가 이 소설을 쓸 때")),
      documentedWork("The Home and the World", ["The Home and the World", "Ghare-Baire", "집과 세계", "집과 세상"], "novel", frame("When I wrote this conflict between home and nation", "내가 집과 국가의 충돌을 쓸 때")),
      documentedWork("The Post Office", ["The Post Office", "Dakghar", "우체국"], "play", frame("When I shaped this longing for the stage", "내가 이 갈망을 무대 위의 이야기로 만들 때")),
    ],
    sourceUrls: ["https://www.nobelprize.org/prizes/literature/1913/tagore/biographical/"],
  },
  {
    personaId: "blaise-pascal",
    creatorAliases: ["Blaise Pascal", "Pascal", "블레즈 파스칼", "파스칼"],
    representativeWorks: [
      {
        canonicalTitle: "Pensées",
        titleAliases: ["Pensées", "Pensees", "팡세"],
        relationship: "posthumous_compilation",
        workForm: "collected_works",
        firstPersonFrame: frame("In the notes I left for an unfinished project", "내가 미완성의 구상을 위해 남긴 단상들에서는"),
      },
      documentedWork("The Provincial Letters", ["The Provincial Letters", "Lettres provinciales", "프로뱅시알", "시골 친구에게 보내는 편지"], "letters", frame("When I wrote these public letters", "내가 이 공개 서신들을 쓸 때")),
    ],
    sourceUrls: ["https://plato.stanford.edu/entries/pascal/"],
  },
  {
    personaId: "isaac-newton",
    creatorAliases: ["Isaac Newton", "Sir Isaac Newton", "아이작 뉴턴", "뉴턴"],
    defaultAuthorship: { ...standardAuthor, workForm: "treatise", firstPersonFrame: frame("When I set out this argument", "내가 이 논증을 정리할 때") },
    representativeWorks: [
      documentedWork("Philosophiæ Naturalis Principia Mathematica", ["Principia", "Mathematical Principles of Natural Philosophy", "프린키피아", "자연철학의 수학적 원리"], "treatise", frame("When I set out this mathematical argument", "내가 이 수학적 논증을 정리할 때")),
      documentedWork("Opticks", ["Opticks", "Optics", "광학"], "treatise", frame("When I organized these experiments on light", "내가 빛에 관한 이 실험들을 정리할 때")),
    ],
    sourceUrls: ["https://royalsociety.org/people/isaac-newton-12096/"],
  },
  {
    personaId: "charles-darwin",
    creatorAliases: ["Charles Darwin", "Charles Robert Darwin", "찰스 다윈", "다윈"],
    defaultAuthorship: { ...standardAuthor, workForm: "book", firstPersonFrame: frame("When I assembled the evidence for this work", "내가 이 저작의 증거를 모아 정리할 때") },
    representativeWorks: [
      documentedWork("On the Origin of Species", ["On the Origin of Species", "The Origin of Species", "Origin of Species", "종의 기원"], "treatise", frame("When I assembled the evidence for this argument", "내가 이 주장을 뒷받침할 증거를 모을 때")),
      documentedWork("The Descent of Man", ["The Descent of Man", "인간의 유래", "인간의 계보"], "treatise", frame("When I extended this inquiry to humanity", "내가 이 탐구를 인간에게까지 확장할 때")),
      documentedWork("The Voyage of the Beagle", ["The Voyage of the Beagle", "Journal of Researches", "비글호 항해기", "비글호 여행기"], "book", frame("When I shaped these observations into a journey", "내가 이 관찰들을 항해의 기록으로 엮을 때")),
    ],
    sourceUrls: ["https://www.darwinproject.ac.uk/letters/darwins-works-letters"],
  },
  {
    personaId: "sherlock-holmes",
    creatorAliases: [],
    representativeWorks: [
      { canonicalTitle: "A Study in Scarlet", titleAliases: ["A Study in Scarlet", "주홍색 연구"], relationship: "fictional_character", workForm: "novel", verifiedAuthorAliases: ["Arthur Conan Doyle", "아서 코난 도일"] },
      { canonicalTitle: "The Hound of the Baskervilles", titleAliases: ["The Hound of the Baskervilles", "바스커빌가의 개", "바스커빌 가문의 개"], relationship: "fictional_character", workForm: "novel", verifiedAuthorAliases: ["Arthur Conan Doyle", "아서 코난 도일"] },
    ],
    sourceUrls: ["https://www.britannica.com/topic/Sherlock-Holmes"],
  },
  {
    personaId: "socrates",
    creatorAliases: [],
    representativeWorks: [
      { canonicalTitle: "Apology", titleAliases: ["Apology", "Apology of Socrates", "소크라테스의 변명", "변명"], relationship: "represented_subject", workForm: "book", verifiedAuthorAliases: ["Plato", "플라톤"] },
      { canonicalTitle: "Phaedo", titleAliases: ["Phaedo", "파이돈"], relationship: "represented_subject", workForm: "book", verifiedAuthorAliases: ["Plato", "플라톤"] },
    ],
    sourceUrls: ["https://plato.stanford.edu/entries/socrates/"],
  },
  {
    personaId: "carl-jung",
    creatorAliases: ["Carl Jung", "Carl Gustav Jung", "C. G. Jung", "카를 융", "칼 융", "융"],
    defaultAuthorship: standardAuthor,
    representativeWorks: [
      documentedWork("Psychological Types", ["Psychological Types", "심리 유형", "심리유형"], "treatise", frame("When I set out these psychological distinctions", "내가 이 심리적 구분을 정리할 때")),
      documentedWork("Symbols of Transformation", ["Symbols of Transformation", "변환의 상징", "리비도의 변환과 상징"], "treatise", frame("When I traced these changing symbols", "내가 이 변화하는 상징들을 추적할 때")),
      {
        canonicalTitle: "The Red Book",
        titleAliases: ["The Red Book", "Liber Novus", "레드 북", "레드북"],
        relationship: "posthumous_compilation",
        workForm: "book",
        firstPersonFrame: frame("In the private record I left behind", "내가 남긴 사적인 기록에서는"),
      },
    ],
    sourceUrls: ["https://www.loc.gov/exhibits/red-book-of-carl-jung/jungs-cultural-legacy.html"],
  },
  {
    personaId: "jane-austen",
    creatorAliases: ["Jane Austen", "제인 오스틴"],
    defaultAuthorship: { ...standardAuthor, workForm: "novel", firstPersonFrame: frame("When I wrote this novel", "내가 이 소설을 쓸 때") },
    representativeWorks: [
      documentedWork("Sense and Sensibility", ["Sense and Sensibility", "이성과 감성"], "novel", frame("When I wrote this novel", "내가 이 소설을 쓸 때")),
      documentedWork("Pride and Prejudice", ["Pride and Prejudice", "오만과 편견"], "novel", frame("When I wrote this novel", "내가 이 소설을 쓸 때")),
      documentedWork("Mansfield Park", ["Mansfield Park", "맨스필드 파크"], "novel", frame("When I wrote this novel", "내가 이 소설을 쓸 때")),
      documentedWork("Emma", ["Emma", "엠마"], "novel", frame("When I wrote this novel", "내가 이 소설을 쓸 때")),
      documentedWork("Northanger Abbey", ["Northanger Abbey", "노생거 사원", "노생거 애비"], "novel", frame("When I wrote this novel", "내가 이 소설을 쓸 때")),
      documentedWork("Persuasion", ["Persuasion", "설득"], "novel", frame("When I wrote this novel", "내가 이 소설을 쓸 때")),
    ],
    sourceUrls: ["https://janeaustens.house/jane-austen/"],
  },
  {
    personaId: "adam-smith",
    creatorAliases: ["Adam Smith", "애덤 스미스", "아담 스미스"],
    defaultAuthorship: { ...standardAuthor, workForm: "treatise", firstPersonFrame: frame("When I developed this argument", "내가 이 논의를 전개할 때") },
    representativeWorks: [
      documentedWork("The Theory of Moral Sentiments", ["The Theory of Moral Sentiments", "Theory of Moral Sentiments", "도덕감정론", "도덕 감정론"], "treatise", frame("When I examined how people form moral judgments", "내가 사람들이 도덕적 판단을 형성하는 방식을 살필 때")),
      documentedWork("The Wealth of Nations", ["The Wealth of Nations", "An Inquiry into the Nature and Causes of the Wealth of Nations", "국부론", "국가의 부"], "treatise", frame("When I examined how commercial society creates and distributes wealth", "내가 상업 사회가 부를 만들고 나누는 방식을 살필 때")),
      {
        canonicalTitle: "Lectures on Jurisprudence",
        titleAliases: ["Lectures on Jurisprudence", "법학 강의"],
        relationship: "posthumous_compilation",
        workForm: "lecture_notes",
        firstPersonFrame: frame("In the lectures later preserved in student notes", "후대에 학생들의 필기로 남은 내 강의에서는"),
      },
    ],
    sourceUrls: ["https://www.gla.ac.uk/explore/adamsmith300/explorelearn/ideas/keyworks/"],
  },
  {
    personaId: "homer",
    creatorAliases: ["Homer", "호메로스"],
    representativeWorks: [
      { canonicalTitle: "Iliad", titleAliases: ["Iliad", "The Iliad", "일리아스"], relationship: "traditional_attribution", workForm: "epic", firstPersonFrame: frame("In the epic handed down under my name", "내 이름으로 전해진 이 서사시에서는") },
      { canonicalTitle: "Odyssey", titleAliases: ["Odyssey", "The Odyssey", "오디세이", "오디세이아"], relationship: "traditional_attribution", workForm: "epic", firstPersonFrame: frame("In the homecoming song handed down under my name", "내 이름으로 전해진 이 귀환의 노래에서는") },
    ],
    sourceUrls: ["https://www.britannica.com/biography/Homer-Greek-poet"],
  },
  {
    personaId: "machiavelli",
    creatorAliases: ["Niccolò Machiavelli", "Niccolo Machiavelli", "Machiavelli", "니콜로 마키아벨리", "마키아벨리"],
    defaultAuthorship: { ...standardAuthor, workForm: "treatise" },
    representativeWorks: [
      documentedWork("The Prince", ["The Prince", "Il Principe", "군주론"], "treatise", frame("When I wrote this book", "내가 이 책을 쓸 때")),
      documentedWork("Discourses on Livy", ["Discourses on Livy", "Discourses on the First Ten Books of Titus Livy", "로마사 논고", "리비우스 논고"], "treatise", frame("When I developed this republican argument", "내가 이 공화정의 논의를 전개할 때")),
      documentedWork("The Art of War", ["The Art of War", "Dell'arte della guerra", "전쟁술", "전술론"], "treatise", frame("When I set out this argument about arms and institutions", "내가 군대와 제도에 관한 이 논의를 정리할 때")),
      documentedWork("The Mandrake", ["The Mandrake", "Mandragola", "만드라골라"], "play", frame("When I shaped this deception for the stage", "내가 이 기만을 무대 위의 행동으로 만들 때")),
      documentedWork("Florentine Histories", ["Florentine Histories", "Istorie Fiorentine", "피렌체사", "피렌체 역사"], "book", frame("When I wrote this history of Florence", "내가 피렌체의 역사를 쓸 때")),
    ],
    sourceUrls: ["https://plato.stanford.edu/entries/machiavelli/"],
  },
  {
    personaId: "plutarch",
    creatorAliases: ["Plutarch", "Plutarch of Chaeronea", "플루타르코스", "플루타르크"],
    defaultAuthorship: standardAuthor,
    representativeWorks: [
      { canonicalTitle: "Parallel Lives", titleAliases: ["Parallel Lives", "Plutarch's Lives", "플루타르코스 영웅전", "플루타르크 영웅전", "영웅전"], relationship: "collected_works", workForm: "collected_works", firstPersonFrame: frame("When I placed these lives beside one another", "내가 이 인물들의 생애를 서로 나란히 놓을 때") },
      { canonicalTitle: "Moralia", titleAliases: ["Moralia", "모랄리아", "윤리론집"], relationship: "collected_works", workForm: "collected_works", firstPersonFrame: frame("Across the essays later gathered as Moralia", "후대에 《모랄리아》로 묶인 여러 논고에서는") },
    ],
    sourceUrls: ["https://academic.oup.com/reference/62365/reference-article-abstract/559666165"],
  },
  {
    personaId: "octavia-butler",
    creatorAliases: ["Octavia E. Butler", "Octavia Butler", "옥타비아 버틀러"],
    defaultAuthorship: { ...standardAuthor, workForm: "novel", firstPersonFrame: frame("When I wrote this story", "내가 이 이야기를 쓸 때") },
    representativeWorks: [
      documentedWork("Kindred", ["Kindred", "킨", "킨드레드"], "novel", frame("When I wrote this story", "내가 이 이야기를 쓸 때")),
      documentedWork("Parable of the Sower", ["Parable of the Sower", "씨앗을 뿌리는 사람의 우화", "씨 뿌리는 자의 우화"], "novel", frame("When I wrote this survival story", "내가 이 생존의 이야기를 쓸 때")),
      documentedWork("Lilith's Brood", ["Lilith's Brood", "Xenogenesis", "제노제네시스", "릴리스 브루드"], "novel", frame("When I wrote this encounter with forced interdependence", "내가 강제된 상호의존의 만남을 쓸 때")),
    ],
    sourceUrls: ["https://www.octaviabutler.com/work-1"],
  },
  {
    personaId: "sor-juana",
    creatorAliases: ["Sor Juana Inés de la Cruz", "Sor Juana Ines de la Cruz", "Sor Juana", "소르 후아나 이네스 데 라 크루스", "소르 후아나"],
    defaultAuthorship: standardAuthor,
    representativeWorks: [
      documentedWork("Primero sueño", ["Primero sueño", "First Dream", "첫 번째 꿈", "첫 꿈"], "poem", frame("When I wrote this long dream of the mind reaching for knowledge", "내가 지성이 앎에 닿으려는 이 긴 꿈을 쓸 때")),
      documentedWork("Respuesta a Sor Filotea de la Cruz", ["Respuesta a Sor Filotea de la Cruz", "Response to Sor Filotea", "소르 필로테아에게 보내는 답변"], "letters", frame("When I wrote this defense of a woman's right to learn", "내가 여성이 배울 권리를 옹호하는 이 답변을 쓸 때")),
    ],
    sourceUrls: ["https://www.poetryfoundation.org/poets/sor-juana"],
  },
  {
    personaId: "ibn-khaldun",
    creatorAliases: ["Ibn Khaldun", "Ibn Khaldūn", "Abd al-Rahman ibn Khaldun", "이븐 할둔", "이븐 칼둔"],
    defaultAuthorship: { ...standardAuthor, workForm: "treatise", firstPersonFrame: frame("When I developed this historical inquiry", "내가 이 역사적 탐구를 전개할 때") },
    representativeWorks: [
      documentedWork("Muqaddimah", ["Muqaddimah", "Al-Muqaddimah", "Prolegomena", "무깟디마", "무카디마", "역사서설"], "treatise", frame("When I examined the recurring conditions of civilization", "내가 문명이 반복해서 만들어지는 조건을 살필 때")),
      documentedWork("Kitāb al-ʿIbar", ["Kitāb al-ʿIbar", "Kitab al-Ibar", "Book of Lessons", "키타브 알이바르", "성찰의 책"], "book", frame("When I assembled this history", "내가 이 역사를 엮을 때")),
    ],
    sourceUrls: ["https://www.britannica.com/biography/Ibn-Khaldun"],
  },
];

const AUTHOR_PERSPECTIVE_RELATIONSHIPS = new Set<GuestWorkRelationship>([
  "documented_author",
  "posthumous_compilation",
  "traditional_attribution",
  "poetic_corpus",
  "collected_works",
]);

function normalizeMatchValue(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function matchesAlias(value: string, aliases: string[]): boolean {
  const normalized = normalizeMatchValue(value);
  return aliases.some((alias) => normalizeMatchValue(alias) === normalized);
}

export function resolveGuestAuthorPerspective(
  personaId: string,
  book: ConfirmedBook,
): GuestAuthorPerspective | undefined {
  if (book.verificationStatus !== "verified") return undefined;

  const profile = GUEST_WORK_PROFILES.find((candidate) => candidate.personaId === personaId);
  if (!profile) return undefined;

  const titles = [book.title, ...book.includedTitles];
  const explicitWork = profile.representativeWorks.find((work) =>
    titles.some((title) => matchesAlias(title, [work.canonicalTitle, ...work.titleAliases])),
  );
  const acceptedAuthors = explicitWork?.verifiedAuthorAliases ?? profile.creatorAliases;
  const authorMatches = acceptedAuthors.length > 0 && matchesAlias(book.author, acceptedAuthors);

  if (
    explicitWork &&
    authorMatches &&
    explicitWork.firstPersonFrame &&
    AUTHOR_PERSPECTIVE_RELATIONSHIPS.has(explicitWork.relationship)
  ) {
    return {
      personaId,
      canonicalTitle: explicitWork.canonicalTitle,
      relationship: explicitWork.relationship as AuthorPerspectiveDefaults["relationship"],
      workForm: explicitWork.workForm,
      firstPersonFrame: explicitWork.firstPersonFrame,
    };
  }

  if (!authorMatches || !profile.defaultAuthorship) return undefined;
  return {
    personaId,
    canonicalTitle: book.title,
    ...profile.defaultAuthorship,
  };
}
